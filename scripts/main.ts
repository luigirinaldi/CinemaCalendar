import { readdirSync } from 'fs';
import { ScraperFunction, FilmShowing } from './types';

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../database.types';

import 'dotenv/config';

function movie_hash(f: FilmShowing) {
  return `${f.name}|${f.duration}|${f.tmdbId}`;
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
      throw new Error(`Upserted cinema returned no data for ${cinema.cinema}`);
    }
    const cinema_id = cinema_insert.data[0].id;

    const film_data = await db.from('films').select();
    if (!film_data.data) {
      throw new Error('No film data returned');
    }

    const unique_movies = new Map(
      cinema.showings.map((f) => [
        movie_hash(f),
        { title: f.name, duration_minutes: f.duration, tmdb_id: f.tmdbId },
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

    console.log(`[${cinema.cinema}] Found ${unique_movies.size} unique movies`);
    if (movies_to_add.length > 0) {
      // Insert the new movies and request the inserted rows back with .select()
      const insert_films = await db
        .from('films')
        .insert(movies_to_add)
        .select();
      if (insert_films.error !== null) {
        throw new Error(
          `[${cinema.cinema}] Insert produced an error: ${insert_films.error}`
        );
      }
      if (!insert_films.data) {
        throw new Error(`[${cinema.cinema}] Insert returned no movie data`);
      }

      // Populate the movies_added map with the newly inserted rows so later
      // showings can reference their film IDs. We build the same key used
      // earlier: title|duration_minutes|tmdb_id
      insert_films.data.forEach((row: any) => {
        const key = `${row.title}|${row.duration_minutes}|${row.tmdb_id}`;
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
        throw new Error(
          `[${cinema.cinema}] Insert produced an error: ${insert_showings.error}`
        );
      }
      console.log(
        `🎦 [${cinema.cinema}] Inserted ${new_showings_data.length} new showings`
      );
    }
  });
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

  // db.close();
}

main();
