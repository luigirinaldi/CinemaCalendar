import { fetchUpcomingCalendar } from './regentStreetCinema';
import { fetchUpcomingCalendar2 } from './theSpaceLimena';
import { scraper as PrinceScraper } from './princeCharlesCinema';
import fs from 'fs';
import { ScraperFunction } from '../src/types';

const scrapers: Record<string, ScraperFunction> = {
    PrinceScraper
}

async function writeFile(data, filename: string) {
  fs.writeFile(
    filename,
    JSON.stringify(data),
    (err: any) => {
      if (err) {
        console.error('Error writing file: ', err);
        return;
      }
      console.log('JSON data has been successfully dumped to cinemas.json');
    }
  );
}
 
async function main() {
  let cinemas : string[] = []  
  for (const [name, scraper] of Object.entries(scrapers)) {
    const result = await scraper();
    for (const [_, cinema] of Object.entries(result)) {
      cinemas.push(cinema.cinema);
      await writeFile(cinema.showings, `./public/data/${cinema.cinema}.json`);
    }
  }

  await writeFile(cinemas, './public/data/cinemas.json')
}

main();
