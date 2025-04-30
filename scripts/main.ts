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
  const db = new Database('./my.db');

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
        title TEXT NOT NULL,
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

  const cinemas: string[] = (await Promise.all(scrapers.map( async fun => {
    const result = await fun();
    const insertCinema = db.prepare('INSERT INTO cinemas (name, location) VALUES (@name, @location)');
    return Object.entries(result).map(([_, cinema]) => {
      console.log(cinema.cinema);

      const {changes, lastInsertRowid: cinema_id} = insertCinema.run({name: cinema.cinema, location: cinema.location})
      // console.log(db.prepare("SELECT * from cinemas where location='Padova'").all());
      cinema.showings.forEach(film => {
        const checkFilm = db.prepare('SELECT * FROM films WHERE title=@title');
        const matchingFilm = checkFilm.all({'title':film.name});
        const film_id = (matchingFilm.length == 0) 
                      ? 
                      db.prepare('INSERT INTO films (title, duration_minutes, tmdb_id) VALUES (?, ? ,?)')
                        .run(film.name, film.duration, film.tmdbId).lastInsertRowid 
                      :
                      matchingFilm[0].id;
          // console.log(info);
        
          // console.log(`${film.name} in db`);
          // console.log(matchingFilm);
        // }

        const insertFilmShowing = db.prepare('INSERT INTO film_showings (cinema_id, film_id, start_time, end_time) VALUES (?,?,?,?)');
        insertFilmShowing.run(cinema_id, film_id, film.startTime, film.endTime);

      })

      return cinema.cinema
    })
  }))).flat();

  console.log(cinemas);
    // for (const [name, scraper] of Object.entries(scrapers)) {
    //   const result = await scraper();
    //   Object.entries(result).forEach(([_, cinema]) => {
    //     console.log(cinema.cinema)
    //   })
      // for (const [_, cinema] of Object.entries(result)) {
        //   cinemas.push(cinema.cinema);
        //   await writeFile(cinema.showings, `./public/data/${cinema.cinema}.json`);
        // }
      // }
  //   }
  // );
      
  db.close();
  // await writeFile(cinemas, './public/data/cinemas.json');
}

main();
