import { CinemaShowing } from './types';

import { Database } from '../database.types';

import { Kysely, PostgresDialect, Transaction } from 'kysely';
import { KyselifyDatabase } from 'kysely-supabase';
import { Pool } from 'pg';

import 'dotenv/config';
import { DateTime } from 'luxon';

export type DB = KyselifyDatabase<Database>;

export async function connectDB() {
    if (process.env.SUPABASE_PROJECT_ID === undefined) {
        throw new Error('Missing Supabase Project ID');
    }

    if (process.env.API_KEY === undefined) {
        throw new Error('Missing Supabase database API Key');
    }

    // const supabase_db_url = `postgresql://postgres:${process.env.DB_PASSWORD}@db.${process.env.SUPABASE_PROJECT_ID}.supabase.co:5432/postgres`
    const supabase_db_url = `postgresql://postgres.${process.env.SUPABASE_PROJECT_ID}:${process.env.DB_PASSWORD}@aws-1-eu-west-2.pooler.supabase.com:5432/postgres`;

    // Create new Database object pool
    return new Kysely<DB>({
        dialect: new PostgresDialect({
            pool: new Pool({
                connectionString: supabase_db_url,
            }),
        }),
    });
}

export async function storeCinemaData(
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
                            new Date(show.startTime).getTime() ===
                                new Date(s.start_time).getTime() &&
                            s.film_id === filmId &&
                            s.cinema_id === cinemaId
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
