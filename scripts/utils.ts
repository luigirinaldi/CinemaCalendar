import ICAL from 'ical.js';
import type { FilmShowing } from '../src/types';
import { ScraperFunction } from './types';
import { DB, storeCinemaData } from './database';
import { CinemaShowingsSchema } from './types';
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

export async function fetchAndParseICS(
    url: string,
    parseEvent: (event: ICAL.Event) => FilmShowing,
    filter: boolean = false
): Promise<FilmShowing[]> {
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

    const events: FilmShowing[] = vevents.map((vevent) => {
        const event = new ICAL.Event(vevent);
        return parseEvent(event);
    });

    return events;
}
