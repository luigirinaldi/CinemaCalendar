import { readdirSync } from 'fs';
import { ScraperFunction } from './types';

import 'dotenv/config';
import { ZodError } from 'zod';
import { connectDB } from './database';
import { scrapeAndStore } from './utils';
import { updateFilmMetadata } from './metadata';

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

    const db = await connectDB();

    const dryRun = process.argv.includes('--dry-run');
    if (dryRun) console.log('[main] DRY RUN mode — no changes will be written');

    await Promise.all(
        scrapers.map(async ([name, fun]) => {
            try {
                await scrapeAndStore(name, fun, db, dryRun);
            } catch (e) {
                if (e instanceof ZodError) {
                    console.log(`📜 Scraper '${name}' parsing error`);
                } else {
                    console.error(`‼️ Scraper '${name}' threw an error:`);
                    console.error(e);
                }
            }
        })
    );

    await updateFilmMetadata(db);

    await db.destroy();
}

main();
