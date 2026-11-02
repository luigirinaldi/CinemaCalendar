import 'dotenv/config';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { DB } from './database';
import { z } from 'zod';
import { parse } from 'node-html-parser';
import { fetchPage, mapConcurrent } from './http';
import { mkdir, writeFile } from 'node:fs/promises';

interface Film {
    id: number;
    title: string;
    release_year: number | null;
    director: string | null;
    duration: number | null;
    default_lang: string;
}

// Zod strips unknown API fields (e.g. softcore) before database insertion.
export const TMDBMovieSchema = z.object({
    adult: z.boolean(),
    backdrop_path: z.string().nullable(),
    genre_ids: z.array(z.number()),
    id: z.number().int().positive(),
    original_language: z.string(),
    original_title: z.string(),
    overview: z.string(),
    popularity: z.number(),
    poster_path: z.string().nullable(),
    release_date: z.string(),
    title: z.string(),
    video: z.boolean(),
    vote_average: z.number(),
    vote_count: z.number(),
});
export type TMDBMovie = z.infer<typeof TMDBMovieSchema>;

const API_URL = 'https://api.themoviedb.org/3';
const movieSearchSchema = z.object({ results: z.array(TMDBMovieSchema) });
const personSearchSchema = z.object({
    results: z.array(z.object({ id: z.number(), popularity: z.number() })),
});

async function requestTMDB(path: string, params: Record<string, string>) {
    if (!process.env.TMDB_API_KEY) throw new Error('Missing TMDB_API_KEY');
    const url = new URL(API_URL + path);
    url.search = new URLSearchParams(params).toString();
    // Four workers, at most about 32 requests/second even on a fast connection.
    await new Promise((resolve) => setTimeout(resolve, 125));
    const response = await fetchPage(url, {
        headers: {
            accept: 'application/json',
            Authorization: 'Bearer ' + process.env.TMDB_API_KEY,
        },
    });
    return response.json() as Promise<unknown>;
}

/** Remove screening annotations without reducing a double bill to one film. */
export function cleanTMDBTitle(title: string): string {
    return parse(title)
        .textContent.replace(/[\u2019\u2018]/g, "'")
        .replace(
            /^(?:(?:(?:UK|London) )?premiere|special preview|preview|kids'? club|closing night):\s*/i,
            ''
        )
        .replace(/^.+?\s+presents:?\s+/i, '')
        .replace(
            /\s*(?:\+|w\/|with)\s+(?:special\s+)?(?:Q&A|(?:pre-)?recorded\s+.*?intro|live organ|intro(?:duction)?|discussion|panel)\b.*$/i,
            ''
        )
        .replace(
            /\s*\((?:\d{4}|(?:\d+(?:st|nd|rd|th)\s+)?anniversary|RIED\.[^)]*|4K restoration)\)/gi,
            ''
        )
        .replace(/\s*\[(?:UK premiere|extended cut|dubbed)\]/gi, '')
        .replace(
            /\s*(?::|[\u2013-])\s*(?:UK premiere|4K restoration|Lingua originale)\s*$/i,
            ''
        )
        .trim();
}

function comparableTitle(title: string) {
    return cleanTMDBTitle(title)
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/[^\p{L}\p{N}]/gu, '')
        .toLowerCase();
}

export async function getTMDB(film: Film): Promise<TMDBMovie | null> {
    if (!process.env.TMDB_API_KEY) throw new Error('Missing TMDB_API_KEY');
    if (film.director) {
        const people = personSearchSchema.parse(
            await requestTMDB('/search/person', { query: film.director })
        );
        const director = people.results.reduce<
            (typeof people.results)[number] | undefined
        >(
            (best, person) =>
                !best || person.popularity > best.popularity ? person : best,
            undefined
        );
        if (director) {
            const params: Record<string, string> = {
                language: film.default_lang,
                sort_by: 'popularity.desc',
                with_crew: String(director.id),
            };
            if (film.duration)
                params['with_runtime.gte'] = String(
                    Math.max(0, film.duration - 10)
                );
            if (film.release_year) params.year = String(film.release_year);
            const discover = movieSearchSchema.parse(
                await requestTMDB('/discover/movie', params)
            );
            const title = comparableTitle(film.title);
            const match = discover.results.find(
                (movie) =>
                    title &&
                    (title === comparableTitle(movie.title) ||
                        title === comparableTitle(movie.original_title))
            );
            if (match) return match;
        }
    }
    const titles = [
        ...new Set([cleanTMDBTitle(film.title), film.title].filter(Boolean)),
    ];
    for (const title of titles) {
        const params: Record<string, string> = { query: title, page: '1' };
        if (film.release_year) params.year = String(film.release_year);
        let search = movieSearchSchema.parse(
            await requestTMDB('/search/movie', params)
        );
        if (!search.results.length && film.release_year) {
            delete params.year;
            search = movieSearchSchema.parse(
                await requestTMDB('/search/movie', params)
            );
        }
        if (search.results.length) return search.results[0];
    }
    return null;
}

