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

const CINEMA_NAME = 'Close-UP';
const LOG_PREFIX = '[' + CINEMA_NAME + ']';
const BASE_URL = 'https://www.closeupfilmcentre.com';

const CINEMA: Cinema = {
    name: CINEMA_NAME,
    location: 'London',
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

export async function scraper(): Promise<CinemaShowing[]> {
    const response = await fetchPage(
        BASE_URL + '/search_film_programmes/'
    ).catch((error: unknown) => {
        if (error instanceof Error && error.message.startsWith('HTTP 403 '))
            throw new Error(
                `${LOG_PREFIX} Calendar access denied (HTTP 403). The website is refusing this request; existing stored screenings are retained.`,
                { cause: error }
            );
        throw error;
    });
    const root = parse(await response.text());
    const scriptTag = root
        .querySelectorAll('script')
        .find((s) => s.innerText.includes('var shows'));
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
                const page = await fetchPage(url);
                return [url, parseFilmPage(await page.text())] as const;
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
