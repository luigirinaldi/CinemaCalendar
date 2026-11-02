import { readdir } from 'node:fs/promises';
import 'dotenv/config';
import { connectDB } from './database';
import { scrapeAndStore } from './utils';
import { updateFilmMetadata } from './metadata';
import { mapConcurrent } from './http';
import { startRunLog } from './runLog';

async function main() {
    startRunLog('get-data');
    const files = (await readdir(new URL('./cinemas/', import.meta.url)))
        .filter((file) => file.endsWith('Cinema.ts'))
        .sort();
    const db = await connectDB();
    const failures: string[] = [];
    try {
        await mapConcurrent(
            files,
            async (name) => {
                try {
                    const module = await import(`./cinemas/${name}`);
                    if (typeof module.scraper !== 'function')
                        throw new Error('Missing scraper export');
                    await scrapeAndStore(name, module.scraper, db);
                } catch (error) {
                    failures.push(name);
                    console.error(`Scraper ${name} failed:`, error);
                }
            },
            3
        );
        try {
            await updateFilmMetadata(db);
        } catch (error) {
            failures.push('TMDB metadata');
            console.error('TMDB metadata failed:', error);
        }
        if (failures.length)
            throw new Error(`Failed data tasks: ${failures.join(', ')}`);
    } finally {
        await db.destroy();
    }
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
