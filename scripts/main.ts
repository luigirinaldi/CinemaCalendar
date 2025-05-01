import fs from 'fs';
import { readdirSync } from "fs";
import { CinemaShowing, ScraperFunction } from '../src/types';

const stepFiles = readdirSync('./scripts').filter(f => f.endsWith("Cinema.ts"));

const scrapers: ScraperFunction[] = [];

// Dynamically import all scraper scripts
for (const file of stepFiles) {
  const module = await import('./' + file); // dynamic import
  if (typeof module.scraper === "function") {
    scrapers.push(module.scraper as ScraperFunction);
    console.log(`✅ Loaded scraper from ${file}`);
  } else {
    console.warn(`❌ No 'scraper' function found in ${file}`);
  }
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
  for (const scraper of scrapers) {
    const result = await scraper();
    await Promise.all(result.map(async (cinema:CinemaShowing) => {
      cinemas.push(cinema.cinema + cinema.location);
      await writeFile(cinema.showings, `./public/data/${cinema.cinema}.json`);
    }));
  }

  await writeFile(cinemas, './public/data/cinemas.json');
}

main();
