import { parse } from 'node-html-parser';
import { fetchPage } from '../http';
import type { CinemaShowing, FilmShowings, Cinema } from '../types';
import { DateTime } from 'luxon';

const CINEMA_NAME = 'Riverside Studios';
const LOG_PREFIX = '[' + CINEMA_NAME + ']';

const CINEMA: Cinema = {
    name: CINEMA_NAME,
    location: 'London',
    website: 'https://riversidestudios.co.uk',
    // Venue location and sources: ../cinema-locations.md
    coordinates: { lat: '51.48879', lng: '-0.22783' },
    defaultLanguage: 'en-GB',
};

// Minimal typing for the JSON returned by Riverside
interface RiversidePerf {
    timestamp: string;
    html?: string;
}

interface RiversideEvent {
    slot_tag?: string | boolean;
    event_type?: string | string[];
    run_time?: string;
    duration?: string;
    image_url?: string;
    title?: string;
    url?: string;
    performances?: Record<string, RiversidePerf[]>;
}

export async function scraper(): Promise<CinemaShowing[]> {
    // The stream URL now contains a rotating identifier supplied by the listing page.
    const listing = await fetchPage('https://riversidestudios.co.uk/whats-on/');
    const html = await listing.text();
    const stream = html.match(
        /data_url:\s*['"]([^'"]+\/ajax\/filter_stream\/[^'"]+)['"]/
    )?.[1];
    if (!stream) throw new Error('Riverside stream URL not found');
    const endpoint = new URL(stream, 'https://riversidestudios.co.uk');
    if (endpoint.origin !== 'https://riversidestudios.co.uk')
        throw new Error('Unexpected Riverside stream host');
    const result: RiversideEvent[] = [];
    const pageSize = 500;
    for (let offset = 0; ; ) {
        endpoint.search = new URLSearchParams({
            offset: String(offset),
            limit: String(pageSize),
            q: '',
        }).toString();
        const response = await fetchPage(endpoint);
        const page = (await response.json()) as RiversideEvent[];
        if (!Array.isArray(page))
            throw new Error('Unexpected Riverside stream response');
        result.push(...page);
        if (page.length < pageSize) break;
        offset += page.length;
    }

    // Collect flat list of (title, url, startTime, duration)
    const flatShowings = result
        .filter(
            (event) =>
                event.slot_tag === 'Cinema' ||
                (!!event.event_type &&
                    // event_type can be a string or array; normalize to string
                    (Array.isArray(event.event_type)
                        ? event.event_type.includes('101')
                        : String(event.event_type)
                              .split(',')
                              .map((value) => value.trim())
                              .includes('101')))
        )
        .flatMap((event) => {
            let duration: number | undefined;
            const durationMatch = (
                event.run_time ||
                event.duration ||
                ''
            ).match(/(\d+)([ mins]*)/);
            if (!durationMatch) {
                console.warn(
                    `${LOG_PREFIX} Could not parse duration from '${event.run_time}' for '${event.title}'`
                );
            } else {
                duration = +durationMatch[1];
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
                            coverUrl: event.image_url,
                            bookingUrl: perf.html
                                ? parse(perf.html)
                                      .querySelector('a')
                                      ?.getAttribute('href')
                                : undefined,
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
            coverUrl: s.coverUrl,
        };

        const showing = {
            startTime: s.startTime,
            bookingUrl: s.bookingUrl,
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
