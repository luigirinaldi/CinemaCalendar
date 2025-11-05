import { CinemaShowing, FilmShowing } from '../types';
import { parse } from 'node-html-parser';
import { DateTime } from 'luxon';

const CINEMA_NAME = 'Close-UP';
const LOG_PREFIX = '[' + CINEMA_NAME + ']';

export async function scraper(): Promise<CinemaShowing[]> {
    const response = await fetch(
        'https://www.closeupfilmcentre.com/search_film_programmes/'
    );

    const html = await response.text();
    const root = parse(html);

    // Select all article elements with a specific class
    const movies = root.querySelectorAll('.inner_block_3');

    const children = movies[0].children.filter((e) => e.rawTagName != 'br');
    let i = 0;
    let date_str = '';

    const film_showings: FilmShowing[] = [];
    while (i < children.length) {
        if (children[i].tagName == 'H2') {
            date_str = children[i].innerHTML;
            i += 1;
        } else if (children[i].tagName == 'A') {
            while (i < children.length && children[i].tagName == 'A') {
                const url = children[i].getAttribute('href');
                const innerText = children[i].querySelector('span')?.innerHTML;
                const regex = /(\d{1,2}:\d{2}\s*[ap]m)\s*:\s*(.+)/gi;

                if (innerText === undefined) {
                    console.error(
                        `${LOG_PREFIX} Skipping element since no inner text: ${children[i]}`
                    );
                    i += 1;
                    continue;
                }
                const matches = [...innerText.matchAll(regex)];

                const results = matches.map(([, time, title]) => ({
                    time,
                    title: title.trim(),
                }));

                if (results.length != 1) {
                    console.error(
                        `${LOG_PREFIX} Error in parsing html with regex: ${innerText}`
                    );
                    i += 1;
                    continue;
                }

                const regex_res = results[0];

                const date_time = `${date_str} ${regex_res.time}`;

                film_showings.push({
                    name: regex_res.title,
                    tmdbId: null,
                    startTime: new Date(date_time).toISOString(),
                    duration: 0,
                    url: url,
                });
                i += 1;
            }
        } else {
            i += 1;
        }
    }

    const uniqueFilms = film_showings
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

    const filmMoreInfo = (
        await Promise.all(
            uniqueFilms.map(async (film: { name: string; url: string }) => {
                try {
                    const response = await fetch(film.url);
                    const html = await response.text();
                    const root = parse(html);

                    const info = root
                        .getElementsByTagName('P')
                        .filter((val) => {
                            if (val.children.length > 0) {
                                // filter by looking for bold (strong) tags which contain the name of the movie
                                return (
                                    val.children[0].tagName === 'STRONG' &&
                                    val.children[0].innerText.trim() ===
                                        film.name
                                );
                            } else return false;
                        })
                        .map((e) => e.innerText.replace(film.name, '').trim());
                    if (info.length == 1 && info[0] !== '') {
                        const splitted = info[0].split(',');
                        const director = splitted[0];
                        const date = Number(splitted[1]);
                        const duration = Number(splitted[2].split(' ')[1]);

                        const film_info: {
                            title: string;
                            duration: number;
                            director: string;
                            releaseDate: number;
                            bookings:
                                | undefined
                                | {
                                      date_time: string;
                                      booking_url: string;
                                  }[];
                        } = {
                            title: film.name,
                            duration: duration,
                            director: director,
                            releaseDate: date,
                            bookings: undefined,
                        };

                        try {
                            const booking_calendar =
                                root.querySelectorAll('.booking_calender');
                            if (
                                booking_calendar &&
                                booking_calendar.length === 1
                            ) {
                                const bookings = booking_calendar[0].children
                                    .filter((c) => c.tagName === 'TABLE')[0]
                                    .children.filter(
                                        (c) =>
                                            c.tagName === 'TR' && c.id === 'row'
                                    );
                                if (!(bookings && bookings.length > 0)) {
                                    throw new Error(
                                        `${LOG_PREFIX} No bookings found: ${film.name}\t\n${film.url}`
                                    );
                                }

                                film_info['bookings'] = bookings.map((c) => {
                                    const childs = c.children;
                                    // const _name = childs[0].innerText.trim();
                                    const url =
                                        childs[3].children[0].getAttribute(
                                            'href'
                                        );
                                    if (!url)
                                        throw new Error(
                                            `${LOG_PREFIX} Booking url error: ${film.name}\t\n${film.url}`
                                        );
                                    const datetimeStr =
                                        childs[1].innerText.trim() +
                                        ' ' +
                                        childs[2].innerText.trim();
                                    const datetimeIso = DateTime.fromFormat(
                                        datetimeStr,
                                        'EEEE dd.MM.yy h:mm a'
                                    )
                                        .toISO()
                                        ?.toString();
                                    if (!datetimeIso)
                                        throw new Error(
                                            `${LOG_PREFIX} Booking date error ${datetimeStr}: ${film.name}\t\n${film.url}`
                                        );
                                    return {
                                        date_time: datetimeIso,
                                        booking_url: url,
                                    };
                                });
                                return film_info;
                            } else {
                                throw new Error(
                                    `${LOG_PREFIX} Couldn't find booking calendar: ${film.name}\t\n${film.url}`
                                );
                            }
                        } catch (e) {
                            console.error(
                                `${LOG_PREFIX} Error looking for booking links: ${film.name}\t\n${film.url}`
                            );
                            console.error(e);
                            return film_info;
                        }
                    } else {
                        console.error(
                            `${LOG_PREFIX} Something went wrong trying to get more info about: ${film.name}\t\n${film.url}`
                        );
                        return [];
                    }
                } catch (e) {
                    console.error(
                        `${LOG_PREFIX} Something went wrong trying to get more info about: ${film.name}\t\n${film.url}`
                    );
                    console.error(e);
                    return [];
                }
            })
        )
    ).flat();

    // Combine film info (bookings, duration) with previously found information
    // UNUSED director and release date info
    const final_film_showings = film_showings.map((film) => {
        const more_info = filmMoreInfo.filter(
            (info) => info.title === film.name
        );
        if (more_info.length === 1) {
            // extra info available
            if (more_info[0].bookings === undefined) {
                return { ...film, duration: more_info[0].duration };
            } else {
                const booking = more_info[0].bookings.filter(
                    (b) =>
                        new Date(b.date_time).getTime() ==
                        new Date(film.startTime).getTime()
                );
                if (booking.length === 1) {
                    return {
                        ...film,
                        duration: more_info[0].duration,
                        url: booking[0].booking_url,
                    };
                } else {
                    return { ...film, duration: more_info[0].duration };
                }
            }
        } else {
            // no extra info
            return film;
        }
    });

    return [
        {
            cinema: CINEMA_NAME,
            location: 'London',
            showings: final_film_showings,
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
