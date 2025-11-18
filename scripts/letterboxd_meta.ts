import { Kysely, RawBuilder, sql } from 'kysely';
import { connectDB, DB } from './database';

import { parse } from 'node-html-parser';

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

    // Extract average rating
    const avgRating = root
        .querySelector('.average-rating a.display-rating')
        ?.text.trim();

    // Extract total number of ratings from the title attribute
    const ratingElement = root.querySelector(
        '.average-rating a.display-rating'
    );
    const titleText = ratingElement?.getAttribute('title') || '';
    const totalMatch = titleText.match(/based on ([\d,]+) ratings/);
    const totalRatings = totalMatch
        ? parseInt(totalMatch[1].replace(/,/g, ''))
        : 0;

    // Extract individual rating counts
    const ratingBars = root.querySelectorAll('.rating-histogram-bar a.tooltip');
    const ratingsByValue: { [key: number]: number } = {};

    // Map star ratings to numeric values (0-10 scale, half stars as 0.5 increments)
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
        // Match pattern like "1,623 ★★★★ ratings (32%)"
        const match = title.match(/([\d,]+)\s+(.*?)\s+ratings/);

        if (match) {
            const count = parseInt(match[1].replace(/,/g, ''));
            const stars = match[2];

            // Convert to 0-10 scale (multiply by 2)
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

export async function updateLetterboxdMeta(db: Kysely<DB>, doUpdate = false) {
    // Get films from tmdb table which don't have letterboxd info
    // Fetch the letterboxd url and make it redirect to the corresponding letterboxd slug
    // Try and extract the average rating, and maybe the number of ratings

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

    nullLtbxdFilms = nullLtbxdFilms.slice(0, 43);

    let letterboxdInfo: LetterboxdInfo[] = [];
    const STRIDE = 5;
    for (let i = 0; i < nullLtbxdFilms.length; i += STRIDE) {
        letterboxdInfo = letterboxdInfo.concat(
            (
                await Promise.all(
                    nullLtbxdFilms.slice(i, i + STRIDE).map(async (film) => {
                        try {
                            let slug: string | undefined = undefined;
                            if (film.letterboxd_slug !== null) {
                                slug = film.letterboxd_slug;
                            } else {
                                const response = await fetch(
                                    `https://letterboxd.com/tmdb/${film.id}`
                                );
                                if (!response.ok)
                                    throw new Error(
                                        `Response not ok: ${response.status} ${response.statusText}`
                                    );
                                // extract slug as the last section of the url: **/slug/
                                slug = response.url
                                    .split('/')
                                    .filter(Boolean)
                                    .at(-1);
                            }
                            if (slug === undefined)
                                throw new Error('Slug is undefined');
                            if (!isNaN(Number(slug)))
                                throw new Error(`Slug is a number: ${slug}`);
                            try {
                                const ratings_response = await fetch(
                                    `https://letterboxd.com/csi/film/${slug}/ratings-summary/`
                                );
                                const ratings_info = extractRatings(
                                    await ratings_response.text()
                                );
                                return {
                                    film_id: film.id,
                                    slug,
                                    ratings_info,
                                };
                            } catch (e) {
                                console.error(
                                    `Failed to retrieve ratings info for ${film.title} (slug=${slug})`
                                );
                                console.error(e);
                                return {
                                    film_id: film.id,
                                    slug,
                                };
                            }
                        } catch (e) {
                            console.error(
                                `Failed to fetch letterboxd info for film ${film.title} (id=${film.id})`
                            );
                            console.error(e.message);
                            return null;
                        }
                    })
                )
            ).filter((i) => i !== null)
        );
        const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        await delay(1000);
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
                        letterboxdInfo.map((info) => {
                            return { id: info.film_id, value: info.slug };
                        }),
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
    console.log('Running as script');
    const db = await connectDB();

    await updateLetterboxdMeta(db, true);

    await db.destroy();
}
