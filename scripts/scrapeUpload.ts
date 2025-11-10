import { ZodError } from 'zod';
import { connectDB, DB, storeCinemaData } from './database';
import { CinemaShowingsSchema, ScraperFunction } from './types';
import { Kysely } from 'kysely';

export async function scrapeAndStore(
    name: string,
    fun: ScraperFunction,
    db: Kysely<DB>
) {
    const rawResult = await fun();
    const trustedResult = CinemaShowingsSchema.parse(rawResult);
    console.log(`[main] Successfully scraped and parsed data from ${name}`);
    for (const cinema of trustedResult) {
        await db
            .transaction()
            .execute(async (trx) => await storeCinemaData(trx, cinema));
    }
    console.log(`[main] DB update for ${name} completed`);
}

async function main() {
    const scraperName = process.env.SCRAPER;

    if (scraperName === undefined)
        throw new Error(
            `Missing scraper name in ENV, please add the name of a file in the ./scripts/cinemas directory`
        );

    const module = await import('./cinemas/' + scraperName); // dynamic import

    if (typeof module.scraper !== 'function') {
        throw new Error(`❌ No 'scraper' function found in ${scraperName}`);
    }

    console.log(`☑️ Loaded scraper from ${scraperName}`);

    const scraperFun = module.scraper as ScraperFunction;

    const db = await connectDB();

    try {
        await scrapeAndStore(scraperName, scraperFun, db);
    } catch (e) {
        if (e instanceof ZodError) {
            console.log(e);
            console.log(`📜 Scraper '${scraperName}' parsing error`);
        } else {
            console.error(`‼️ Scraper '${scraperName}' threw an error:`);
            console.error(e);
        }
    }

    await db.destroy();
}

main();
