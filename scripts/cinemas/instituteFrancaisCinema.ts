import { DateTime } from 'luxon';
import { CinemaShowing, FilmShowing } from '../../src/types';
import { parse } from 'node-html-parser';
import { format } from 'path';

const CINEMA_NAME = 'Ciné Lumière';
const LOG_PREFIX = '[' + CINEMA_NAME + ']';

// function that performs type restriction, so that the type coming out doesn't have any undefined things
function hasNoUndefined<T extends Record<string, any>>(
    obj: T
): obj is { [K in keyof T]-?: Exclude<T[K], undefined> } {
    return Object.values(obj).every((value) => value !== undefined);
}

export async function scraper(): Promise<CinemaShowing[]> {
    let response = await fetch(
        'https://www.institut-francais.org.uk/whats-on/?type=72&period=any&location=onsite'
    );

    let html = await response.text();
    const root = parse(html);

    // Select all article elements with a specific class
    const movies = root.querySelectorAll('article.card--film');

    const movie_info = movies.flatMap((movie) => {
        const link = movie.querySelector('a');
        const metadata = movie
            .querySelector('div.card__information')
            ?.querySelector('div.card__metadata');
        const info = {
            url: link?.getAttribute('href'),
            title: link?.getAttribute('title'),
            tags: metadata
                ?.querySelector('div.card__terms')
                ?.querySelectorAll('div.tag')
                .map((tag) => tag.innerHTML),
            date_range: metadata
                ?.querySelector('div.card__dates')
                ?.innerText.trim(),
        };
        if (hasNoUndefined(info)) {
            return [info];
        } else {
            console.warn(
                LOG_PREFIX,
                'Failed to get some information for movie:',
                info,
                movie.toString()
            );
            return [];
        }
    });

    // console.debug(LOG_PREFIX,`Obtained a total of ${movie_info.length} movies`);

    const film_showings = (
        await Promise.all(
            movie_info.map(async (movie) => {
                const movie_response = await fetch(movie.url);
                const parsed_page = parse(await movie_response.text());

                let showings = parsed_page
                    .getElementById('more-dates')
                    ?.querySelector('table')
                    ?.querySelector('tbody')
                    ?.querySelectorAll('tr')
                    ?.flatMap((showing) => {
                        const showing_out = {
                            datetime: showing
                                .querySelectorAll('time')
                                ?.map((time) => time.getAttribute('datetime'))
                                .join('T'),
                            url: showing
                                .querySelector('a')
                                ?.getAttribute('href'),
                            room: (showing
                                .querySelectorAll('td')
                                ?.flatMap((td) =>
                                    td.childElementCount == 0
                                        ? [td.innerHTML]
                                        : []
                                )[0] ?? null) as string | null,
                        };
                        if (hasNoUndefined(showing_out)) {
                            return [showing_out];
                        } else {
                            console.warn(
                                LOG_PREFIX,
                                `Failed to get some information for movie ${movie.title}:`,
                                showing_out,
                                showing.toString(),
                                movie
                            );
                            return [];
                        }
                    });

                // the case where there is only one showing, hence the more-dates element doesn't appear
                if (showings == undefined) {
                    const showing_html = parsed_page.querySelector(
                        'section.next-showing'
                    );
                    const showing_info = {
                        datetime: showing_html
                            ?.querySelectorAll('time')
                            ?.map((time) => time.getAttribute('datetime'))
                            .join('T'),
                        url: showing_html
                            ?.querySelector('a')
                            ?.getAttribute('href'),
                        room:
                            showing_html?.querySelector('span.location')
                                ?.innerHTML ?? null,
                    };
                    if (hasNoUndefined(showing_info)) {
                        showings = [showing_info];
                    } else {
                        console.warn(
                            LOG_PREFIX,
                            `Failed to get information for movie ${movie.title}:`,
                            showing_info,
                            showing_html?.toString(),
                            movie
                        );
                    }
                }

                const metadata_raw: Record<string, string> = Object.fromEntries(
                    parsed_page
                        .querySelector('ul.metadata')
                        ?.querySelectorAll('li')
                        .map((li) => {
                            // remove the ':' at the end of the string
                            const key_string = li
                                .querySelector('strong')
                                ?.innerText.trim()
                                ?.slice(0, -1);
                            const value_string = li.childNodes
                                .at(li.childNodes.length - 1)
                                ?.innerText.trim();
                            return [key_string, value_string];
                        })
                        // filter out any undefined values
                        .filter((val) =>
                            val.every((val) => val != undefined)
                        ) as string[][]
                );

                let duration: number | null = null;
                if ('Duration' in metadata_raw) {
                    const match =
                        metadata_raw['Duration'].match(/^(\d+)\s*min(s?)/);
                    if (match) {
                        // console.log(movie.title, 'duration:', duration );
                        duration = +match[1];
                    } else {
                        console.warn(
                            LOG_PREFIX,
                            `Couldn't get duration for ${movie.title}\n`,
                            metadata_raw['Duration'].toString(),
                            movie.url
                        );
                        duration = null;
                    }
                } else {
                    console.warn(
                        LOG_PREFIX,
                        `No duration specified for ${movie.title}`,
                        movie.url
                    );
                    duration = null;
                }

                const metadata = {
                    duration: duration,
                    raw_meta: metadata_raw,
                };

                return {
                    ...movie,
                    ...metadata,
                    showings: showings,
                };
            })
        )
    ).filter((movie) => hasNoUndefined(movie));

    // console.log(film_showings)

    return [
        {
            cinema: CINEMA_NAME,
            location: 'London',
            showings: film_showings.flatMap((film) => {
                return film.showings.map((showings) => {
                    return {
                        name: film.title,
                        startTime: DateTime.fromISO(showings.datetime, {
                            zone: 'Europe/London',
                        }).toISO(),
                        url: showings.url,
                        duration: film.duration ?? 0, // sometimes there are movies where the duration is not specified so have to put 0
                    } as FilmShowing;
                });
            }),
        },
    ];
}
