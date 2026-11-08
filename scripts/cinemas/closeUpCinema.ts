import { fetchPage, mapConcurrent } from '../http';
import {
    CinemaShowing,
    CinemaShowingsSchema,
    FilmShowings,
    Film,
    Cinema,
} from '../types';
import { parse } from 'node-html-parser';
import { DateTime } from 'luxon';
import { chromium, type BrowserContext } from 'playwright-chromium';
import { loadProgrammePage, isProgrammeAccessCheck } from '../browserProgramme';

const CINEMA_NAME = 'Close-UP';
const LOG_PREFIX = '[' + CINEMA_NAME + ']';
const BASE_URL = 'https://www.closeupfilmcentre.com';

const CINEMA: Cinema = {
    name: CINEMA_NAME,
    location: 'London',
    website: 'https://www.closeupfilmcentre.com',
    coordinates: {
        lat: `51° 31' 25.00396" N`,
        lng: `- 0° 4' 19.382" W`,
    },
    defaultLanguage: 'en-GB',
};

/** Detail pages have reliable titles even when the calendar feed has null/partial ones. */
function parseFilmPage(html: string) {
    const root = parse(html);
    const content = root.querySelector('#film_program_support') ?? root;
    const films: Partial<Film>[] = [];
    for (const paragraph of content.querySelectorAll('p')) {
        const heading = paragraph.querySelector('strong');
        const title = heading?.textContent.trim();
        if (!title) continue;
        const text = paragraph.textContent.trim();
        if (!text.startsWith(title)) continue;
        const metadata = text
            .slice(title.length)
            .trim()
            .match(/^(.+),\s*(\d{4}),\s*(\d+)\s*min\b/i);
        if (!metadata) continue;
        films.push({
            title,
            director: metadata[1].trim(),
            year: Number(metadata[2]),
            duration: Number(metadata[3]),
        });
    }
    const pageTitle = root
        .querySelector('title')
        ?.textContent.replace(/^CLOSE-UP\s*\|\s*/i, '')
        .trim();
    const imgSrc = content
        .querySelector('img[src*="/download_file/view_inline"]')
        ?.getAttribute('src');
    return {
        films,
        pageTitle,
        coverUrl: imgSrc ? new URL(imgSrc, BASE_URL).href : undefined,
    };
}

interface CalendarSource {
    html: string;
    context?: BrowserContext;
    close: () => Promise<void>;
}

async function calendarHtml(): Promise<CalendarSource> {
    const url = BASE_URL + '/search_film_programmes/';
    let blockedStatus: number | undefined;
    try {
        const html = await (await fetchPage(url)).text();
        if (
            parse(html)
                .querySelectorAll('script')
                .some((script) => /\bvar\s+shows\s*=/.test(script.textContent))
        )
            return { html, close: async () => {} };
        // Some interstitials respond with HTTP 200; others inject the calendar later.
        if (isProgrammeAccessCheck(html)) blockedStatus = 200;
    } catch (error) {
        if (!(error instanceof Error) || !error.message.startsWith('HTTP 403 '))
            throw error;
        blockedStatus = 403;
    }
    try {
        const browser = await chromium.launch();
        try {
            const context = await browser.newContext();
            const page = await context.newPage();
            await loadProgrammePage(
                page,
                url,
                () =>
                    Array.from(document.scripts).some((script) =>
                        /\bvar\s+shows\s*=/.test(script.textContent ?? '')
                    ),
                `${LOG_PREFIX} Calendar`
            );
            return {
                html: await page.content(),
                context,
                close: () => browser.close(),
            };
        } catch (error) {
            await browser.close();
            throw error;
        }
    } catch (cause) {
        if (cause instanceof Error && cause.message.includes('access denied'))
            throw cause;
        if (blockedStatus)
            throw new Error(
                `${LOG_PREFIX} Calendar access denied (HTTP ${blockedStatus}). The website's access check did not complete; existing stored screenings are retained.`,
                { cause }
            );
        throw cause;
    }
}

export async function scraper(): Promise<CinemaShowing[]> {
    const source = await calendarHtml();
    try {
        return await scrapeCalendar(source);
    } finally {
        await source.close();
    }
}

async function scrapeCalendar(
    source: CalendarSource
): Promise<CinemaShowing[]> {
    const root = parse(source.html);
    const scriptTag = root
        .querySelectorAll('script')
        .find((s) => /\bvar\s+shows\s*=/.test(s.innerText));
    if (!scriptTag)
        throw new Error("Could not find <script> containing 'var shows'");
    const showsMatch = scriptTag.innerText.match(/var\s+shows\s*=\s*'(.*?)';/s);
    if (!showsMatch) throw new Error('Could not extract shows JSON');
    const showsRaw = showsMatch[1].replace(/\\"/g, '"').replace(/\\\//g, '/');
    const shows: {
        title: string | null;
        blink: string | null;
        show_time: string;
        film_url: string;
    }[] = JSON.parse(showsRaw);

    // Fetch each programme once; multiple sessions may share its detail page.
    const urls = [
        ...new Set(shows.map((s) => new URL(s.film_url, BASE_URL).href)),
    ];
    const details = new Map(
        await mapConcurrent(urls, async (url) => {
            try {
                let html: string;
                try {
                    html = await (await fetchPage(url)).text();
                } catch (error) {
                    if (
                        !source.context ||
                        !(error instanceof Error) ||
                        !error.message.startsWith('HTTP 403 ')
                    )
                        throw error;
                    // Keep the browser session that successfully loaded the calendar.
                    const page = await source.context.newPage();
                    try {
                        await loadProgrammePage(
                            page,
                            url,
                            () =>
                                document.querySelector(
                                    '#film_program_support'
                                ) !== null,
                            `${LOG_PREFIX} Film details`
                        );
                        html = await page.content();
                    } finally {
                        await page.close();
                    }
                }
                return [url, parseFilmPage(html)] as const;
            } catch (error) {
                console.error(
                    `${LOG_PREFIX} Could not fetch film details: ${url}`,
                    error
                );
                return [url, undefined] as const;
            }
        })
    );
    const filmShowings: FilmShowings[] = [];
    for (const show of shows) {
        const url = new URL(show.film_url, BASE_URL).href;
        const detail = details.get(url);
        const listedTitle = show.title
            ? parse(show.title).textContent.trim()
            : '';
        // A single-film page supplies the canonical title. Programme pages can
        // contain several films, so retain their distinct session titles.
        const metadata =
            detail?.films.length === 1
                ? detail.films[0]
                : detail?.films.find((film) => film.title === listedTitle);
        const title = metadata?.title || listedTitle || detail?.pageTitle;
        if (!title) {
            console.warn(`${LOG_PREFIX} Skipping untitled screening: ${url}`);
            continue;
        }
        const startTime = DateTime.fromFormat(
            show.show_time,
            'yyyy-MM-dd HH:mm:ss',
            {
                zone: 'Europe/London',
                locale: 'en-GB',
            }
        ).toISO();
        if (!startTime) {
            console.warn(
                `${LOG_PREFIX} Failed to parse start time: ${show.show_time}`
            );
            continue;
        }
        const showing = { startTime, bookingUrl: show.blink || undefined };
        const existing = filmShowings.find(
            (f) => f.film.url === url && f.film.title === title
        );
        if (existing) existing.showings.push(showing);
        else
            filmShowings.push({
                film: { ...metadata, title, url, coverUrl: detail?.coverUrl },
                showings: [showing],
            });
    }
    return [{ cinema: CINEMA, showings: filmShowings }];
}

async function main() {
    const result = await scraper();
    console.log(CinemaShowingsSchema.parse(result));
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}
