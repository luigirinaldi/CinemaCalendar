import 'dotenv/config';
import type { Movie } from '../src/types';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { DB } from './database';

type Film = {
    id: number;
    title: string;
    release_year: number | null;
    director: string | null;
};
type TMDBObj = {
    adult: boolean;
    backdrop_path: string | null;
    genre_ids: number[];
    id: number;
    original_language: string;
    original_title: string;
    overview: string;
    popularity: number;
    poster_path: string | null;
    release_date: string; // format: YYYY-MM-DD
    title: string;
    video: boolean;
    vote_average: number;
    vote_count: number;
};
type TMDBSearch = {
    page: number;
    results: TMDBObj[];
    total_pages: number;
    total_results: number;
};

// TODO: add search by director
async function getTMDB(
    film: Film,
    verbose: boolean = false
): Promise<TMDBObj | null> {
    if (!film.release_year) {
        // if there is no release date, set the current year as fallback
        film.release_year = new Date().getFullYear();
    }
    const search = await searchOnTMDB(film, verbose);
    if (!search || search.total_results == 0) {
        if (verbose)
            console.error(
                `No TMDB results for ${film.title} (${film.release_year})`
            );
        return null;
    }
    const TMDBMovie = search.results[0];
    // try to find the best match among multiple results
    // if (search.results.length > 1) {
    //     TMDBMovie = await guessMovie(search, film);
    // }
    return TMDBMovie;
}

async function searchOnTMDB(
    film: Film,
    verbose: boolean
): Promise<TMDBSearch | null> {
    if (process.env.TMDB_API_KEY === undefined) {
        throw new Error('Missing Supabase Project ID');
    }

    const OPTIONS = {
        method: 'GET',
        headers: {
            accept: 'application/json',
            Authorization: 'Bearer ' + process.env.TMDB_API_KEY,
        }, // kindly don't steal this access token for your personal use, instead get one for free at https://www.themoviedb.org/settings/api
    };

    const title = film.title;
    for (let i = 0; i < 3; i++) {
        // I use year because it seems the search engine is more flexible with it and it is less prone to mismatch,
        // if it doesn't work, it could be useful retrying with primary_release_year instead of year
        let res = await fetch(
            `https://api.themoviedb.org/3/search/movie?query=${encodeURI(title)}&include_adult=true&year=${film.release_year}&page=1`,
            OPTIONS
        );
        let search: TMDBSearch = await res.json();
        if (typeof search !== 'undefined') {
            if (search.total_results == 0) {
                // found no results
                // If there are no results, we try to match without the release date.
                res = await fetch(
                    `https://api.themoviedb.org/3/search/movie?query=${encodeURI(title)}&include_adult=true&page=1`,
                    OPTIONS
                );
                search = await res.json();
            }
            if (search.total_results != 0) {
                return search;
            }
        }
    }
    // if (verbose)
    //     console.error(
    //         `Failed to get TMDB results for ${film.title} (${film.release_year})`
    //     );
    return null;
}

/**
 * Tries to fix the horrible TMDB search algorithm through a series of filters on the results.
 * @param search - The TMDB API response object.
 * @param film - The Movie object.
 */
async function guessMovie(search: TMDBSearch, film: Film): Promise<TMDBObj> {
    // The first check is title exact match, as it is the most reliable.
    // If there are no results, we try to match the release date.
    // Year match is skipped as it is highly unreliable.
    let results = search.results.filter((movie) => movie.title == film.title);
    if (results.length == 0) {
        results = search.results.filter(
            (movie) =>
                parseInt(movie.release_date.slice(0, 4)) == film.release_year
        );
        if (results.length == 0) {
            return search.results[0];
        }
    } else if (results.length > 1) {
        let filtered = results.filter(
            (movie) =>
                parseInt(movie.release_date.slice(0, 4)) == film.release_year
        );
        if (filtered.length == 0) {
            filtered = results;
        }
        if (filtered.length > 1) {
            // Filters out fakes or duplicates (yes, they can appear in the wrong order...).
            return filtered.reduce((max, movie) =>
                movie.popularity > max.popularity ? movie : max
            );
        }
        return filtered[0];
    }
    return results[0];
}

