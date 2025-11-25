import type { CinemaShowing, FilmShowings, Cinema } from '../types';
import { DateTime } from 'luxon';

const CINEMA_NAME = 'Riverside Studios';
const LOG_PREFIX = '[' + CINEMA_NAME + ']';

const CINEMA: Cinema = {
    name: CINEMA_NAME,
    location: 'London',
    defaultLanguage: 'en-GB',
};

// Minimal typing for the JSON returned by Riverside
interface RiversidePerf {
    timestamp: string;
}

interface RiversideEvent {
    event_type?: string | string[];
    run_time?: string;
    title?: string;
    url?: string;
    performances?: Record<string, RiversidePerf[]>;
}

export async function scraper(): Promise<CinemaShowing[]> {
    const response = await fetch(
        'https://riversidestudios.co.uk/ajax/filter_stream/2/88/?offset=0&limit=500&q=',
        {
            method: 'GET',
        }
    );

    const result: RiversideEvent[] =
        (await response.json()) as RiversideEvent[];

    // Collect flat list of (title, url, startTime, duration)
    const flatShowings = result
        .filter(
            (event) =>
                !!event.event_type &&
                // event_type can be a string or array; normalize to string
                (Array.isArray(event.event_type)
                    ? event.event_type.includes('101')
                    : String(event.event_type).includes('101'))
        )
        .flatMap((event) => {
            let duration: number | undefined;
            try {
                const durationMatch = (event.run_time ?? '').match(
                    /(\d+)([ mins]*)/
                );
                if (!durationMatch)
                    throw new Error(
                        `Could not parse duration from: '${event.run_time}'`
                    );
                duration = +durationMatch[1];
            } catch (error) {
                console.error(
                    `${LOG_PREFIX} Failed to parse duration for movie "${event.title}":`,
                    error
                );
                duration = undefined; // fallback value
            }

            const performancesEntries = Object.entries(
                event.performances ?? {}
            );
            return performancesEntries.flatMap(([, performances]) =>
                performances.flatMap((perf: RiversidePerf) => {
                    const startTime = DateTime.fromSeconds(
                        +perf.timestamp
                    ).toISO();
                    if (!startTime) return [] as Array<never>;
                    return [
                        {
                            title: (event.title ?? '').trim(),
                            url: event.url ?? '',
                            startTime,
                            duration,
                        },
                    ];
                })
            );
        });

    // Group by title+url into FilmShowings schema: { film: {...}, showings: [...] }
    const grouped = new Map<string, FilmShowings>();
    for (const s of flatShowings) {
        const key = `${s.title}::${s.url}`;
        const filmObj = {
            title: s.title,
            url: s.url,
            duration: s.duration,
        };

        const showing = {
            startTime: s.startTime,
        };

        if (!grouped.has(key)) {
            grouped.set(key, {
                film: filmObj,
                showings: [showing],
            });
        } else {
            grouped.get(key)!.showings.push(showing);
        }
    }

    const filmShowings = Array.from(grouped.values());

    return [
        {
            cinema: CINEMA,
            showings: filmShowings,
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
