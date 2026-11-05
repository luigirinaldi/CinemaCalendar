// Inspired by and adapted from the cinescrapers project by Joeboy:
// https://github.com/Joeboy/cinescrapers/blob/main/src/cinescrapers/scrapers/bfi/scrape.py
import { DateTime } from 'luxon';
import {
    CinemaShowing,
    CinemaShowingsSchema,
    FilmShowings,
    Cinema,
} from '../types';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { BrowserContext } from 'playwright-chromium';
import { loadProgrammePage } from '../browserProgramme';
import { mapConcurrent } from '../http';
import { parse } from 'node-html-parser';
import { z } from 'zod';

chromium.use(StealthPlugin());

const CINEMA_NAME = 'BFI Southbank';
const LOG_PREFIX = '[' + CINEMA_NAME + ']';
const BASE_URL = 'https://whatson.bfi.org.uk/Online';
const FILMS_INDEX_URL = BASE_URL + '/article/filmsindex';
const CONCURRENCY_LIMIT = 4;
const MAX_RETRIES = 2;
const TEST_LIMIT = process.env.BFI_TEST_LIMIT
    ? parseInt(process.env.BFI_TEST_LIMIT)
    : undefined;
const LONDON_TZ = 'Europe/London';

const CINEMA: Cinema = {
    name: CINEMA_NAME,
    location: 'London',
    website: 'https://www.bfi.org.uk/bfi-southbank',
    coordinates: {
        lat: `51° 30' 18.36" N`,
        lng: `0° 6' 48.60" W`,
    },
    defaultLanguage: 'en-GB',
};

// e.g. "USA 2001. 159min" or "UK 2025. 123min. Total running time 150min"
const COUNTRY_YEAR_DURATION_RE =
    /^(?<country>[A-Za-z][A-Za-z\s]*?)\s+(?<year>(?:19|20)\d{2})\.\s*(?<duration>\d+)min/;

interface FilmInfo {
    director?: string;
    year?: number;
    duration?: number;
    country?: string;
    language?: string;
}

interface ArticleContext {
    searchNames: string[];
    searchResults: unknown[][];
}

const ArticleContextSchema = z.object({
    searchNames: z.array(z.string()),
    searchResults: z.array(z.array(z.unknown())),
});

export function parseBfiShowings(
    source: unknown,
    filmUrl: string
): FilmShowings['showings'] {
    const { searchNames, searchResults } = ArticleContextSchema.parse(source);
    const dateIndex = searchNames.indexOf('start_date');
    if (searchResults.length && dateIndex < 0)
        throw new Error(
            `${LOG_PREFIX} Programme has no start_date column: ${filmUrl}`
        );
    return searchResults.map((row) => {
        const raw = row[dateIndex];
        const startTime =
            typeof raw === 'string' ? parseStartDate(raw) : undefined;
        if (!startTime)
            throw new Error(
                `${LOG_PREFIX} Invalid screening date ${JSON.stringify(raw)}: ${filmUrl}`
            );
        return { startTime, bookingUrl: filmUrl };
    });
}

export function parseBfiFilmLinks(
    html: string
): { url: string; title: string }[] {
    const films = new Map<string, { url: string; title: string }>();
    for (const link of parse(html).querySelectorAll('div.Rich-text a[href]')) {
        const url = new URL(link.getAttribute('href')!, BASE_URL + '/');
        if (
            url.origin !== new URL(BASE_URL).origin ||
            !/^\/Online\/article\/[^/]+\/?$/.test(url.pathname)
        )
            continue;
        const title = link.textContent.trim().replace(/\s+/g, ' ');
        if (!title) continue;
        url.hash = '';
        films.set(url.href, { url: url.href, title });
    }
    if (!films.size)
        throw new Error(`${LOG_PREFIX} Film index has no usable film links`);
    return [...films.values()];
}

