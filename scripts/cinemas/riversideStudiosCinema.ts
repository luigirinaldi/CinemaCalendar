import { CinemaShowing, FilmShowing } from '../../src/types';
import { DateTime } from 'luxon';

const CINEMA_NAME = 'Riverside Studios';
const LOG_PREFIX = '[' + CINEMA_NAME + ']';

export async function scraper(): Promise<CinemaShowing[]> {
    const response = await fetch(
        'https://riversidestudios.co.uk/ajax/filter_stream/2/88/?offset=0&limit=500&q=',
        {
            method: 'GET',
        }
    );

    const result = await response.json();

    const movie_info_out: FilmShowing[] = result
        .filter((event) => event.event_type && event.event_type.includes('101'))
        .flatMap((event) => {
            let duration: number;
            try {
                const durationMatch =
                    event['run_time'].match(/(\d+)([ mins]*)/);
                if (!durationMatch) {
                    throw new Error(
                        `Could not parse duration from: '${event['run_time']}'`
                    );
                }
                duration = +durationMatch[1];
            } catch (error) {
                console.error(
                    `${LOG_PREFIX} Failed to parse duration for movie "${event['title']}":`,
                    error
                );
                duration = 0; // fallback value
            }
            return Object.entries(
                event['performances'] as Record<
                    string,
                    Array<{ timestamp: string }>
                >
            ).flatMap(([, performances]) => {
                return performances.flatMap((perf) => {
                    const startTime = DateTime.fromSeconds(
                        +perf['timestamp']
                    ).toISO();
                    if (startTime)
                        return {
                            name: event['title'].trim(),
                            startTime: startTime,
                            duration: duration,
                            url: event['url'],
                            tmdbId: null,
                        } as FilmShowing;
                    else return [];
                });
            });
        });
    return [
        {
            cinema: 'RiverSideStudios',
            location: 'London',
            showings: movie_info_out,
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
