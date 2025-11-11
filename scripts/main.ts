import { readdirSync } from 'fs';
import { ScraperFunction, FilmShowing } from './types';

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database, Tables } from '../database.types';
import { getTMDB, TMDBObj } from './metadata';

import 'dotenv/config';

function movie_hash(f: FilmShowing) {
    return `${f.name}|${f.duration}|${f.localId}`;
}

async function scrapeAndStore(
    fun: ScraperFunction,
    db: SupabaseClient<Database>
) {
    const result = await fun();
    Object.entries(result).forEach(async ([_, cinema]) => {
        // Upsert, if row exists update it
        const cinema_insert = await db
            .from('cinemas')
            .upsert(
                {
                    name: cinema.cinema,
                    location: cinema.location,
                    last_updated: new Date().toISOString(),
                },
                { onConflict: 'name,location' }
            )
            .select();

        if (!cinema_insert.data || cinema_insert.data.length === 0) {
            throw new Error(
                `Upserted cinema returned no data for ${cinema.cinema}`
            );
        }
        const cinema_id = cinema_insert.data[0].id;

        const film_data = await db.from('films').select();
        if (!film_data.data) {
            throw new Error('No film data returned');
        }

        const unique_movies = new Map(
            cinema.showings.map((f) => [
                movie_hash(f),
                {
                    title: f.name,
                    duration_minutes: f.duration,
                    local_id: f.localId,
                },
            ])
        );

        const movies_to_add: any = [];
        const movies_added: Map<string, number> = new Map();

        for (const [movie_key, movie] of unique_movies) {
            const movie_exists = film_data.data.find(
                (val) =>
                    val.title == movie.title &&
                    val.duration_minutes == movie.duration_minutes
            );
            if (movie_exists === undefined) {
                movies_to_add.push(movie);
            } else {
                movies_added.set(movie_key, movie_exists.id);
            }
        }

        console.log(
            `[${cinema.cinema}] Found ${unique_movies.size} unique movies`
        );
        if (movies_to_add.length > 0) {
            // Insert the new movies and request the inserted rows back with .select()
            const insert_films = await db
                .from('films')
                .insert(movies_to_add)
                .select();
            if (insert_films.error !== null) {
                throw new Error(
                    `[${cinema.cinema}] Insert produced an error: ${JSON.stringify(insert_films.error)}`
                );
            }
            if (!insert_films.data) {
                throw new Error(
                    `[${cinema.cinema}] Insert returned no movie data`
                );
            }

            // Populate the movies_added map with the newly inserted rows so later
            // showings can reference their film IDs. We build the same key used
            // earlier: title|duration_minutes|local_id
            insert_films.data.forEach((row: Tables<'films'>) => {
                const key = `${row.title}|${row.duration_minutes === null ? 0 : row.duration_minutes}|${row.local_id === null ? 'null' : row.local_id}`;
                movies_added.set(key, row.id);
            });

            console.log(
                `🎦 [${cinema.cinema}] Inserted ${movies_to_add.length} new movies`
            );
        }

        const showings_data = await db
            .from('film_showings')
            .select()
            .eq('cinema_id', cinema_id);

        console.log(
            `[${cinema.cinema}] Found ${showings_data.data?.length} existing showings`
        );

        const new_showings_data = cinema.showings
            .map((f) => {
                const film_id = movies_added.get(movie_hash(f));
                if (film_id === undefined) {
                    throw new Error(`No Id found for '${f.name}'`);
                }
                return {
                    start_time: f.startTime,
                    end_time: f.endTime,
                    url: f.url,
                    cinema_id: cinema_id,
                    film_id: film_id,
                };
            })
            .filter(
                (f) =>
                    showings_data.data?.find(
                        (val) =>
                            val.film_id == f.film_id &&
                            val.cinema_id == f.cinema_id &&
                            val.start_time == f.start_time &&
                            val.end_time == f.end_time
                    ) === undefined
            );

        if (new_showings_data.length > 0) {
            const insert_showings = await db
                .from('film_showings')
                .insert(new_showings_data);
            if (insert_showings.error !== null) {
                console.error(insert_showings.error);
                throw new Error(`[${cinema.cinema}] Insert produced an error`);
            }
            console.log(
                `🎦 [${cinema.cinema}] Inserted ${new_showings_data.length} new showings`
            );
        }
    });
}

async function updateFilmMetadata(db: SupabaseClient<Database>) {
    // pick a lower number if TMDB API blocks some requests
    const CHUNK_DEFAULT_SIZE = 100;

    let film_data = await db
        .from('films')
        .select('id, title, duration_minutes')
        .is('tmdb_id', null)
        .limit(CHUNK_DEFAULT_SIZE);
    
    if (film_data.error) { // !== null
        throw new Error(film_data.error.message);
    }

    let cursor = CHUNK_DEFAULT_SIZE;
    const tmdb_objs : TMDBObj[] = [];
    const tmdb_ids = new Set(); // update TMDB metadata only once (avoid useless multiple updates on the same row)
    const updated_films : {id:number, title:string, tmdb_id:number|null}[] = [];

    while (film_data.data.length > 0) {
        // ask to the TMDB API
        const tmdb_update = await Promise.all(film_data.data.map(async film => {
            const tmdbData = await getTMDB({ id: film.id, title: film.title, release_date: undefined, duration: film.duration_minutes ?? 0 });
            if (tmdbData && !tmdb_ids.has(tmdbData.id)) {
                tmdb_objs.push(tmdbData);
                tmdb_ids.add(tmdbData.id);
            }
            return {
                id : film.id,
                title: film.title,
                tmdb_id: tmdbData?.id || null
            };
        }));

        updated_films.push(...tmdb_update);
        
        film_data = await db
        .from('films')
        .select('id, title, duration_minutes')
        .is('tmdb_id', null)
        .range(cursor, cursor + CHUNK_DEFAULT_SIZE-1);
        cursor += CHUNK_DEFAULT_SIZE;
        
        if (film_data.error) { // !== null
            throw new Error(film_data.error.message);
        }
    }

    // Update entries in TMDB table
    const { error } = await db.from('tmdb_films').upsert(tmdb_objs);
    if (error) {
        console.error('TMDB metadata error:', error);
        return; // avoid updating TMDB ids on film rows without first updating TMDB metadata
    } else {
        console.log('TMDB metadata update: SUCCESS');
    }

    // Update the films with their TMDB IDs in a single batch operation
    const { error:error_id } = await db.from('films').upsert(updated_films);
    if (error_id) {
        console.error('TMDB id update error:', error_id);
    } else {
        console.log('TMDB id update: SUCCESS');
    }
}

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

    // Create a single supabase client for interacting with your database
    const supabase = createClient<Database>(
        `https://${process.env.SUPABASE_PROJECT_ID}.supabase.co`,
        process.env.API_KEY,
        {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false,
            },
        }
    );
    
    await Promise.all(
        scrapers.map(async ([name, fun]) => {
            try {
                await scrapeAndStore(fun, supabase);
            } catch (e) {
                console.log(`‼️ Scraper '${name}' threw an error:\n ${e}`);
                // console.log(e);
            }
        })
    );

    await updateFilmMetadata(supabase);
    
    // db.close();
}

main();
