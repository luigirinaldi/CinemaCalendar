import fs from 'fs';
import { ScraperFunction } from '../src/types';
import { scraper as RegentScraper } from './regentStreetCinema';
import { scraper as theSpaceLimenaScraper } from './theSpaceLimena';
import { scraper as LuxPadovaScraper } from './luxPadova';
import { scraper as PrinceScraper } from './princeCharlesCinema';
import { scraper as RexScraper } from './rexCinema';

import sqlite3 from "sqlite3";
import { execute } from './sql';

const scrapers: Record<string, ScraperFunction> = {
  RegentScraper,
  theSpaceLimenaScraper,
  LuxPadovaScraper,
  PrinceScraper,
  RexScraper,
};

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
  const db = new sqlite3.Database('./my.db');

  // Make cinema table
  try {
    await execute(
      db,
      `CREATE TABLE IF NOT EXISTS cinemas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        location TEXT NOT NULL)`
    );
  } catch (error) {
    console.log(error);
  }
  // Make film table
  try {
    await execute(
      db,
      `CREATE TABLE IF NOT EXISTS films (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        duration_minutes INTEGER,
        tmdb_id INTEGER)`
    );
  } catch (error) {
    console.log(error);
  }

  // Make showings table
  try {
    await execute(
      db,
      `CREATE TABLE IF NOT EXISTS film_showings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cinema_id INTEGER NOT NULL,
        film_id INTEGER NOT NULL,
        showing_time TEXT NOT NULL,

        FOREIGN KEY (cinema_id) REFERENCES cinemas(id),
        FOREIGN KEY (film_id) REFERENCES films(id))`
    );
  } catch (error) {
    console.log(error);
  }

  db.close()
  // let cinemas: string[] = [];
  // for (const [name, scraper] of Object.entries(scrapers)) {
  //   const result = await scraper();
  //   for (const [_, cinema] of Object.entries(result)) {
  //     cinemas.push(cinema.cinema);
  //     await writeFile(cinema.showings, `./public/data/${cinema.cinema}.json`);
  //   }
  // }

  // await writeFile(cinemas, './public/data/cinemas.json');
}

main();
