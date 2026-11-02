import { DateTime } from 'luxon';
import { parse } from 'node-html-parser';
import type { Cinema, CinemaShowing, FilmShowings } from '../types';
import { fetchPage } from '../http';

interface PortoEvent {
    id: number;
    link: string;
    title: { rendered: string };
    class_list?: string[];
    acf: Record<string, unknown> | [];
    yoast_head_json?: { og_image?: { url: string }[] };
}
const CINEMA: Cinema = {
    name: 'Fronte del Porto',
    location: 'Padova',
    defaultLanguage: 'it-IT',
};
const BASE_URL = 'https://www.frontedelportopadova.it';

/** WordPress publication dates are not screening times; use the ACF programme. */
export function parsePortoEvents(events: PortoEvent[]): FilmShowings[] {
    return events.flatMap((event) => {
        if (!event.class_list?.includes('categoria_evento-cinema')) return [];
        const acf = event.acf;
        if (Array.isArray(acf))
            throw new Error(`Missing programme fields for ${event.link}`);
        const booking = acf.link_prenotazione;
        const bookingUrl =
            typeof booking === 'object' &&
            booking !== null &&
            'url' in booking &&
            typeof booking.url === 'string'
                ? booking.url
                : undefined;
        const showings = Object.entries(acf).flatMap(([key, value]) => {
            if (!/^data_programmazione(?:_\d+)?$/.test(key) || !value)
                return [];
            const time = acf[key.replace('data_', 'ora_')];
            if (!time) {
                console.warn(
                    `Skipping untimed Fronte del Porto slot: ${event.link} (${key})`
                );
                return [];
            }
            const date = DateTime.fromFormat(
                `${value} ${time}`,
                'yyyyMMdd HH:mm:ss',
                { zone: 'Europe/Rome' }
            );
            if (!date.isValid)
                throw new Error(
                    `Invalid programme date for ${event.link}: ${value} ${time}`
                );
            return [{ startTime: date.toUTC().toISO()!, bookingUrl }];
        });
        const info =
            typeof acf.caratteristica_evento === 'string'
                ? parse(acf.caratteristica_evento).textContent
                : '';
        return [
            {
                film: {
                    title: parse(event.title.rendered).textContent.trim(),
                    url: event.link,
                    director:
                        typeof acf.autore_opera === 'string'
                            ? acf.autore_opera
                            : undefined,
                    duration:
                        Number(info.match(/\b(\d+)\s*['’′]/)?.[1]) || undefined,
                    year:
                        Number(info.match(/\b(19\d{2}|20\d{2})\b/)?.[1]) ||
                        undefined,
                    coverUrl: event.yoast_head_json?.og_image?.[0]?.url,
                },
                showings,
            },
        ];
    });
}
export async function scraper(): Promise<CinemaShowing[]> {
    const events: PortoEvent[] = [];
    let totalPages = 1;
    for (let page = 1; page <= totalPages; page++) {
        const response = await fetchPage(
            `${BASE_URL}/wp-json/wp/v2/evento?per_page=100&page=${page}`
        );
        const count = response.headers.get('x-wp-totalpages');
        if (
            count === null ||
            !Number.isInteger(Number(count)) ||
            Number(count) < 0
        )
            throw new Error(
                'Fronte del Porto pagination header missing or invalid'
            );
        totalPages = Number(count);
        const data = await response.json();
        if (!Array.isArray(data))
            throw new Error('Unexpected Fronte del Porto response');
        events.push(...data);
    }
    return [{ cinema: CINEMA, showings: parsePortoEvents(events) }];
}
