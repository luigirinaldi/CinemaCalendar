import { CinemaShowing, CinemaShowingsSchema, FilmShowings } from '../types';
import { parse } from 'node-html-parser';
import { DateTime } from 'luxon';

const CINEMA_NAME = 'Close-UP';
const LOG_PREFIX = '[' + CINEMA_NAME + ']';
const BASE_URL = 'https://www.closeupfilmcentre.com';

export async function scraper(): Promise<CinemaShowing[]> {
    const response = await fetch(BASE_URL + '/search_film_programmes/');

    const html = await response.text();
    const root = parse(html);

    // --- 2. Find the <script> that contains "var shows"
    const scriptTag = root
        .querySelectorAll('script')
        .find((s) => s.innerText.includes('var shows'));

    if (!scriptTag) {
        throw new Error("Could not find <script> containing 'var shows'");
    }

    const scriptText = scriptTag.innerText;

    // --- 3. Extract the JS variable contents using regex
    const showsMatch = scriptText.match(/var\s+shows\s*=\s*'(.*?)';/s);
    if (!showsMatch) throw new Error('Could not extract shows JSON');

    const showsRaw = showsMatch[1].replace(/\\"/g, '"').replace(/\\\//g, '/');

    const parsedJson: {
        id: string;
        fp_id: string;
        title: string;
        blink: string;
        show_time: string;
        status: string;
        booking_availability: string;
        film_url: string;
    }[] = JSON.parse(showsRaw);

    const filmShowings: FilmShowings[] = [];

    for (const show of parsedJson) {
        const url = BASE_URL + show.film_url;
        const existingFilm = filmShowings.find(
            (f) => f.film.title === show.title && f.film.url === url
        );

        const startTime = DateTime.fromFormat(
            show.show_time,
            'yyyy-MM-dd HH:mm:ss'
        )
            .toISO()
            ?.toString();
        if (startTime === undefined) {
            console.error(
                `${LOG_PREFIX} Failed to parse starttime from ${show.show_time}`
            );
            continue;
        }
        const showing = {
            startTime,
            bookingUrl: show.blink,
        };

        if (existingFilm) {
            existingFilm.showings.push(showing);
        } else {
            filmShowings.push({
                film: {
                    title: show.title,
                    url: url,
                },
                showings: [showing],
            });
        }
    }

    const filmMoreInfo = await Promise.all(
        filmShowings.map(async (filmShowing) => {
            const film = filmShowing.film;
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
                                    filmShowing.film.title
                            );
                        } else return false;
                    })
                    .map((e) =>
                        e.innerText.replace(filmShowing.film.title, '').trim()
                    );

                const imgSrc = root
                    .querySelectorAll('img')
                    .map((e) => e.getAttribute('src'))
                    .filter((src) =>
                        src?.includes('/download_file/view_inline')
                    )
                    .at(0);

                if (info.length == 1 && info[0] !== '') {
                    const splitted = info[0].split(',');
                    const director = splitted[0];
                    const date = Number(splitted[1]);
                    const duration = Number(splitted[2].split(' ')[1]);

                    return {
                        showings: filmShowing.showings,
                        film: {
                            ...filmShowing.film,
                            director,
                            year: isNaN(date) ? undefined : date,
                            duration: isNaN(duration) ? undefined : duration,
                            coverUrl: imgSrc,
                        },
                    };
                } else {
                    console.error(
                        `${LOG_PREFIX} Something went wrong trying to get more info about: ${film.title}\t\n${film.url}`
                    );
                    return filmShowing;
                }
            } catch (e) {
                console.error(
                    `${LOG_PREFIX} Something went wrong trying to get more info about: ${film.title}\t\n${film.url}`
                );
                console.error(e);
                return filmShowing;
            }
        })
    );

    return [
        {
            cinema: {
                name: CINEMA_NAME,
                location: 'London',
                coordinates: {
                    lat: `51° 31' 25.00396" N`,
                    lng: `- 0° 4' 19.382" W`,
                },
            },
            showings: filmMoreInfo,
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
