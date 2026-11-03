import { parse } from 'node-html-parser';
import type { CinemaShowing, Cinema, FilmShowings } from '../types';
import { fetchPage } from '../http';
import { cinemaDate } from '../dates';

interface LuxEvent {
    id: number;
    title: string;
    website?: string;
    url: string;
    image?: { url?: string } | false;
    start_date: string;
    utc_start_date?: string;
    timezone?: string;
}
interface LuxResponse {
    events: LuxEvent[];
    total_pages: number;
}
const CINEMA: Cinema = {
    name: 'Lux Cinema',
    location: 'Padova',
    website: 'http://cinemaluxpadova.it',
    defaultLanguage: 'it-IT',
};
const API_URL = 'https://www.movieconnection.it/wp-json/tribe/events/v1/events';

export function parseLuxEvents(events: LuxEvent[]): FilmShowings[] {
    const films = new Map<string, FilmShowings>();
    for (const event of events) {
        const decoded = parse(event.title).textContent.trim();
        const [rawTitle, director, moreInfo = ''] =
            decoded.split(/\s+[–—]\s+|\s+#\s*/);
        const vos = /\[v\.o\.s\.\]$/i.test(rawTitle);
        const title = rawTitle.replace(/\s*\[v\.o\.s\.\]$/i, '').trim();
        // A missing website previously collapsed every such event into one film.
        const key = event.website?.trim() || event.url || String(event.id);
        if (!films.has(key))
            films.set(key, {
                film: {
                    title,
                    url: event.website?.trim() || event.url,
                    director,
                    duration:
                        Number(moreInfo.match(/\((\d+)\s*[’′']/)?.[1]) ||
                        undefined,
                    year:
                        Number(moreInfo.match(/\b(19\d{2}|20\d{2})\b/)?.[1]) ||
                        undefined,
                    country: moreInfo.match(/^([^\d]+)\s+\d/)?.[1]?.trim(),
                    language: vos ? undefined : CINEMA.defaultLanguage,
                    coverUrl: event.image ? event.image.url : undefined,
                },
                showings: [],
            });
        films.get(key)!.showings.push({
            startTime: event.utc_start_date
                ? cinemaDate(event.utc_start_date, 'UTC')
                : cinemaDate(event.start_date, event.timezone || 'Europe/Rome'),
            bookingUrl:
                'https://www.liveticket.it/cinemaluxpadova#EventsTitleAnchor',
        });
    }
    return [...films.values()];
}
export async function scraper(): Promise<CinemaShowing[]> {
    const events: LuxEvent[] = [];
    let totalPages = 1;
    for (let page = 1; page <= totalPages; page++) {
        const response = await fetchPage(
            `${API_URL}?per_page=100&page=${page}`
        );
        const data = (await response.json()) as LuxResponse;
        if (
            !Array.isArray(data.events) ||
            !Number.isInteger(data.total_pages) ||
            data.total_pages < 0
        )
            throw new Error('Unexpected Lux API response');
        totalPages = data.total_pages;
        events.push(...data.events);
    }
    return [{ cinema: CINEMA, showings: parseLuxEvents(events) }];
}
