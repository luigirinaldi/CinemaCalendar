import { DateTime } from 'luxon';
import { CinemaShowings, CinemaShowingsSchema, FilmShowings, Showing } from '../types';
import { parse } from 'node-html-parser';

const CINEMA_NAME = 'ICA';
const LOG_PREFIX = '[' + CINEMA_NAME + ']';
const BASE_URL = 'https://www.ica.art';

/**
 * Try to parse a duration (in minutes) from a string by attempting several
 * substring replacements provided in `replacements`. If all attempts fail,
 * fall back to extracting the first integer found in the string. Returns
 * a number on success or undefined when nothing reasonable can be parsed.
 */
function parseDuration(
    durationStr: string | undefined,
    replacements: string[] = ['min.', 'mins.', 'min', 'mins']
): number | undefined {
    if (!durationStr) return undefined;

    const trimmed = durationStr.trim();

    // Try each replacement candidate by removing it and parsing the result
    for (const rep of replacements) {
        const cleaned = trimmed.replace(rep, '').trim();
        const parsed = Number(cleaned);
        if (!isNaN(parsed)) return parsed;
    }

    // Fallback: extract the first integer found (e.g. "Runs 90 mins" -> 90)
    const match = trimmed.match(/(\d+)/);
    if (match) return Number(match[1]);

    return undefined;
}

// interface Movie {
//     title: string;
//     url: string;
//     director?: string;
//     duration?: number;
//     language?: string;
//     year?: number;
//     country?: string;
// }

// interface Showing {
//     startTime: string;
//     url?: string;
//     theatre?: string;
// }
// interface MovieShowing {
//     movie: Movie;
//     showings: Showing[];
// }

async function getUpcomingShowings(): Promise<FilmShowings[]> {
    const response = await fetch(BASE_URL + '/upcoming');

    const html = await response.text();
    const root = parse(html);

    // Get all children of the ladder/viewport to process in order
    const viewport = root.querySelector('#viewport')?.querySelector('#ladder');
    if (!viewport)
        throw new Error(`${LOG_PREFIX} Couldn't find the root of the website`);
    // Traverse all child elements in order
    const allElements = viewport.querySelectorAll('*');

    let currentDate = '';
    const movies: FilmShowings[] = [];

    allElements.forEach((element) => {
        // Check if this is a date element
        if (element.classList.contains('docket-date')) {
            currentDate = element.text.trim();
        }

        // Check if this is a film item
        if (
            element.classList.contains('item') &&
            element.classList.contains('films')
        ) {
            // Extract the movie title
            const titleElement = element.querySelector('.title');
            const name = titleElement?.innerText.trim();

            // Extract the time
            const timeElement = element.querySelector('.time-slot');

            const parseDate = DateTime.fromFormat(
                currentDate + ' ' + timeElement?.text.trim(),
                'cccc, d LLLL h:mm a'
            );
            if (!parseDate.isValid)
                throw new Error(
                    `${LOG_PREFIX} Failed to parse datetime: ${currentDate} ${timeElement?.text.trim()}, \n${name}`
                );
            const startTime = parseDate.toISO()?.toString();

            // Extract the URL
            const linkElement = element.children.find((c) => c.tagName === 'A');
            const url = linkElement?.getAttribute('href');

            if (name && startTime && url) {
                const thisFilm = movies.find(
                    (m) =>
                        m.film.title === name && m.film.url === BASE_URL + url
                );

                if (thisFilm) {
                    thisFilm.showings.push({ startTime } as Showing);
                } else {
                    movies.push({
                        film: {
                            title: name,
                            url: BASE_URL + url,
                        },
                        showings: [
                            {
                                startTime,
                            },
                        ],
                    });
                }
            } else {
                console.error(
                    `${LOG_PREFIX} Failed to retrive info for film: name: ${name}, url: ${url}, start time: ${startTime}`
                );
            }
        }
    });
    return movies;
}

