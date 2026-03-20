import { ZodError } from 'zod';
import { CinemaShowingsSchema, ScraperFunction } from './types';
import { printCinemaStats } from './utils';
import fs from 'fs';
import path from 'path';
import Table from 'cli-table3';

async function test(scrapers_to_check: string[] = []) {
    if (!scrapers_to_check || scrapers_to_check.length === 0) {
        scrapers_to_check = ['']; // all scrapers
    }
    const dir = path.join('./scripts', 'cinemas');
    const scraper_files = new Set();
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('Cinema.ts'));
    scrapers_to_check.forEach((str) => {
        files
            .filter((f) => f.toLowerCase().includes(str.toLowerCase()))
            .forEach((f) => scraper_files.add(f));
    });

    const statsTable: Array<{
        cinema: string;
        films: number;
        showings: number;
        director: string;
        duration: string;
        language: string;
        year: string;
        country: string;
        coverUrl: string;
        bookingUrl: string;
        theatre: string;
        aggregate: string;
    }> = [];

    await Promise.all(
        // [...Set] is equivalent to Array.from(Set)
        [...scraper_files].map(async (file) => {
            let module;
            try {
                module = await import('./cinemas/' + file);
            } catch (err) {
                console.error(`❌ Failed to import ${file}:`, err);
                return;
            }
            if (typeof module.scraper !== 'function') {
                console.warn(`❌ No 'scraper' function found in ${file}`);
                return;
            }
            console.log(`☑️ Loaded scraper from ${file}`);
            const scraperFun = module.scraper as ScraperFunction;
            let trustedResult;
            try {
                const rawResult = await scraperFun();
                trustedResult = CinemaShowingsSchema.parse(rawResult);
            } catch (e) {
                if (e instanceof ZodError) {
                    console.error(e);
                    console.error(
                        `📜 Scraper failed to return data in correct format for ${file}`
                    );
                    return;
                } else {
                    console.error(`‼️ Scraper '${file}' threw an error:`);
                    console.error(e);
                    return;
                }
            }
            for (const cinema of trustedResult) {
                const totalFilms = cinema.showings.length;
                const totalShowings = cinema.showings.reduce(
                    (acc, f) => acc + f.showings.length,
                    0
                );
                let countDirector = 0,
                    countYear = 0,
                    countCountry = 0,
                    countCover = 0,
                    countDuration = 0,
                    countLanguage = 0;
                let countBookingUrl = 0,
                    countTheatre = 0;
                for (const fs of cinema.showings) {
                    const film = fs.film;
                    if (film.director) countDirector++;
                    if (typeof film.year === 'number') countYear++;
                    if (film.country) countCountry++;
                    if (film.coverUrl) countCover++;
                    if (typeof film.duration === 'number' && film.duration > 0)
                        countDuration++;
                    if (film.language) countLanguage++;
                    for (const s of fs.showings) {
                        if (s.bookingUrl) countBookingUrl++;
                        if (s.theatre) countTheatre++;
                    }
                }
                const pct = (n: number, total: number) =>
                    total === 0 ? '0.0%' : ((n / total) * 100).toFixed(1) + '%';
                const filmCounts = [countDirector, countDuration, countLanguage, countYear, countCountry, countCover];
                const showingCounts = [countBookingUrl, countTheatre];
                const totalPct =
                    filmCounts.reduce((sum, n) => sum + n / (totalFilms || 1), 0) +
                    showingCounts.reduce((sum, n) => sum + n / (totalShowings || 1), 0);
                const avgPct = totalPct / (filmCounts.length + showingCounts.length);

                statsTable.push({
                    cinema: cinema.cinema.name,
                    films: totalFilms,
                    showings: totalShowings,
                    director: `${countDirector} (${pct(countDirector, totalFilms)})`,
                    duration: `${countDuration} (${pct(countDuration, totalFilms)})`,
                    language: `${countLanguage} (${pct(countLanguage, totalFilms)})`,
                    year: `${countYear} (${pct(countYear, totalFilms)})`,
                    country: `${countCountry} (${pct(countCountry, totalFilms)})`,
                    coverUrl: `${countCover} (${pct(countCover, totalFilms)})`,
                    bookingUrl: `${countBookingUrl} (${pct(countBookingUrl, totalShowings)})`,
                    theatre: `${countTheatre} (${pct(countTheatre, totalShowings)})`,
                    aggregate: (avgPct * 100).toFixed(1) + '%',
                });
            }
        })
    );
    // Print table
    if (statsTable.length === 0) {
        console.log('No valid cinema data found.');
        return;
    }
    const columns = [
        'cinema',
        'films',
        'showings',
        'aggregate',
        'director',
        'duration',
        'language',
        'year',
        'country',
        'coverUrl',
        'bookingUrl',
        'theatre',
    ];
    const table = new Table({ head: columns });
    for (const row of statsTable) {
        table.push(columns.map((c) => String((row as Record<string, unknown>)[c])));
    }
    console.log('\n' + table.toString());
}

async function main() {
    const scraperName = process.env.SCRAPER;
    if (scraperName === undefined) {
        const args = process.argv.slice(2);
        if (args) {
            await test(args);
        } else {
            await test();
        }
        return;
    }
    // Single scraper mode
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
