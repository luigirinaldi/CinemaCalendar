// Adapted from: https://github.com/jelmervdl/prince-charles-cinema-ics/blob/578fb2a097ddf33392c349ff74c9f9e5a8abd85a/index.js
// Original author: @jelmervdl
// Modified by: @luigirinaldi

import { Browser } from 'happy-dom';
import type {
    ScraperFunction,
    CinemaShowing,
    FilmShowings,
    Film,
    Showing,
} from '../types';
import { DateTime } from 'luxon';

const months: Record<string, number> = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
].reduce((acc, month, index) => ({ ...acc, [month]: index }), {} as Record<string, number>);

function parseDate(day: string, time: string): DateTime {
    const [, dom, mon] = day.split(' ');
    const [, h, m, am] = time.match(/^(\d{1,2}):(\d{2}) (am|pm)$/) || [];
    const today = new Date();
    const date = parseInt(dom);
    const monthIdx = months[mon] + 1;
    const year =
        today.getFullYear() +
        (monthIdx < today.getMonth() ||
        (monthIdx === today.getMonth() && date < today.getDate())
            ? 1
            : 0);
    const hour =
        parseInt(h) +
        (am === 'pm'
            ? parseInt(h) === 12
                ? 0
                : 12
            : parseInt(h) === 12
              ? -12
              : 0);
    const minute = parseInt(m);
    //   console.log({ today, day, time, date, monthIdx, year, hour, minute });
    const value = DateTime.fromObject(
        { year: year, month: monthIdx, day: date, hour: hour, minute: minute },
        { zone: 'Europe/London' }
    );
    // console.log(`${day} ${time}`, value, value.toLocal().toISO());
    if (!value.isValid) throw new Error(`Invalid date: ${day} ${time}`);
    return value;
}

type ScrapedShowing = {
    title: string;
    start: DateTime;
    duration?: number | null;
    end?: DateTime;
    url?: string;
    description?: string | null;
    filmUrl?: string | null;
    soldOut?: boolean;
    filmDirector?: string | null;
    filmYear?: number | null;
    filmCountry?: string | null;
    coverUrl?: string | null;
};

// allow using happy-dom's document without fighting the linter/type rules here
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function scrape(page: any, callback: (s: ScrapedShowing) => void) {
    page.querySelectorAll('.jacrofilm-list .jacro-event').forEach((eventEl: Element) => {
        const title = (eventEl.querySelector('.liveeventtitle')?.textContent || '').trim();
        const filmUrl = (eventEl.querySelector('.film_img > a[href]') as HTMLAnchorElement | null)?.href;
        const description = (eventEl.querySelector('.jacrofilm-list-content > .jacro-formatted-text')?.textContent) || null;
        const metaSpans = Array.from(
            eventEl.querySelectorAll('.running-time > span'),
            (span: Element) => (span.textContent || '').trim()
        );

        // duration like "130mins"
        const durationMatch = metaSpans
            .map((t) => t.match(/^(\d+)\s*mins$/))
            .find(Boolean)?.[1];
        const durationNum = durationMatch ? parseInt(durationMatch) : 0;

        // year typically a 4-digit span
        const yearText = metaSpans.find((s) => /^\d{4}$/.test(s));
        const yearNum = yearText ? parseInt(yearText) : null;

        // country often appears as uppercase (e.g. "USA")
        const countryText = metaSpans.find((s) => /^[A-Z]{2,}(?:\s+[A-Z]+)*$/.test(s));

        const coverUrl = (eventEl.querySelector('.film_img > a > img') as HTMLImageElement | null)?.src || null;
        const filmInfoText = (eventEl.querySelector('.film-info span')?.textContent || '').trim();
        const filmDirector = filmInfoText.match(/Directed by\s*(.*)/i)?.[1] || null;

        let day: string | null = null;
        eventEl
            .querySelectorAll('.performance-list-items > *')
            .forEach((listEl: Element) => {
                if (listEl.matches('.heading')) {
                    day = (listEl.textContent || '').trim();
                } else if (listEl.matches('li')) {
                    if (!day) return;
                    const buttonEl = listEl.querySelector(
                        '.film_book_button, .soldfilm_book_button'
                    ) as HTMLAnchorElement | null;
                    if (!buttonEl) return;
                    const time = (buttonEl.querySelector('.time')?.textContent || '').trim();
                    const url = buttonEl.href;
                    try {
                        const start = parseDate(day, time);
                        const end = start.plus({ minutes: durationNum });
                        const soldOut = listEl.matches('.soldfilm_book_button');
                        callback({
                            title,
                            start,
                            duration: durationNum,
                            end,
                            url,
                            description,
                            soldOut,
                            filmUrl,
                            filmDirector,
                            filmYear: yearNum,
                            filmCountry: countryText || null,
                            coverUrl,
                        });
                    } catch (err) {
                        console.error(
                            'Error while processing',
                            { title, filmUrl, description, duration: durationNum, day, time },
                            err
                        );
                    }
                }
            });
    });
}

export const scraper: ScraperFunction = async () => {
    const browser = new Browser({
        settings: {
            disableJavaScriptEvaluation: true,
            disableJavaScriptFileLoading: true,
            disableCSSFileLoading: true,
            disableComputedStyleRendering: true,
            navigation: {
                disableChildPageNavigation: true,
                disableChildFrameNavigation: true,
            },
        },
    });

    const page = browser.newPage();
    await page.goto('https://princecharlescinema.com/whats-on/');
    await page.waitUntilComplete();

    // Map films by a key (prefer filmUrl, fall back to title)
    const filmsMap = new Map<string, { film: Film; showings: Showing[] }>();

    scrape(page.mainFrame.document, ({ title, start, duration, url, filmUrl, filmDirector, filmYear, filmCountry, coverUrl }) => {
        const key = filmUrl || title;
        const filmUrlFinal = (filmUrl || url || '').toString();

        if (!filmsMap.has(key)) {
            const film: Film = {
                title: title,
                url: filmUrlFinal,
                // Optional fields left undefined when unknown
            };
            filmsMap.set(key, { film, showings: [] });
        }

        const entry = filmsMap.get(key)!;
        const showing: Showing = {
            startTime: start.toISO()!,
            bookingUrl: url || undefined,
            // theatre is not available in this scraper
        };
        // attach duration to film if available and not already set
        if (typeof duration === 'number' && duration > 0 && !entry.film.duration) entry.film.duration = duration;
        if (filmDirector && !entry.film.director) entry.film.director = filmDirector;
        if (typeof filmYear === 'number' && !entry.film.year) entry.film.year = filmYear;
        if (filmCountry && !entry.film.country) entry.film.country = filmCountry;
        if (coverUrl && !entry.film.coverUrl) entry.film.coverUrl = coverUrl;

        entry.showings.push(showing);
    });

    await browser.close();

    const filmShowingsArray: FilmShowings[] = Array.from(filmsMap.values()).map(({ film, showings }) => ({
        film,
        showings,
    }));

    const result: CinemaShowing = {
        cinema: {
            name: 'Prince Charles Cinema',
            location: 'London',
        },
        showings: filmShowingsArray,
    };

    // Ensure we return the shape declared in scripts/types.ts
    return [result];
}