async function getMovieInfo(url: string): Promise<FilmShowings | null> {
    const response = await fetch(url);
    const html = await response.text();
    const root = parse(html);

    // Extract full caption text to parse director, country, year, language, duration
    const fullCaption = root.querySelector('#colophon.caption');
    if (fullCaption) {
        const captionText = fullCaption.text.trim();

        // Parse the caption text
        // Format: "Title, dir. Director Name, Country/Country YEAR, Language, duration min."
        const parts = captionText.split(',').map((p) => p.trim());

        const title = parts.at(0);
        if (!title) return null;

        const movieYear = Number(parts.at(2)?.split(' ').at(-1));
        let duration = parseDuration(parts.at(3), [
            'min.',
            'mins.',
            'min',
            'mins',
        ]);
        let language: string | undefined = parts.slice(4).join(', ');
        if (duration === undefined) {
            duration = parseDuration(parts.at(-1), [
                'min.',
                'mins.',
                'min',
                'mins',
            ]);
            language = parts.slice(3, -1).join(', ');
        }
        language = language === '' ? undefined : language;

        const returnVal: FilmShowings = {
            film: {
                title: title,
                director: parts.at(1)?.replace('dir.', '').trim(),
                year: isNaN(movieYear) ? undefined : movieYear,
                country: parts.at(2)?.replace(movieYear?.toString(), '').trim(),
                duration: duration === undefined ? undefined : duration,
                language: language,
                url: url,
            },
            showings: [],
        };

        // Extract booking URL
        const bookingElement = root.querySelector('.row-mobile.row.select');
        const bookingHref = bookingElement?.getAttribute('onclick');

        let bookingUrl = '';
        if (bookingHref) {
            const match = bookingHref.match(/location\.href="([^"]+)"/);
            if (match) {
                bookingUrl = match[1];
            }
        }

        // Extract future showings from performance-list
        const performances = root.querySelectorAll(
            '.performance-list .performance.future'
        );

        performances.forEach((perf) => {
            const timeElement = perf.querySelector('.time');
            const dateElement = perf.querySelector('.date.sans');
            const theatreElement = perf.querySelector('.venue');

            const time = timeElement?.text.trim();
            const date = dateElement?.text.trim();
            const theatre = theatreElement?.text.trim();
            const parseDate = DateTime.fromFormat(
                date + ' ' + time,
                'ccc, d LLL yyyy h:mm a'
            );
            if (!parseDate.isValid)
                throw new Error(
                    `${LOG_PREFIX} Failed to parse datetime: ${date} ${time}, \n${returnVal.film}`
                );
            const startTime = parseDate.toISO()?.toString();

            if (startTime && theatre) {
                returnVal.showings.push({
                    startTime,
                    theatre,
                    bookingUrl: BASE_URL + bookingUrl,
                });
            }
        });
        return returnVal;
    } else {
        return null;
    }
}

export async function scraper(): Promise<CinemaShowings> {
    const firstPass = await getUpcomingShowings();

    const filmShowings = (
        await Promise.all(
            firstPass.map(async (movieShowing) => {
                try {
                    const moreInfo = await getMovieInfo(movieShowing.film.url);

                    if (moreInfo) {
                        return moreInfo;
                    } else {
                        console.warn(
                            `${LOG_PREFIX} Couldn't get more info for: ${movieShowing.film.title.replace('\n', '')}, ${movieShowing.film.url}`
                        );
                        return movieShowing;
                    }
                } catch (e) {
                    console.error(
                        `${LOG_PREFIX} Something went wrong trying to get more info for: ${movieShowing}`
                    );
                    console.error(e);
                    return movieShowing;
                }
            })
        )
    ).filter((fs) => fs.showings.length > 0);

    return [
        {
            cinema: {
                name: CINEMA_NAME,
                location: 'London',
                coordinates: {
                    lat: `51º30'14.39" N`,
                    lng: `0º07'30" W`,
                },
            },
            showings: filmShowings,
        },
    ];
}

// main.ts
async function main() {
    console.log('Running as main script');
    const result = await scraper();
    const trustedResult = CinemaShowingsSchema.parse(result);
    console.log(trustedResult);
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}
