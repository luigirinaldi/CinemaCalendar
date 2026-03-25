import {
    CinemaShowing,
    CinemaShowingsSchema,
    FilmShowings,
    Cinema,
} from '../types';
import { parse } from 'node-html-parser';
import { chromium } from 'playwright-chromium';

const CINEMA_NAME = 'BFI Southbank';
const LOG_PREFIX = '[' + CINEMA_NAME + ']';
const BASE_URL = 'https://whatson.bfi.org.uk/Online';
const FILMS_INDEX_URL = BASE_URL + '/article/filmsindex';

const CINEMA: Cinema = {
    name: CINEMA_NAME,
    location: 'London',
    coordinates: {
        lat: `51° 30' 18.36" N`,
        lng: `0° 6' 48.60" W`,
    },
    defaultLanguage: 'en-GB',
};

export async function scraper(): Promise<CinemaShowing[]> {
    const browser = await chromium.launch();
    const context = await browser.newContext({
        userAgent:
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    await page.goto(FILMS_INDEX_URL, { waitUntil: 'networkidle', timeout: 60000 });
    const indexHtml = await page.content();
    await browser.close();

    const indexRoot = parse(indexHtml);

    // Film links are in div.Rich-text ul li a[href^="article/"]
    const filmShowings: FilmShowings[] = [];
    const seenUrls = new Set<string>();

    const richText = indexRoot.querySelector('div.Rich-text');
    const links = richText ? richText.querySelectorAll('a[href]') : indexRoot.querySelectorAll('a[href]');

    for (const a of links) {
        const href = a.getAttribute('href') ?? '';
        if (!href.startsWith('article/')) continue;

        const url = `${BASE_URL}/${href}`;
        if (seenUrls.has(url)) continue;
        seenUrls.add(url);

        const title = a.innerText.trim().replace(/\s+/g, ' ');
        if (!title) continue;

        filmShowings.push({ film: { title, url }, showings: [] });
    }

    console.log(`${LOG_PREFIX} Found ${filmShowings.length} films`);

    return [{ cinema: CINEMA, showings: filmShowings }];
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
