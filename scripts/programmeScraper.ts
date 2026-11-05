import { TextNode } from 'node-html-parser';
import {
    CinemaShowingsSchema,
    type Cinema,
    type FilmShowings,
    type ScraperFunction,
} from './types';

/** Shared contract: fetch source data, validate/parse it, then normalize the programme. */
export function createProgrammeScraper<T>(options: {
    cinema: Cinema;
    load: () => Promise<T>;
    parse: (source: T) => FilmShowings[];
}): ScraperFunction {
    return async () => {
        const films = new Map<string, FilmShowings>();
        for (const entry of options.parse(await options.load())) {
            const key = JSON.stringify([entry.film.title, entry.film.url]);
            const existing = films.get(key);
            if (existing) existing.showings.push(...entry.showings);
            else
                films.set(key, {
                    film: entry.film,
                    showings: [...entry.showings],
                });
        }
        for (const entry of films.values()) {
            // Keep simultaneous performances in different auditoria.
            entry.showings = [
                ...new Map(
                    entry.showings.map((showing) => [
                        JSON.stringify([
                            Date.parse(showing.startTime),
                            showing.theatre,
                            showing.bookingUrl,
                        ]),
                        showing,
                    ])
                ).values(),
            ].sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
        }
        return CinemaShowingsSchema.parse([
            { cinema: options.cinema, showings: [...films.values()] },
        ]);
    };
}

export function plainText(value: string): string {
    // API titles are text, not HTML; preserve literal titles such as <RUN IT>.
    return new TextNode(value).text.trim();
}

export function publicUrl(value: string, base: string): string {
    const url = new URL(value, base);
    if (!['http:', 'https:'].includes(url.protocol))
        throw new Error('Expected a public HTTP(S) URL');
    return url.href;
}
