import { CinemaShowing, FilmShowing, Film } from '../types';
import { parse } from 'node-html-parser';
import { DateTime } from 'luxon';

const CINEMA_NAME = 'Close-UP';
const LOG_PREFIX = '[' + CINEMA_NAME + ']';
const BASE_URL = 'https://www.ica.art';

async function getUpcomingShowings(): Promise<FilmShowing[]> {
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
    const movies: FilmShowing[] = [];

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
            const startTime = currentDate + timeElement?.text.trim();

            // Extract the URL
            const linkElement = element.children.find((c) => c.tagName === 'A');
            const url = linkElement?.getAttribute('href');

            if (name && startTime) {
                movies.push({
                    name,
                    startTime,
                    url: url ? BASE_URL + url : undefined,
                    duration: 0,
                    tmdbId: null,
                });
            }
        }
    });
    return movies;
}

interface extraInfo {
    title: string;
    director?: string;
    duration?: number;
    language?: string;
    year?: number;
    country?: string;
    showtimes: {
        startTime: string;
        url: string;
        theatre: string;
    }[];
}

async function getMovieInfo(url: string): Promise<extraInfo | null> {
    const response = await fetch(url);
    const html = await response.text();
    const root = parse(html);

    const returnVal: Partial<extraInfo> = {
        showtimes: [],
    };

    // Extract full caption text to parse director, country, year, language, duration
    const fullCaption = root.querySelector('#colophon.caption');
    if (fullCaption) {
        const captionText = fullCaption.text.trim();

        // Parse the caption text
        // Format: "Title, dir. Director Name, Country/Country YEAR, Language, duration min."
        const parts = captionText.split(',').map((p) => p.trim());

        const title = parts.at(0);
        if (!title) return null;
        returnVal.title = title;
        returnVal.director = parts.at(1)?.replace('dir.', '').trim();
        returnVal.year = Number(parts.at(2)?.split(' ').at(-1));
        returnVal.country = parts.at(2)?.replace(returnVal.year?.toString(), '').trim();
        returnVal.duration = Number(parts.at(3)?.replace('min.', '').trim());
        returnVal.language = parts.slice(4).join(', ');
        
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
        
        const time = timeElement?.text.trim() || '';
        const date = dateElement?.text.trim() || '';
        const theatre = theatreElement?.text.trim();
        
        if (time && date && theatre) {
            returnVal.showtimes!.push({
                startTime: date + time,
                theatre,
                url: BASE_URL + bookingUrl,
            });
        }
    });
    return returnVal as extraInfo
} else {
    return null;
}

}