async function extractFilmInfo(
    page: Awaited<ReturnType<BrowserContext['newPage']>>
): Promise<FilmInfo> {
    const info: FilmInfo = {};
    const wrappers = page.locator('li.Film-info__information__wrapper');
    const count = await wrappers.count();

    for (let i = 0; i < count; i++) {
        const li = wrappers.nth(i);
        const heading = (
            await li
                .locator('p.Film-info__information__heading')
                .textContent()
                .catch(() => null)
        )?.trim();
        const value = (
            await li
                .locator('p.Film-info__information__value')
                .textContent()
                .catch(() => null)
        )?.trim();
        if (!value) continue;

        if (heading === 'Director' || heading === 'Directors') {
            info.director = value;
        } else if (!heading) {
            const match = value.match(COUNTRY_YEAR_DURATION_RE);
            if (match?.groups) {
                info.country = match.groups.country.trim();
                info.year = parseInt(match.groups.year);
                info.duration = parseInt(match.groups.duration);
            } else if (value.toLowerCase().includes('subtitles')) {
                info.language = value;
            }
        }
    }

    return info;
}

function parseStartDate(dateStr: string): string | undefined {
    // A calendar date alone must never turn into an invented midnight screening.
    if (!/\d{1,2}:\d{2}/.test(dateStr)) return undefined;
    // Try ISO first
    let dt = DateTime.fromISO(dateStr, { zone: LONDON_TZ });
    if (dt.isValid) return dt.toISO() ?? undefined;

    // Try "dd/MM/yyyy HH:mm:ss" (Spektrix format)
    dt = DateTime.fromFormat(dateStr, 'dd/MM/yyyy HH:mm:ss', {
        zone: LONDON_TZ,
    });
    if (dt.isValid) return dt.toISO() ?? undefined;

    // Try "dd/MM/yyyy HH:mm"
    dt = DateTime.fromFormat(dateStr, 'dd/MM/yyyy HH:mm', { zone: LONDON_TZ });
    if (dt.isValid) return dt.toISO() ?? undefined;

    // Try "cccc d MMMM yyyy HH:mm" e.g. "Tuesday 25 March 2026 18:00"
    dt = DateTime.fromFormat(dateStr, 'cccc d MMMM yyyy HH:mm', {
        zone: LONDON_TZ,
    });
    if (dt.isValid) return dt.toISO() ?? undefined;

    return undefined;
}

