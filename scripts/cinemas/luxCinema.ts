import type { CinemaShowing, Cinema, FilmShowings } from '../types';

export interface LuxAPIResponse {
    events: Event[];
    rest_url: string;
    total: number;
    total_pages: number;
}

export interface Event {
    id: number;
    global_id: string;
    global_id_lineage: string[];
    author: string;
    status: string;
    date: Date;
    date_utc: Date;
    modified: Date;
    modified_utc: Date;
    url: string;
    rest_url: string;
    title: string;
    description: string;
    excerpt: string;
    slug: string;
    image: Image;
    all_day: boolean;
    start_date: Date;
    start_date_details: DateDetails;
    end_date: Date;
    end_date_details: DateDetails;
    utc_start_date: Date;
    utc_start_date_details: DateDetails;
    utc_end_date: Date;
    utc_end_date_details: DateDetails;
    timezone: string;
    timezone_abbr: string;
    cost: string;
    cost_details: CostDetails;
    website: string;
    show_map: boolean;
    show_map_link: boolean;
    hide_from_listings: boolean;
    sticky: boolean;
    featured: boolean;
    categories: any[];
    tags: any[];
    venue: Venue;
    organizer: any[];
    custom_fields: any[];
    is_virtual: boolean;
    virtual_url: null;
    virtual_video_source: string;
}

export interface CostDetails {
    currency_symbol: string;
    currency_code: string;
    currency_position: string;
    values: any[];
}

export interface DateDetails {
    year: string;
    month: string;
    day: string;
    hour: string;
    minutes: string;
    seconds: string;
}

export interface Image {
    url: string;
    id: number;
    extension: string;
    width: number;
    height: number;
    filesize: number;
    sizes: { [key: string]: Size };
}

export interface Size {
    width: number;
    height: number;
    'mime-type': MIMEType;
    filesize: number;
    url: string;
}

export enum MIMEType {
    ImageJPEG = 'image/jpeg',
}

export interface Venue {
    id: number;
    author: string;
    status: string;
    date: Date;
    date_utc: Date;
    modified: Date;
    modified_utc: Date;
    url: string;
    venue: string;
    slug: string;
    address: string;
    city: string;
    country: string;
    zip: string;
    show_map: boolean;
    show_map_link: boolean;
    global_id: string;
    global_id_lineage: string[];
}

const CINEMA: Cinema = {
    name: 'Lux Cinema',
    location: 'Padova',
    defaultLanguage: 'it-IT',
};

const LOG_PREFIX = '[' + CINEMA.name + ']';
const BASE_URL = 'https://www.movieconnection.it';
const API_URL = 'https://www.movieconnection.it/wp-json/tribe/events/v1/events';

export async function scraper(): Promise<CinemaShowing[]> {
    const res = await fetch(API_URL);
    const json = (await res.json()) as LuxAPIResponse;
    const filmMap = new Map() as Map<string, FilmShowings>;

    json.events.forEach((event) => {
        const filmKey = event.website; // questionable choice for a key

        if (!filmMap.has(filmKey)) {
            let [title, director, moreInfo] = event.title
                .trim()
                .split(/\s*(?:&#8211;|\s#)\s*/);
            let vos = false;
            if (title.endsWith('[v.o.s.]')) {
                vos = true;
                title = title.slice(0, -8).trimEnd();
            }
            const country = moreInfo.match(/([^\d]+) \d/)?.[1];
            const year = moreInfo
                .slice((country ?? '').length)
                .match(/ +(\d+) +\(/)?.[1];
            const duration = moreInfo.match(/\((\d+)(?:&#8242;|’|′)\)/)?.[1];
            const filmShowing: FilmShowings = {
                film: {
                    title: title,
                    url: event.url,
                    director: director,
                    duration: duration ? parseInt(duration) : undefined,
                    language: vos ? undefined : CINEMA.defaultLanguage,
                    year: year ? parseInt(year) : undefined,
                    country: country,
                    coverUrl: event.image.url, // smaller sizes could be used
                },
                showings: [],
            };
            filmMap.set(filmKey, filmShowing);
        }

        // Add showing to existing film entry
        const filmEntry = filmMap.get(filmKey)!;
        filmEntry.showings.push({
            startTime: event.utc_start_date + '+0', // +0 for the timezone
            bookingUrl: `https://www.liveticket.it/cinemaluxpadova#EventsTitleAnchor`, // no way to access the real url
        });
    });
    return [
        {
            cinema: CINEMA,
            showings: Array.from(filmMap.values()),
        },
    ];
}