async function updateFilmMetadata(db: Kysely<DB>) {
    // pick a lower number if TMDB API blocks some requests
    const CHUNK_DEFAULT_SIZE = 100;

    let tmdb_null_films = 0;

    let film_data = await db
        .selectFrom('new_films')
        .select(['id', 'title', 'release_year', 'director'])
        .where('tmdb_id', 'is', null)
        .limit(CHUNK_DEFAULT_SIZE)
        .execute();

    tmdb_null_films += film_data.length;

    let cursor = CHUNK_DEFAULT_SIZE;
    const tmdb_objs: TMDBObj[] = [];
    const tmdb_ids = new Set(); // update TMDB metadata only once (avoid useless multiple updates on the same row)
    const updated_films: {
        id: number;
        title: string;
        tmdb_id: number | null;
    }[] = [];

    while (film_data.length > 0) {
        // ask to the TMDB API
        const tmdb_update = (
            await Promise.all(
                film_data.map(async (film) => {
                    try {
                        const tmdbData = await getTMDB(film, true);
                        if (tmdbData && !tmdb_ids.has(tmdbData.id)) {
                            tmdb_objs.push(tmdbData);
                            tmdb_ids.add(tmdbData.id);
                        }
                        return {
                            id: film.id,
                            title: film.title,
                            tmdb_id: tmdbData?.id || null,
                        };
                    } catch (e) {
                        console.error(
                            `Something went wrong getting TMDB info for ${film.title} (${film.release_year})`
                        );
                        console.error(e);
                        return {
                            id: film.id,
                            title: film.title,
                            tmdb_id: null,
                        };
                    }
                })
            )
        ).filter((film) => film.tmdb_id !== null); // Remove films where tmdb wasn't updated

        updated_films.push(...tmdb_update);

        film_data = await db
            .selectFrom('new_films')
            .select(['id', 'title', 'release_year', 'director']) // add duration filter?
            .where('tmdb_id', 'is', null)
            .offset(cursor)
            .limit(CHUNK_DEFAULT_SIZE)
            .execute();
        cursor += CHUNK_DEFAULT_SIZE;
        tmdb_null_films += film_data.length;
    }

    console.log(`Found ${tmdb_null_films} movies with missing tmdb ids`);
    console.log(
        `Identified ${tmdb_objs.length} new tmdb entries, ${tmdb_objs.length == 0 ? 0 : tmdb_objs.length / tmdb_null_films} of total missing ids`
    );

    // Update entries in TMDB table
    if (tmdb_objs.length > 0) {
        try {
            const insertResult = await db
                .insertInto('tmdb_films')
                .values(tmdb_objs)
                .onConflict((oc) => oc.doNothing())
                .execute();
            console.log('TMDB metadata update: SUCCESS');
            console.log(
                `Inserted ${insertResult[0].numInsertedOrUpdatedRows} new tmdb movies`
            );
        } catch (error) {
            console.error('TMDB metadata error:', error);
            return; // avoid updating TMDB ids on film rows without first updating TMDB metadata
        }
    }

    console.log(
        `Identified ${updated_films.length} to update, ${updated_films.length == 0 ? 0 : updated_films.length / tmdb_null_films} of total movies missing ids`
    );

    // Update the new_films with their TMDB IDs
    if (updated_films.length > 0) {
        try {
            const updateMap = new Map(
                updated_films.map((f) => [f.id, f.tmdb_id])
            );
            const ids = Array.from(updateMap.keys());

            const insertResult = await db
                .updateTable('new_films')
                .set({
                    tmdb_id: sql<number | null>`CASE ${sql.raw(
                        ids
                            .map(
                                (id) =>
                                    `WHEN id = ${id} THEN ${updateMap.get(id)}`
                            )
                            .join(' ')
                    )} ELSE tmdb_id END`,
                })
                .where('id', 'in', ids)
                .execute();
            console.log('TMDB id update: SUCCESS');
            console.log(
                `Updated ${insertResult[0].numUpdatedRows} ids in the films table`
            );
        } catch (error) {
            console.error('TMDB id update error:', error);
        }
    }
}

export { updateFilmMetadata };

// (async () => {
//     // Example usage
//     const film: Movie = { id: '1', title: `ADRA`, release_date: '', duration: 148 };
//     const tmdbData = await getTMDB(film);
//     console.log(tmdbData);
// })();
