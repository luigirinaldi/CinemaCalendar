import { readdirSync } from 'fs';
import {
    ScraperFunction,
    FilmShowing,
    CinemaShowing,
    CinemaShowingsSchema,
} from './types';

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database, Tables } from '../database.types';

import { Kysely, PostgresDialect, Transaction } from 'kysely';
import { KyselifyDatabase } from 'kysely-supabase';
import { Pool } from 'pg';

import 'dotenv/config';
import { DateTime } from 'luxon';
import { ZodError } from 'zod';

type DB = KyselifyDatabase<Database>;

function movie_hash(f: FilmShowing) {
    return `${f.name}|${f.duration}|${f.tmdbId}`;
}

async function storeCinemaData(
    trx: Transaction<DB>,
    cinemaShowing: CinemaShowing
) {
    const LOG_PREFIX = '[main][' + cinemaShowing.cinema.name + ']';
    // Insert cinema into
    const now = DateTime.now().toISO().toString();
    const { id: cinemaId } = await trx
        .insertInto('new_cinemas')
        .values({ ...cinemaShowing.cinema, last_updated: now })
        .onConflict((oc) =>
            oc.column('name').doUpdateSet({ last_updated: now })
        )
        .returning('id')
        .executeTakeFirstOrThrow(
            () =>
                new Error(
                    `Couldn't get cinema information for ${cinemaShowing.cinema.name}`
                )
        );

    // Get Films corresponding to this cinema
    let films = await trx
        .selectFrom('new_films')
        .selectAll()
        .where('cinema_id', '=', cinemaId)
        .execute();

    const filmsToInsert = cinemaShowing.showings
        .map((s) => s.film)
        .filter(
            (film) =>
                films.find(
                    (f) => film.title === f.title && film.url === f.url
                ) === undefined
        )
        .map((film) => {
            return {
                cinema_id: cinemaId,
                country: film.country,
                cover_url: null,
                director: film.director,
                duration: film.duration,
                language: film.language,
                release_year: film.year,
                title: film.title,
                url: film.url,
            };
        });

    if (filmsToInsert.length > 0) {
        const newlyAddedFilms = await trx
            .insertInto('new_films')
            .values(filmsToInsert)
            .returningAll()
            .execute();
        films = films.concat(newlyAddedFilms);
        console.log(
            `${LOG_PREFIX}🎦 Inserted ${newlyAddedFilms.length} new movies`
        );
    } else {
        console.log(`${LOG_PREFIX} No new movies to insert`);
    }

    // Get showings
    const showings = await trx
        .selectFrom('new_showings')
        .selectAll()
        .where('cinema_id', '=', cinemaId)
        .execute();

    const showingsToInsert = cinemaShowing.showings.flatMap((filmShowing) => {
        const film = filmShowing.film;
        const filmId = films.find((f) => f.title === film.title)?.id;

        if (filmId === undefined)
            throw new Error(
                `${LOG_PREFIX} Couldn't find id for film after inserting it: ${film.title}`
            );

        return filmShowing.showings
            .filter(
                (show) =>
                    showings.find(
                        (s) =>
                            show.startTime === s.start_time &&
                            s.film_id === filmId &&
                            (s.booking_url === undefined ||
                                show.bookingUrl === s.booking_url)
                    ) === undefined
            )
            .map((showing) => {
                return {
                    booking_url: showing.bookingUrl,
                    cinema_id: cinemaId,
                    film_id: filmId,
                    start_time: showing.startTime,
                };
            });
    });

    if (showingsToInsert.length > 0) {
        const newlyAddedShowings = await trx
            .insertInto('new_showings')
            .values(showingsToInsert)
            .returning('id')
            .execute();
        console.log(
            `${LOG_PREFIX}🎦 Inserted ${newlyAddedShowings.length} new showings`
        );
    } else {
        console.log(`${LOG_PREFIX} No new showings to insert`);
    }
}

async function scrapeAndStore(
    name: string,
    fun: ScraperFunction,
    db: Kysely<DB>
) {
    const rawResult = await fun();
    const trustedResult = CinemaShowingsSchema.parse(rawResult);
    console.log(`[main] Successfully scraped and parsed data from ${name}`);
    for (const cinema of trustedResult) {
        await db
            .transaction()
            .execute(async (trx) => await storeCinemaData(trx, cinema));
    }
    console.log(`[main] DB update for ${name} completed`);
}

// db.transaction().execute()

//     result.forEach(async cinemaShowing => {
//         const cinema = cinemaShowing.cinema
//         // Upsert, if row exists update it
//         const cinema_insert = await db
//         .from('new_cinemas')
//         .upsert(
//                 {
//                     name: cinema.name,
//                     location: cinema.location,
//                     last_updated: new Date().toISOString(),
//                 },
//                 { onConflict: 'name,location' }
//             )
//             .select();

//             if (!cinema_insert.data || cinema_insert.data.length === 0) {
//                 throw new Error(
//                     `Upserted cinema returned no data for ${cinema.name}`
//                 );
//         }
//         const cinema_id = cinema_insert.data[0].id;

//         const film_data = await db.from('new_films').select();
//         if (!film_data.data) {
//             throw new Error('No film data returned');
//         }

//         const unique_movies = new Map(
//             cinema.showings.map((f) => [
//                 movie_hash(f),
//                 {
//                     title: f.name,
//                     duration_minutes: f.duration,
//                     tmdb_id: f.tmdbId,
//                 },
//             ])
//         );

