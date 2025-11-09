import { DateTime } from 'luxon';
import { CinemaShowing } from '../types';
import { parse } from 'node-html-parser';

const CINEMA_NAME = 'ICA';
const LOG_PREFIX = '[' + CINEMA_NAME + ']';
const BASE_URL = 'https://www.ica.art';

interface Movie {
    title: string;
    url: string;
    director?: string;
    duration?: number;
    language?: string;
    year?: number;
    country?: string;
}

interface Showing {
    startTime: string;
    url?: string;
    theatre?: string;
}
interface MovieShowing {
    movie: Movie;
    showings: Showing[];
}

async function getUpcomingShowings(): Promise<MovieShowing[]> {
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
    const movies: MovieShowing[] = [];

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
                        m.movie.title === name && m.movie.url === BASE_URL + url
                );

                if (thisFilm) {
                    thisFilm.showings.push({ startTime } as Showing);
                } else {
                    movies.push({
                        movie: {
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

async function getMovieInfo(url: string): Promise<MovieShowing | null> {
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
        const returnVal = {
            movie: {
                title: title,
                director: parts.at(1)?.replace('dir.', '').trim(),
                year: movieYear,
                country: parts.at(2)?.replace(movieYear?.toString(), '').trim(),
                duration: Number(parts.at(3)?.replace('min.', '').trim()),
                language: parts.slice(4).join(', '),
                url: url,
            },
            showings: [],
        } as MovieShowing;

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
                    `${LOG_PREFIX} Failed to parse datetime: ${date} ${time}, \n${returnVal.movie}`
                );
            const startTime = parseDate.toISO()?.toString();

            if (startTime && theatre) {
                returnVal.showings.push({
                    startTime,
                    theatre,
                    url: BASE_URL + bookingUrl,
                });
            }
        });
        return returnVal;
    } else {
        return null;
    }
}

export async function scraper(): Promise<CinemaShowing[]> {
    const firstPass = await getUpcomingShowings();

    const filmShowings = await Promise.all(
        firstPass.map(async (movieShowing) => {
            try {
                const moreInfo = await getMovieInfo(movieShowing.movie.url);

                if (moreInfo) {
                    return moreInfo;
                } else {
                    console.warn(
                        `${LOG_PREFIX} Couldn't get more info for: ${movieShowing.movie.title}, ${movieShowing.movie.url}`
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
    );

    return [
        {
            cinema: CINEMA_NAME,
            location: 'London',
            showings: filmShowings.flatMap((ms) =>
                ms.showings.map((s) => {
                    return {
                        name: ms.movie.title,
                        duration: ms.movie.duration ? ms.movie.duration : 0,
                        startTime: s.startTime,
                        url: s.url ? s.url : ms.movie.url,
                        tmdbId: null,
                    };
                })
            ),
        },
    ];
}

// main.ts
async function main() {
    const result = await scraper();
    console.log(result);
    console.log('Running as main script');
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}
