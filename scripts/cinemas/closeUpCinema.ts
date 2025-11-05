import { CinemaShowing, FilmShowing } from '../types';
import { parse } from 'node-html-parser';

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
    children.forEach((c) => console.log(c.tagName));
    let i = 0;
    let date_str = '';

    const film_showings: FilmShowing[] = [];
    while (i < children.length) {
        if (children[i].tagName == 'H2') {
            date_str = children[i].innerHTML;
            i += 1;
        } else if (children[i].tagName == 'A') {
            while (i < children.length && children[i].tagName == 'A') {
                // console.log(children[i])
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

    console.log(film_showings);

    // .forEach(e => console.log(e.tagName, e.innerHTML))
    // console.log(movies.filter(e => e.innerHTML !== 'br'))
    // const movie_info = movies.flatMap((movie) => {
    //     const link = movie.querySelector('a');
    //     const metadata = movie
    //         .querySelector('div.card__information')
    //         ?.querySelector('div.card__metadata');
    //     const info = {
    //         url: link?.getAttribute('href'),
    //         title: link?.getAttribute('title'),
    //         tags: metadata
    //             ?.querySelector('div.card__terms')
    //             ?.querySelectorAll('div.tag')
    //             .map((tag) => tag.innerHTML),
    //         date_range: metadata
    //             ?.querySelector('div.card__dates')
    //             ?.innerText.trim(),
    //     };
    //     if (hasNoUndefined(info)) {
    //         return [info];
    //     } else {
    //         console.warn(
    //             LOG_PREFIX,
    //             'Failed to get some information for movie:',
    //             info,
    //             movie.toString()
    //         );
    //         return [];
    //     }
    // });

    // console.debug(LOG_PREFIX,`Obtained a total of ${movie_info.length} movies`);

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
