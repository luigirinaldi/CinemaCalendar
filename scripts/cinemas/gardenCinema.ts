import { DateTime } from 'luxon';
import { CinemaShowings, CinemaShowingsSchema, FilmShowings, Cinema } from '../types';
import { parse } from 'node-html-parser';

const CINEMA_NAME = 'The Garden Cinema';
const LOG_PREFIX = '[' + CINEMA_NAME + ']';
const BASE_URL = 'https://www.thegardencinema.co.uk';

const CINEMA: Cinema = {
    name: CINEMA_NAME,
    location: 'London',
    coordinates: {
        lat: '51.5135',
        lng: '-0.1244',
    },
    defaultLanguage: 'en-GB',
};

/**
 * Parse director, country, year, and duration from the stats string.
 * Format: "Director Name, Country, YYYY, NNNm."
 * Country may be multiple comma-separated values (e.g. "USA, UK").
 */
function parseStats(statsText: string): {
    director?: string;
    country?: string;
    year?: number;
    duration?: number;
} {
    const yearMatch = statsText.match(/,\s*((?:19|20)\d{2})\s*,/);
    const durationMatch = statsText.match(/,\s*(\d+)m\.\s*$/);

    const year = yearMatch ? parseInt(yearMatch[1]) : undefined;
    const duration = durationMatch ? parseInt(durationMatch[1]) : undefined;

    let director: string | undefined;
    let country: string | undefined;

    if (yearMatch && yearMatch.index !== undefined) {
        const beforeYear = statsText.slice(0, yearMatch.index).trim();
        const commaIdx = beforeYear.indexOf(',');
        if (commaIdx >= 0) {
            director = beforeYear.slice(0, commaIdx).trim() || undefined;
            country = beforeYear.slice(commaIdx + 1).trim() || undefined;
        } else {
            director = beforeYear || undefined;
        }
    }

    return { director, country, year, duration };
}

export async function scraper(): Promise<CinemaShowings> {
    const response = await fetch(BASE_URL);
    const html = await response.text();
    const root = parse(html);

    const filmMap = new Map<string, FilmShowings>();

    const dateBlocks = root.querySelectorAll('.date-block');
    if (dateBlocks.length === 0) {
        throw new Error(`${LOG_PREFIX} No date blocks found on page`);
    }

    for (const dateBlock of dateBlocks) {
        // data-date is in ISO format e.g. "2026-03-22"
        const dateStr = dateBlock.getAttribute('data-date');
        if (!dateStr) {
            console.error(`${LOG_PREFIX} date-block missing data-date attribute`);
            continue;
        }

        const filmCards = dateBlock.querySelectorAll('.films-list__by-date__film');

        for (const filmCard of filmCards) {
            const titleLink = filmCard.querySelector('.films-list__by-date__film__title a');
            if (!titleLink) continue;

            const filmUrl = titleLink.getAttribute('href');
            if (!filmUrl) continue;

            // Strip trailing rating (e.g. " 12A", " 15", " PG", " U", " 18") from title
            const rawTitle = titleLink.text.trim();
            const title = rawTitle.replace(/\s+(U|PG|12A|15|18)\s*$/, '').trim();

            if (!title) {
                console.error(`${LOG_PREFIX} Empty title for ${filmUrl}`);
                continue;
            }

            // Poster image
            const posterImg = filmCard.querySelector('.films-list__by-date__film__thumb');
            const coverUrl = posterImg?.getAttribute('src') || undefined;

            // Stats: "Director, Country, YYYY, NNNm."
            const statsEl = filmCard.querySelector('.films-list__by-date__film__stats');
            const statsText = statsEl?.text.trim() || '';
            const { director, country, year, duration } = parseStats(statsText);

            // Screening time links
            const screeningLinks = filmCard.querySelectorAll('.screening-time a.screening');

            for (const link of screeningLinks) {
                const timeStr = link.text.trim(); // "HH:MM"
                const bookingUrl = link.getAttribute('href') || undefined;

                const startDt = DateTime.fromISO(`${dateStr}T${timeStr}`, {
                    zone: 'Europe/London',
                });
                if (!startDt.isValid) {
                    console.error(
                        `${LOG_PREFIX} Failed to parse datetime: ${dateStr}T${timeStr} for "${title}"`
                    );
                    continue;
                }
                const startTime = startDt.toISO()!;

                if (!filmMap.has(filmUrl)) {
                    filmMap.set(filmUrl, {
                        film: {
                            title,
                            url: filmUrl,
                            director,
                            country,
                            year,
                            duration,
                            coverUrl,
                        },
                        showings: [],
                    });
                }

                filmMap.get(filmUrl)!.showings.push({
                    startTime,
                    ...(bookingUrl && { bookingUrl }),
                });
            }
        }
    }

    const showings = Array.from(filmMap.values()).filter((fs) => fs.showings.length > 0);

    return [{ cinema: CINEMA, showings }];
}

async function main() {
    console.log('Running as main script');
    const result = await scraper();
    const trustedResult = CinemaShowingsSchema.parse(result);
    console.log(JSON.stringify(trustedResult, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}
