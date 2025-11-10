import { ZodError } from 'zod';
import { CinemaShowingsSchema, ScraperFunction } from './types';
import { printCinemaStats } from './utils';

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

    const rawResult = await scraperFun();
    try {
        const trustedResult = CinemaShowingsSchema.parse(rawResult);
        console.log(
            `[main] Successfully scraped and parsed data from ${scraperName}`
        );
        for (const cinema of trustedResult) {
            console.log(
                `Cinema: ${cinema.cinema.name}, ${cinema.showings.length} Films and ${cinema.showings.reduce((acc, s) => acc + s.showings.length, 0)} total showings`
            );
            for (const film of cinema.showings.slice(0, 3)) {
                console.log(film.film);
                console.log(film.showings.slice(0, 3));
            }
            // print aggregated statistics for this cinema
            try {
                printCinemaStats(cinema);
            } catch (err) {
                console.warn(
                    '[validateScraper] Failed to compute stats for',
                    cinema.cinema.name,
                    err
                );
            }
        }
    } catch (e) {
        if (e instanceof ZodError) {
            console.error(e);
            throw new Error(
                `📜 Scraper failed to return data in correct format`
            );
        } else {
            console.error(`‼️ Scraper '${scraperName}' threw an error:`);
            throw e;
        }
    }
}

main();
