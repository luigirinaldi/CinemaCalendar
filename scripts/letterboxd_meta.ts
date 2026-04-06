import { Kysely, RawBuilder, sql } from 'kysely';
import { connectDB, DB } from './database';

import { parse } from 'node-html-parser';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Page } from 'playwright-chromium';

chromium.use(StealthPlugin());

interface RatingsData {
    averageRating: number;
    totalRatings: number;
    ratingsByValue: { [key: number]: number };
}

interface LetterboxdInfo {
    film_id: number;
    slug: string;
    ratings_info?: RatingsData;
}

function extractRatings(html: string): RatingsData {
    const root = parse(html);

    const avgRating = root
        .querySelector('.average-rating a.display-rating')
        ?.text.trim();

    const ratingElement = root.querySelector(
        '.average-rating a.display-rating'
    );
    const titleText = ratingElement?.getAttribute('title') || '';
    const totalMatch = titleText.match(/based on ([\d,]+) ratings/);
    const totalRatings = totalMatch
        ? parseInt(totalMatch[1].replace(/,/g, ''))
        : 0;

    const ratingBars = root.querySelectorAll('.rating-histogram-bar a.tooltip');
    const ratingsByValue: { [key: number]: number } = {};

    const starToValue: { [key: string]: number } = {
        'half-★': 0.5,
        '★': 1,
        '★½': 1.5,
        '★★': 2,
        '★★½': 2.5,
        '★★★': 3,
        '★★★½': 3.5,
        '★★★★': 4,
        '★★★★½': 4.5,
        '★★★★★': 5,
    };

    ratingBars.forEach((bar) => {
        const title = bar.getAttribute('title') || '';
        const match = title.match(/([\d,]+)\s+(.*?)\s+ratings/);
        if (match) {
            const count = parseInt(match[1].replace(/,/g, ''));
            const stars = match[2];
            const value = starToValue[stars] * 2;
            ratingsByValue[value] = count;
        }
    });

    return {
        averageRating: parseFloat(avgRating || '0'),
        totalRatings,
        ratingsByValue,
    };
}

function buildCaseStatement(
    items: { id: number; value: string | number | object }[],
    column: string
): RawBuilder<DB> {
    return sql`CASE
    ${sql.join(
        items
            .filter((item) => item.value !== undefined)
            .map((item) => sql`WHEN id = ${item.id} THEN ${item.value}`),
        sql` `
    )}
    ELSE ${sql.ref(column)}
  END`;
}

async function fetchFilmInfo(
    page: Page,
    film: { id: number; title: string; letterboxd_slug: string | null }
): Promise<LetterboxdInfo | null> {
    try {
        let slug: string | undefined = undefined;
        if (film.letterboxd_slug !== null) {
            slug = film.letterboxd_slug;
        } else {
            // Navigate and wait for JS redirect to complete — letterboxd.com/tmdb/{id}
            // redirects via JavaScript to the actual film page
            await page.goto(`https://letterboxd.com/tmdb/${film.id}`, {
                waitUntil: 'domcontentloaded',
                timeout: 20000,
            });
            // Wait until URL moves away from the /tmdb/ path (JS redirect)
            await page.waitForURL((url) => !url.pathname.startsWith('/tmdb/'), {
                timeout: 20000,
            });
            slug = page.url().split('/').filter(Boolean).at(-1);
        }
        if (slug === undefined) throw new Error('Slug is undefined');

        try {
            await page.goto(
                `https://letterboxd.com/csi/film/${slug}/ratings-summary/`,
                { waitUntil: 'domcontentloaded', timeout: 15000 }
            );
            const ratings_info = extractRatings(await page.content());
            return { film_id: film.id, slug, ratings_info };
        } catch (e) {
            console.error(
                `Failed to retrieve ratings info for ${film.title} (slug=${slug})`
            );
            console.error(e);
            return { film_id: film.id, slug };
        }
    } catch (e) {
        console.error(
            `Failed to fetch letterboxd info for film ${film.title} (id=${film.id})`
        );
        console.error(e.message);
        return null;
    }
}

export async function updateLetterboxdMeta(db: Kysely<DB>, doUpdate = false) {
    let nullLtbxdFilms = await db
        .selectFrom('tmdb_films')
        .where((cond) =>
            cond('letterboxd_slug', 'is', null).or(
                'letterboxd_avg_rating',
                'is',
                null
            )
        )
        .select(['id', 'title', 'letterboxd_slug'])
        .execute();

    console.log(
        `Found ${nullLtbxdFilms.length} movies with no letterboxd info`
    );

    if (!doUpdate) {
        nullLtbxdFilms = nullLtbxdFilms.slice(0, 10);
    }

    const browser = await chromium.launch();
    let letterboxdInfo: LetterboxdInfo[] = [];

    try {
        const context = await browser.newContext();
        const STRIDE = 2;
        const pages = await Promise.all(
            Array.from({ length: STRIDE }, () => context.newPage())
        );

        for (let i = 0; i < nullLtbxdFilms.length; i += STRIDE) {
            const batch = nullLtbxdFilms.slice(i, i + STRIDE);
            const results = await Promise.all(
                batch.map((film, j) => fetchFilmInfo(pages[j], film))
            );
            letterboxdInfo = letterboxdInfo.concat(
                results.filter((r) => r !== null)
            );
            if (i + STRIDE < nullLtbxdFilms.length) {
                await new Promise((resolve) => setTimeout(resolve, 1500));
            }
        }
    } finally {
        await browser.close();
    }

    console.log(
        `Successfully scraped letterboxd info for ${letterboxdInfo.length} movies (${(letterboxdInfo.length / nullLtbxdFilms.length) * 100}% of ${nullLtbxdFilms.length} candidate movies)`
    );

    if (letterboxdInfo.length > 0 && doUpdate) {
        const insertResult = await db.transaction().execute(async (trx) => {
            console.log('updating db');
            return trx
                .updateTable('tmdb_films')
                .set({
                    letterboxd_slug: buildCaseStatement(
                        letterboxdInfo.map((info) => ({
                            id: info.film_id,
                            value: info.slug,
                        })),
                        'letterboxd_slug'
                    ),
                })
                .where(
                    'id',
                    'in',
                    letterboxdInfo.map((i) => i.film_id)
                )
                .execute();
        });

        console.log(insertResult);
    }
}

// Run only if the file is being run as a script
if (import.meta.url === `file://${process.argv[1]}`) {
    const doUpdate = !process.argv.includes('--test');
    console.log(`Running as script (doUpdate=${doUpdate})`);
    const db = await connectDB();
    await updateLetterboxdMeta(db, doUpdate);
    await db.destroy();
}
