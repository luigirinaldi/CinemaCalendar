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
export type ColCount = { count: number; pct: number };

export type CinemaStats = {
    totalFilms: number;
    totalShowings: number;
    filmLevel: {
        director: ColCount;
        duration: ColCount;
        language: ColCount;
        year: ColCount;
        country: ColCount;
        coverUrl: ColCount;
    };
    showingLevel: {
        bookingUrl: ColCount;
        theatre: ColCount;
    };
};

/**
 * Compute and return structured statistics for a single CinemaShowing.
 * Returns counts and percentages (pct as a float 0..1) so callers can either
 * print or consume the stats programmatically.
 */
export function collectCinemaStats(cinema: CinemaShowing): CinemaStats {
    const totalFilms = cinema.showings.length;
    const totalShowings = cinema.showings.reduce(
        (acc, f) => acc + f.showings.length,
        0
    );

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
        if (typeof film.duration === 'number' && film.duration > 0)
            countDuration++;
        if (film.language) countLanguage++;

        for (const s of fs.showings) {
            if (s.bookingUrl) countBookingUrl++;
            if (s.theatre) countTheatre++;
        }
    }

    const pct = (n: number, total: number) => (total === 0 ? 0 : n / total);

    return {
        totalFilms,
        totalShowings,
        filmLevel: {
            director: {
                count: countDirector,
                pct: pct(countDirector, totalFilms),
            },
            duration: {
                count: countDuration,
                pct: pct(countDuration, totalFilms),
            },
            language: {
                count: countLanguage,
                pct: pct(countLanguage, totalFilms),
            },
            year: { count: countYear, pct: pct(countYear, totalFilms) },
            country: {
                count: countCountry,
                pct: pct(countCountry, totalFilms),
            },
            coverUrl: { count: countCover, pct: pct(countCover, totalFilms) },
        },
        showingLevel: {
            bookingUrl: {
                count: countBookingUrl,
                pct: pct(countBookingUrl, totalShowings),
            },
            theatre: {
                count: countTheatre,
                pct: pct(countTheatre, totalShowings),
            },
        },
    };
}

export function printCinemaStats(cinema: CinemaShowing, label?: string) {
    const s = collectCinemaStats(cinema);
    const pct = (v: number) => (v * 100).toFixed(1) + '%';

    const header = label ?? `${cinema.cinema.name} statistics`;
    console.info(`\n[stats] ${header}`);
    console.info(`  films:          ${s.totalFilms}`);
    console.info(`  total showings: ${s.totalShowings}`);

    console.info('\n  Film-level fields:');
    console.info(
        `    director: ${s.filmLevel.director.count} (${pct(s.filmLevel.director.pct)})`
    );
    console.info(
        `    duration: ${s.filmLevel.duration.count} (${pct(s.filmLevel.duration.pct)})`
    );
    console.info(
        `    language: ${s.filmLevel.language.count} (${pct(s.filmLevel.language.pct)})`
    );
    console.info(
        `    year:     ${s.filmLevel.year.count} (${pct(s.filmLevel.year.pct)})`
    );
    console.info(
        `    country:  ${s.filmLevel.country.count} (${pct(s.filmLevel.country.pct)})`
    );
    console.info(
        `    coverUrl: ${s.filmLevel.coverUrl.count} (${pct(s.filmLevel.coverUrl.pct)})`
    );

    console.info('\n  Showing-level fields:');
    console.info(
        `    bookingUrl: ${s.showingLevel.bookingUrl.count} (${pct(s.showingLevel.bookingUrl.pct)})`
    );
    console.info(
        `    theatre:    ${s.showingLevel.theatre.count} (${pct(s.showingLevel.theatre.pct)})`
    );
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
