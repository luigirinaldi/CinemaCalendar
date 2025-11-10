import ICAL from 'ical.js';
import { ScraperFunction } from './types';
import { DB, storeCinemaData } from './database';
import { CinemaShowingsSchema } from './types';
import { Kysely } from 'kysely';
import type { CinemaShowing } from './types';


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

/**
 * Compute and print human-friendly statistics for a single CinemaShowing.
 * Counts how many films include optional fields (director, year, country, coverUrl, duration)
 */
export function printCinemaStats(cinema: CinemaShowing, label?: string) {
    const totalFilms = cinema.showings.length;
    const totalShowings = cinema.showings.reduce((acc, f) => acc + f.showings.length, 0);

    // Film-level optional fields
    let countDirector = 0;
    let countYear = 0;
    let countCountry = 0;
    let countCover = 0;
    let countDuration = 0;
    let countLanguage = 0;

    // Showing-level optional fields
    let countBookingUrl = 0;
    let countTheatre = 0;

    for (const fs of cinema.showings) {
        const film = fs.film;
        if (film.director) countDirector++;
        if (typeof film.year === 'number') countYear++;
        if (film.country) countCountry++;
        if (film.coverUrl) countCover++;
        if (typeof film.duration === 'number' && film.duration > 0) countDuration++;
        if (film.language) countLanguage++;

        for (const s of fs.showings) {
            if (s.bookingUrl) countBookingUrl++;
            if (s.theatre) countTheatre++;
        }
    }

    const pctFilms = (n: number) => (totalFilms === 0 ? '0.0%' : ((n / totalFilms) * 100).toFixed(1) + '%');
    const pctShowings = (n: number) => (totalShowings === 0 ? '0.0%' : ((n / totalShowings) * 100).toFixed(1) + '%');

    const header = label ?? `${cinema.cinema.name} statistics`;
    console.info(`\n[stats] ${header}`);
    console.info(`  films:          ${totalFilms}`);
    console.info(`  total showings: ${totalShowings}`);

    console.info('\n  Film-level fields:');
    console.info(`    director: ${countDirector} (${pctFilms(countDirector)})`);
    console.info(`    duration: ${countDuration} (${pctFilms(countDuration)})`);
    console.info(`    language: ${countLanguage} (${pctFilms(countLanguage)})`);
    console.info(`    year:     ${countYear} (${pctFilms(countYear)})`);
    console.info(`    country:  ${countCountry} (${pctFilms(countCountry)})`);
    console.info(`    coverUrl: ${countCover} (${pctFilms(countCover)})`);

    console.info('\n  Showing-level fields:');
    console.info(`    bookingUrl: ${countBookingUrl} (${pctShowings(countBookingUrl)})`);
    console.info(`    theatre:    ${countTheatre} (${pctShowings(countTheatre)})`);
}

export async function fetchAndParseICS<T = unknown>(
    url: string,
    parseEvent: (event: ICAL.Event) => T,
    filter: boolean = false
): Promise<T[]> {
    const res = await fetch(url);
    const icsText = await res.text();

    const jcalData = ICAL.parse(icsText);
    const comp = new ICAL.Component(jcalData);
    let vevents = comp.getAllSubcomponents('vevent');

    // filter out past showings
    if (filter) {
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0); // Set time to midnight
        vevents = vevents.filter((vevent) => {
            const event = new ICAL.Event(vevent);
            return event.startDate.toJSDate() >= today;
        });
    }

    const events: T[] = vevents.map((vevent) => {
        const event = new ICAL.Event(vevent);
        return parseEvent(event);
    });

    return events;
}