async function updateFilmMetadata(db: Kysely<DB>) {
    if (!process.env.TMDB_API_KEY) throw new Error('Missing TMDB_API_KEY');
    const CHUNK_DEFAULT_SIZE = 100;

    let tmdb_null_films = 0;
    const lookupCache = new Map<string, Promise<TMDBMovie | null>>();
    const unmatched: {
        id: number;
        title: string;
        release_year: number | null;
    }[] = [];
    const errors: { id: number; title: string; error: string }[] = [];

    let film_data = await db
        .selectFrom('new_films')
        .innerJoin('new_cinemas', 'new_films.cinema_id', 'new_cinemas.id')
        .select([
            'new_films.id',
            'title',
            'release_year',
            'director',
            'duration',
            'default_lang',
        ])
        .where('tmdb_id', 'is', null)
        .orderBy('new_films.id')
        .limit(CHUNK_DEFAULT_SIZE)
        .execute();

    tmdb_null_films += film_data.length;

    let cursor = CHUNK_DEFAULT_SIZE;
    const tmdb_objs: TMDBMovie[] = [];
    const tmdb_ids = new Set(); // update TMDB metadata only once (avoid useless multiple updates on the same row)
    const updated_films: {
        id: number;
        title: string;
        tmdb_id: number | null;
    }[] = [];

    while (film_data.length > 0) {
        // ask to the TMDB API
        const tmdb_update = (
            await mapConcurrent(
                film_data,
                async (film) => {
                    try {
                        const key = JSON.stringify([
                            film.title,
                            film.release_year,
                            film.director,
                            film.duration,
                            film.default_lang,
                        ]);
                        let lookup = lookupCache.get(key);
                        if (!lookup) {
                            lookup = getTMDB(film);
                            lookupCache.set(key, lookup);
                        }
                        const tmdbData = await lookup;
                        if (!tmdbData)
                            unmatched.push({
                                id: film.id,
                                title: film.title,
                                release_year: film.release_year,
                            });
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
                        errors.push({
                            id: film.id,
                            title: film.title,
                            error: e instanceof Error ? e.message : String(e),
                        });
                        return {
                            id: film.id,
                            title: film.title,
                            tmdb_id: null,
                        };
                    }
                },
                4
            )
        ).filter((film) => film.tmdb_id !== null); // Remove films where tmdb wasn't updated

        updated_films.push(...tmdb_update);
        console.log(
            `TMDB checked ${updated_films.length + unmatched.length + errors.length} films (${updated_films.length} matched)`
        );

        film_data = await db
            .selectFrom('new_films')
            .innerJoin('new_cinemas', 'new_films.cinema_id', 'new_cinemas.id')
            .select([
                'new_films.id',
                'title',
                'release_year',
                'director',
                'duration',
                'default_lang',
            ])
            .where('tmdb_id', 'is', null)
            .orderBy('new_films.id')
            .offset(cursor)
            .limit(CHUNK_DEFAULT_SIZE)
            .execute();
        cursor += CHUNK_DEFAULT_SIZE;
        tmdb_null_films += film_data.length;
    }

    await mkdir('.scraper-debug', { recursive: true });
    const reportPath = `.scraper-debug/tmdb-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    await writeFile(
        reportPath,
        JSON.stringify(
            {
                processed: tmdb_null_films,
                matched: updated_films.length,
                unmatched,
                errors,
            },
            null,
            2
        )
    );
    console.log(
        `TMDB: ${updated_films.length} matched, ${unmatched.length} unmatched, ${errors.length} failed. Report: ${reportPath}`
    );
    for (const entry of errors.slice(0, 5))
        console.error(`TMDB ${entry.title}: ${entry.error}`);

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
            throw new Error('Failed to save TMDB metadata', { cause: error });
        }
    }

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
            throw new Error('Failed to save TMDB IDs', { cause: error });
        }
    }
    if (errors.length)
        throw new Error(
            `TMDB lookup failed for ${errors.length} films; see ${reportPath}`
        );
}

export { updateFilmMetadata };