export async function scraper(): Promise<CinemaShowing[]> {
    const firstPass = await getUpcomingShowings();

    const uniqueFilms = firstPass
        .map((s) => {
            return { name: s.name, url: s.url };
        })
        .filter((s): s is { name: string; url: string } => s.url !== undefined)
        .reduce(
            (
                acc: {
                    name: string;
                    url: string;
                }[],
                current
            ) => {
                return acc
                    .map((s: { name: string; url: string }) => s.name)
                    .includes(current.name)
                    ? acc
                    : acc.concat(current);
            },
            []
        );

    console.log(uniqueFilms);

    console.log(await getMovieInfo(uniqueFilms[1].url));

    // const filmMoreInfo = (
    //     await Promise.all(
    //         uniqueFilms.map(async (film: { name: string; url: string }) => {
    //             try {
    //                 const response = await fetch(film.url);
    //                 const html = await response.text();
    //                 const root = parse(html);

    //                 const info = root
    //                     .getElementsByTagName('P')
    //                     .filter((val) => {
    //                         if (val.children.length > 0) {
    //                             // filter by looking for bold (strong) tags which contain the name of the movie
    //                             return (
    //                                 val.children[0].tagName === 'STRONG' &&
    //                                 val.children[0].innerText.trim() ===
    //                                     film.name
    //                             );
    //                         } else return false;
    //                     })
    //                     .map((e) => e.innerText.replace(film.name, '').trim());
    //                 if (info.length == 1 && info[0] !== '') {
    //                     const splitted = info[0].split(',');
    //                     const director = splitted[0];
    //                     const date = Number(splitted[1]);
    //                     const duration = Number(splitted[2].split(' ')[1]);

    //                     const film_info: {
    //                         title: string;
    //                         duration: number;
    //                         director: string;
    //                         releaseDate: number;
    //                         bookings:
    //                             | undefined
    //                             | {
    //                                   date_time: string;
    //                                   booking_url: string;
    //                               }[];
    //                     } = {
    //                         title: film.name,
    //                         duration: duration,
    //                         director: director,
    //                         releaseDate: date,
    //                         bookings: undefined,
    //                     };

    //                     try {
    //                         const booking_calendar =
    //                             root.querySelectorAll('.booking_calender');
    //                         if (
    //                             booking_calendar &&
    //                             booking_calendar.length === 1
    //                         ) {
    //                             const bookings = booking_calendar[0].children
    //                                 .filter((c) => c.tagName === 'TABLE')[0]
    //                                 .children.filter(
    //                                     (c) =>
    //                                         c.tagName === 'TR' && c.id === 'row'
    //                                 );
    //                             if (!(bookings && bookings.length > 0)) {
    //                                 throw new Error(
    //                                     `${LOG_PREFIX} No bookings found: ${film.name}\t\n${film.url}`
    //                                 );
    //                             }

    //                             film_info['bookings'] = bookings.map((c) => {
    //                                 const childs = c.children;
    //                                 // const _name = childs[0].innerText.trim();
    //                                 const url =
    //                                     childs[3].children[0].getAttribute(
    //                                         'href'
    //                                     );
    //                                 if (!url)
    //                                     throw new Error(
    //                                         `${LOG_PREFIX} Booking url error: ${film.name}\t\n${film.url}`
    //                                     );
    //                                 const datetimeStr =
    //                                     childs[1].innerText.trim() +
    //                                     ' ' +
    //                                     childs[2].innerText.trim();
    //                                 const datetimeIso = DateTime.fromFormat(
    //                                     datetimeStr,
    //                                     'EEEE dd.MM.yy h:mm a'
    //                                 )
    //                                     .toISO()
    //                                     ?.toString();
    //                                 if (!datetimeIso)
    //                                     throw new Error(
    //                                         `${LOG_PREFIX} Booking date error ${datetimeStr}: ${film.name}\t\n${film.url}`
    //                                     );
    //                                 return {
    //                                     date_time: datetimeIso,
    //                                     booking_url: url,
    //                                 };
    //                             });
    //                             return film_info;
    //                         } else {
    //                             throw new Error(
    //                                 `${LOG_PREFIX} Couldn't find booking calendar: ${film.name}\t\n${film.url}`
    //                             );
    //                         }
    //                     } catch (e) {
    //                         console.error(
    //                             `${LOG_PREFIX} Error looking for booking links: ${film.name}\t\n${film.url}`
    //                         );
    //                         console.error(e);
    //                         return film_info;
    //                     }
    //                 } else {
    //                     console.error(
    //                         `${LOG_PREFIX} Something went wrong trying to get more info about: ${film.name}\t\n${film.url}`
    //                     );
    //                     return [];
    //                 }
    //             } catch (e) {
    //                 console.error(
    //                     `${LOG_PREFIX} Something went wrong trying to get more info about: ${film.name}\t\n${film.url}`
    //                 );
    //                 console.error(e);
    //                 return [];
    //             }
    //         })
    //     )
    // ).flat();

    // // Combine film info (bookings, duration) with previously found information
    // // UNUSED director and release date info
    // const final_film_showings = film_showings.map((film) => {
    //     const more_info = filmMoreInfo.filter(
    //         (info) => info.title === film.name
    //     );
    //     if (more_info.length === 1) {
    //         // extra info available
    //         if (more_info[0].bookings === undefined) {
    //             return { ...film, duration: more_info[0].duration };
    //         } else {
    //             const booking = more_info[0].bookings.filter(
    //                 (b) =>
    //                     new Date(b.date_time).getTime() ==
    //                     new Date(film.startTime).getTime()
    //             );
    //             if (booking.length === 1) {
    //                 return {
    //                     ...film,
    //                     duration: more_info[0].duration,
    //                     url: booking[0].booking_url,
    //                 };
    //             } else {
    //                 return { ...film, duration: more_info[0].duration };
    //             }
    //         }
    //     } else {
    //         // no extra info
    //         return film;
    //     }
    // });

    return [
        {
            cinema: CINEMA_NAME,
            location: 'London',
            showings: film_showings,
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
