import fs from 'fs';
import { readdirSync } from 'fs';
import { CinemaShowing, ScraperFunction } from '../src/types';

import Database from 'better-sqlite3';
import { match } from 'assert';

const stepFiles = readdirSync('./scripts/cinemas');

const scrapers: ScraperFunction[] = [];

// Dynamically import all scraper scripts
for (const file of stepFiles) {
  const module = await import('./cinemas/' + file); // dynamic import
  if (typeof module.scraper === 'function') {
    scrapers.push(module.scraper as ScraperFunction);
    console.log(`✅ Loaded scraper from ${file}`);
  } else {
    console.warn(`❌ No 'scraper' function found in ${file}`);
  }
}

async function main() {
  const db = new Database('./public/data/my.db');

  // Make cinema table
  db.prepare(
    `CREATE TABLE IF NOT EXISTS cinemas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      location TEXT NOT NULL)`
  ).run();
  // Make film table
  db.prepare(
    `CREATE TABLE IF NOT EXISTS films (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT UNIQUE NOT NULL,
        duration_minutes INTEGER,
        tmdb_id INTEGER)`
  ).run();

  // Make showings table
  db.prepare(
    `CREATE TABLE IF NOT EXISTS film_showings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cinema_id INTEGER NOT NULL,
        film_id INTEGER NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT,
        url TEXT,

        FOREIGN KEY (cinema_id) REFERENCES cinemas(id),
        FOREIGN KEY (film_id) REFERENCES films(id))`
  ).run();

  await Promise.all(
    scrapers.map(async (fun) => {
      const result = await fun();
      const insertCinema = db.prepare(
        'INSERT INTO cinemas (name, location) VALUES (@name, @location)'
      );
      const getFilmId = db.prepare('SELECT id FROM films WHERE title=@title');
      const insertFilm = db.prepare(
        'INSERT OR IGNORE INTO films (title, duration_minutes, tmdb_id) VALUES (?, ? ,?)'
      );
      const insertFilmShowing = db.prepare(
        'INSERT INTO film_showings (cinema_id, film_id, start_time, end_time, url) VALUES (?,?,?,?,?)'
      );
      Object.entries(result).forEach(([_, cinema]) => {
        console.log(cinema.cinema);

        const { changes, lastInsertRowid: cinema_id } = insertCinema.run({
          name: cinema.cinema,
          location: cinema.location,
        });
        const insertAll = db.transaction(() => {
          cinema.showings.forEach((film) => {
            insertFilm.run(film.name, film.duration, film.tmdbId);
            const film_id: any = getFilmId.get({ title: film.name });
            insertFilmShowing.run(
              cinema_id,
              film_id.id,
              film.startTime,
              film.endTime,
              film.url
            );
          });
        });
        insertAll();
        console.log(`Inserted movies for ${cinema.cinema}`);
      });
    })
  );

  db.close();
}

main();