//         const movies_to_add = [];
//         const movies_added: Map<string, number> = new Map();

//         for (const [movie_key, movie] of unique_movies) {
//             const movie_exists = film_data.data.find(
//                 (val) =>
//                     val.title == movie.title &&
//                 val.duration_minutes == movie.duration_minutes
//             );
//             if (movie_exists === undefined) {
//                 movies_to_add.push(movie);
//             } else {
//                 movies_added.set(movie_key, movie_exists.id);
//             }
//         }

//         console.log(
//             `[${cinema.name}] Found ${unique_movies.size} unique movies`
//         );
//         if (movies_to_add.length > 0) {
//             // Insert the new movies and request the inserted rows back with .select()
//             const insert_films = await db
//             .from('new_films')
//             .insert(movies_to_add)
//                 .select();
//                 if (insert_films.error !== null) {
//                     throw new Error(
//                         `[${cinema.name}] Insert produced an error: ${insert_films.error}`
//                     );
//                 }
//                 if (!insert_films.data) {
//                     throw new Error(
//                         `[${cinema.name}] Insert returned no movie data`
//                     );
//                 }

//                 // Populate the movies_added map with the newly inserted rows so later
//                 // showings can reference their film IDs. We build the same key used
//                 // earlier: title|duration_minutes|tmdb_id
//                 insert_films.data.forEach((row: Tables<'films'>) => {
//                 const key = `${row.title}|${row.duration_minutes === null ? 0 : row.duration_minutes}|${row.tmdb_id === null ? 'null' : row.tmdb_id}`;
//                 movies_added.set(key, row.id);
//             });

//             console.log(
//                 `🎦 [${cinema.name}] Inserted ${movies_to_add.length} new movies`
//             );
//         }

//         const showings_data = await db
//         .from('new_showings')
//         .select()
//         .eq('cinema_id', cinema_id);

//         console.log(
//             `[${cinema.name}] Found ${showings_data.data?.length} existing showings`
//         );

//         const new_showings_data = cinema.showings
//         .map((f) => {
//             try {
//                 const film_id = movies_added.get(movie_hash(f));
//                 if (film_id === undefined) {
//                     throw new Error(`No Id found for '${f.name}'`);
//                 }

//                 if (!DateTime.fromISO(f.startTime).isValid)
//                     throw new Error(
//                 `Invalid ISO string ${f.startTime} for ${f.name}, ${cinema.name}`
//             );
//             return {
//                 start_time: f.startTime,
//                 end_time: f.endTime,
//                 url: f.url,
//                 cinema_id: cinema_id,
//                 film_id: film_id,
//             };
//         } catch (e) {
//             console.error(`Skipping ${cinema.name}, ${f.name}`);
//             console.error(e);
//             return undefined;
//         }
//             })
//             .filter(
//                 (f) =>
//                     f &&
//                 showings_data.data?.find(
//                     (val) =>
//                         val.film_id == f.film_id &&
//                     val.cinema_id == f.cinema_id &&
//                     val.start_time == f.start_time &&
//                     val.end_time == f.end_time
//                 ) === undefined
//             );

//             if (new_showings_data.length > 0) {
//                 const insert_showings = await db
//                 .from('film_showings')
//                 .insert(new_showings_data);
//                 if (insert_showings.error !== null) {
//                     console.error(insert_showings.error);
//                     throw new Error(`[${cinema.name}] Insert produced an error`);
//                 }
//                 console.log(
//                     `🎦 [${cinema.name}] Inserted ${new_showings_data.length} new showings`
//                 );
//             }
//         })

async function main() {
    const stepFiles = readdirSync('./scripts/cinemas');

    const scrapers: [string, ScraperFunction][] = [];

    // Dynamically import all scraper scripts
    for (const file of stepFiles) {
        const module = await import('./cinemas/' + file); // dynamic import
        if (typeof module.scraper === 'function') {
            scrapers.push([file, module.scraper as ScraperFunction]);
            console.log(`☑️ Loaded scraper from ${file}`);
        } else {
            console.warn(`❌ No 'scraper' function found in ${file}`);
        }
    }

    if (process.env.SUPABASE_PROJECT_ID === undefined) {
        throw new Error('Missing Supabase Project ID');
    }

    if (process.env.API_KEY === undefined) {
        throw new Error('Missing Supabase database API Key');
    }

    // const supabase_db_url = `postgresql://postgres:${process.env.DB_PASSWORD}@db.${process.env.SUPABASE_PROJECT_ID}.supabase.co:5432/postgres`
    const supabase_db_url = `postgresql://postgres.${process.env.SUPABASE_PROJECT_ID}:${process.env.DB_PASSWORD}@aws-1-eu-west-2.pooler.supabase.com:5432/postgres`;

    // Create new Database object pool
    const db = new Kysely<DB>({
        dialect: new PostgresDialect({
            pool: new Pool({
                connectionString: supabase_db_url,
            }),
        }),
    });

    await Promise.all(
        scrapers.map(async ([name, fun]) => {
            try {
                await scrapeAndStore(name, fun, db);
            } catch (e) {
                if (e instanceof ZodError) {
                    console.log(`📜 Scraper '${name}' parsing error`);
                } else {
                    console.error(`‼️ Scraper '${name}' threw an error:`);
                    console.error(e);
                }
            }
        })
    );

    // await pool.end();
    await db.destroy();
}

main();