async function processFilm(
    context: BrowserContext,
    filmUrl: string,
    filmTitle: string
): Promise<FilmShowings> {
    for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
        if (attempt > 1) {
            console.log(
                `${LOG_PREFIX} Retry ${attempt - 1}/${MAX_RETRIES}: "${filmTitle}"`
            );
        } else {
            console.log(
                `${LOG_PREFIX} Processing: "${filmTitle}" (${filmUrl})`
            );
        }
        const page = await context.newPage();
        try {
            await loadProgrammePage(
                page,
                filmUrl,
                () => {
                    const context = (
                        window as unknown as { articleContext?: ArticleContext }
                    ).articleContext;
                    return (
                        Array.isArray(context?.searchNames) &&
                        Array.isArray(context?.searchResults)
                    );
                },
                `${LOG_PREFIX} Film "${filmTitle}"`
            );

            // Extract articleContext JS variable (Spektrix ticketing data)
            let articleContext: ArticleContext | null = null;
            try {
                articleContext = await page.evaluate(
                    () =>
                        (
                            window as unknown as {
                                articleContext?: ArticleContext;
                            }
                        ).articleContext ?? null
                );
            } catch (e) {
                console.warn(
                    `${LOG_PREFIX} Could not evaluate articleContext for "${filmTitle}": ${e}`
                );
            }

            if (!articleContext) {
                if (attempt <= MAX_RETRIES) {
                    console.warn(
                        `${LOG_PREFIX} No articleContext for "${filmTitle}" (attempt ${attempt}) — likely blocked, retrying`
                    );
                    continue;
                }
                throw new Error(
                    `${LOG_PREFIX} Missing articleContext for "${filmTitle}" after ${attempt} attempts`
                );
            }

            // Extract cover image
            let coverUrl: string | undefined;
            try {
                const imgSrc = await page
                    .locator('img.Media__image')
                    .first()
                    .getAttribute('src', { timeout: 3000 });
                if (imgSrc) {
                    coverUrl = imgSrc.startsWith('http')
                        ? imgSrc
                        : `https://whatson.bfi.org.uk${imgSrc}`;
                }
            } catch {
                console.warn(`${LOG_PREFIX} No cover image for "${filmTitle}"`);
            }

            // Extract director, country, year, duration, language from Film-info__information
            const filmInfo = await extractFilmInfo(page).catch((e) => {
                console.warn(
                    `${LOG_PREFIX} Error extracting film info for "${filmTitle}": ${e}`
                );
                return {} as FilmInfo;
            });
            if (filmInfo.year === undefined) {
                console.warn(
                    `${LOG_PREFIX} Could not find release year for "${filmTitle}"`
                );
            }

            const showings = parseBfiShowings(articleContext, filmUrl);

            console.log(
                `${LOG_PREFIX} "${filmTitle}": ${showings.length} showings parsed`
            );
            return {
                film: { title: filmTitle, url: filmUrl, coverUrl, ...filmInfo },
                showings,
            };
        } catch (error) {
            if (
                attempt > MAX_RETRIES ||
                (error instanceof Error &&
                    error.message.includes('access denied'))
            )
                throw error;
            console.warn(
                `${LOG_PREFIX} Failed to load "${filmTitle}"; retrying`,
                error
            );
        } finally {
            await page.close();
        }
    }

    // Unreachable but required for TypeScript
    throw new Error(`${LOG_PREFIX} Failed to load "${filmTitle}"`);
}

export async function scraper(): Promise<CinemaShowing[]> {
    const browser = await chromium.launch();

    try {
        const context = await browser.newContext({
            userAgent:
                'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        });

        // Scrape index page for film links
        const indexPage = await context.newPage();
        await loadProgrammePage(
            indexPage,
            FILMS_INDEX_URL,
            () =>
                document.querySelector('div.Rich-text a[href*="article/"]') !==
                null,
            `${LOG_PREFIX} Film index`
        );

        const filmLinks = parseBfiFilmLinks(await indexPage.content());

        await indexPage.close();
        console.log(`${LOG_PREFIX} Found ${filmLinks.length} films`);

        const filmsToProcess =
            TEST_LIMIT !== undefined
                ? filmLinks.slice(0, TEST_LIMIT)
                : filmLinks;
        if (TEST_LIMIT !== undefined) {
            console.log(
                `${LOG_PREFIX} Test mode: processing ${filmsToProcess.length} of ${filmLinks.length} films`
            );
        }

        // Drain in-flight pages before closing their shared browser on failure.
        const failures: unknown[] = [];
        const results = await mapConcurrent(
            filmsToProcess,
            async ({ url, title }) => {
                if (failures.length) return undefined;
                try {
                    return await processFilm(context, url, title);
                } catch (error) {
                    failures.push(error);
                    return undefined;
                }
            },
            CONCURRENCY_LIMIT
        );
        if (failures.length) throw failures[0];
        const filmShowings = results.filter(
            (film): film is FilmShowings => film !== undefined
        );

        const withShowings = filmShowings.filter(
            (fs) => fs.showings.length > 0
        );
        console.log(
            `${LOG_PREFIX} ${withShowings.length}/${filmShowings.length} films have showings`
        );

        return [{ cinema: CINEMA, showings: withShowings }];
    } finally {
        await browser.close();
    }
}

async function main() {
    console.log('Running as main script');
    const result = await scraper();
    const trustedResult = CinemaShowingsSchema.parse(result);
    console.log(JSON.stringify(trustedResult, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}
