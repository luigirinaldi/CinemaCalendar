import fs from 'fs';
import { ScraperFunction } from '../src/types';
import { scraper as RegentScraper } from './regentStreetCinema';
import { scraper as theSpaceLimenaScraper } from './theSpaceLimena';
import { scraper as LuxPadovaScraper } from './luxPadova';
import { scraper as PrinceScraper } from './princeCharlesCinema';
import { scraper as RexScraper } from './rexCinema';

import Database from 'better-sqlite3';
import { match } from 'assert';

const scrapers: ScraperFunction[] = [
  RegentScraper,
  theSpaceLimenaScraper,
  LuxPadovaScraper,
  PrinceScraper,
  RexScraper,
];

async function writeFile(data, filename: string) {
  fs.writeFile(filename, JSON.stringify(data), (err: any) => {
    if (err) {
      console.error('Error writing file: ', err);
      return;
    }
    console.log(`JSON data has been successfully dumped to ${filename}`);
  });
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
        'INSERT INTO film_showings (cinema_id, film_id, start_time, end_time) VALUES (?,?,?,?)'
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
            const film_id = getFilmId.get({ title: film.name });
            insertFilmShowing.run(
              cinema_id,
              film_id.id,
              film.startTime,
              film.endTime
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
