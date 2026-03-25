import { DateTime } from 'luxon';
import {
    CinemaShowing,
    CinemaShowingsSchema,
    FilmShowings,
    Cinema,
} from '../types';
import { chromium, BrowserContext } from 'playwright-chromium';

const CINEMA_NAME = 'BFI Southbank';
const LOG_PREFIX = '[' + CINEMA_NAME + ']';
const BASE_URL = 'https://whatson.bfi.org.uk/Online';
const FILMS_INDEX_URL = BASE_URL + '/article/filmsindex';
const CONCURRENCY_LIMIT = 10;
const LONDON_TZ = 'Europe/London';

const CINEMA: Cinema = {
    name: CINEMA_NAME,
    location: 'London',
    coordinates: {
        lat: `51° 30' 18.36" N`,
        lng: `0° 6' 48.60" W`,
    },
    defaultLanguage: 'en-GB',
};

// e.g. "Dir. Director Name 1985. ..." or "Country 1985. ..."
const RELEASE_YEAR_RE = /^[a-zA-Z -]+ (?<year>(19\d\d)|2[012]\d\d)\..*$/;

interface ArticleContext {
    searchNames: string[];
    searchResults: unknown[][];
}

type Semaphore = { count: number; queue: Array<() => void> };

function createSemaphore(limit: number): Semaphore {
    return { count: limit, queue: [] };
}

function acquire(sem: Semaphore): Promise<void> {
    return new Promise((resolve) => {
        if (sem.count > 0) {
            sem.count--;
            resolve();
        } else {
            sem.queue.push(resolve);
        }
    });
}

function release(sem: Semaphore): void {
    if (sem.queue.length > 0) {
        sem.queue.shift()!();
    } else {
        sem.count++;
    }
}

function parseStartDate(dateStr: string): string | undefined {
    // Try ISO first
    let dt = DateTime.fromISO(dateStr, { zone: LONDON_TZ });
    if (dt.isValid) return dt.toISO() ?? undefined;

    // Try "dd/MM/yyyy HH:mm:ss" (Spektrix format)
    dt = DateTime.fromFormat(dateStr, 'dd/MM/yyyy HH:mm:ss', { zone: LONDON_TZ });
    if (dt.isValid) return dt.toISO() ?? undefined;

    // Try "dd/MM/yyyy HH:mm"
    dt = DateTime.fromFormat(dateStr, 'dd/MM/yyyy HH:mm', { zone: LONDON_TZ });
    if (dt.isValid) return dt.toISO() ?? undefined;

    // Try "cccc d MMMM yyyy HH:mm" e.g. "Tuesday 25 March 2026 18:00"
    dt = DateTime.fromFormat(dateStr, 'cccc d MMMM yyyy HH:mm', { zone: LONDON_TZ });
    if (dt.isValid) return dt.toISO() ?? undefined;

    return undefined;
}

async function processFilm(
    context: BrowserContext,
    filmUrl: string,
    filmTitle: string,
    sem: Semaphore
): Promise<FilmShowings> {
    await acquire(sem);
    console.log(`Trying to parse ${filmUrl}`)
    const page = await context.newPage();
    try {
        await page.goto(filmUrl, { waitUntil: 'load', timeout: 60000 });
        let pageHTML = await page.innerHTML('body')
        console.log(`${filmTitle} finished loading`, pageHTML)
        // Extract articleContext JS variable (Spektrix ticketing data)
        let articleContext: ArticleContext | null = null;
        try {
            articleContext = await page.evaluate(
                () => (window as unknown as { articleContext?: ArticleContext }).articleContext ?? null
            );
        } catch {
            // Page has no articleContext, showings will be empty
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
            // No image found
        }

        // Extract release year from film info
        let year: number | undefined;
        try {
            const infos = await page
                .locator('p.Film-info__information__value')
                .allInnerTexts();
            for (const info of infos) {
                const match = info.match(RELEASE_YEAR_RE);
                if (match?.groups?.year) {
                    year = parseInt(match.groups.year);
                    break;
                }
            }
        } catch {
            // No year found
        }

        const showings: FilmShowings['showings'] = [];

        if (articleContext?.searchNames && articleContext?.searchResults) {
            const { searchNames, searchResults } = articleContext;
            for (const row of searchResults) {
                const listing = Object.fromEntries(
                    searchNames.map((name, i) => [name, row[i]])
                );
                const startDateStr = listing['start_date'];
                if (!startDateStr) continue;

                const startTime = parseStartDate(String(startDateStr));
                if (!startTime) {
                    console.warn(
                        `${LOG_PREFIX} Could not parse date "${startDateStr}" for "${filmTitle}"`
                    );
                    continue;
                }
                showings.push({ startTime, bookingUrl: filmUrl });
            }
        }

        return { film: { title: filmTitle, url: filmUrl, year, coverUrl }, showings };
    } finally {
        await page.close();
        release(sem);
    }
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
        await indexPage.goto(FILMS_INDEX_URL, { waitUntil: 'networkidle', timeout: 60000 });

        const filmLinks: { url: string; title: string }[] = [];
        const seenUrls = new Set<string>();

        const links = indexPage.locator('div.Rich-text a[href]');
        const count = await links.count();

        for (let i = 0; i < count; i++) {
            const a = links.nth(i);
            const href = (await a.getAttribute('href')) ?? '';
            if (!href.startsWith('article/')) continue;

            const url = `${BASE_URL}/${href}`;
            if (seenUrls.has(url)) continue;
            seenUrls.add(url);

            const title = (await a.innerText()).trim().replace(/\s+/g, ' ');
            if (!title) continue;

            filmLinks.push({ url, title });
        }

        await indexPage.close();
        console.log(`${LOG_PREFIX} Found ${filmLinks.length} films`);

        // Process all film pages concurrently (limited by semaphore)
        const sem = createSemaphore(CONCURRENCY_LIMIT);

        const filmShowings = await Promise.all(
            filmLinks.slice(0,5).map(({ url, title }) => processFilm(context, url, title, sem))
        );

        const withShowings = filmShowings.filter((fs) => fs.showings.length > 0);
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
