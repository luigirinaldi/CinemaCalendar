import fs from 'fs';
import { ScraperFunction } from '../src/types';
import { scraper as RegentScraper } from './regentStreetCinema';
import { scraper as theSpaceLimenaScraper } from './theSpaceLimena';
import { scraper as LuxPadovaScraper } from './luxPadova';
import { scraper as PrinceScraper } from './princeCharlesCinema';
import { scraper as RexScraper } from './rexCinema';

const scrapers: Record<string, ScraperFunction> = {
  RegentScraper,
  theSpaceLimenaScraper,
  LuxPadovaScraper,
  PrinceScraper,
  RexScraper
}

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
  let cinemas: string[] = [];
  for (const [name, scraper] of Object.entries(scrapers)) {
    const result = await scraper();
    for (const [_, cinema] of Object.entries(result)) {
      cinemas.push(cinema.cinema);
      await writeFile(cinema.showings, `./public/data/${cinema.cinema}.json`);
    }
  }

  await writeFile(cinemas, './public/data/cinemas.json');
}

main();
