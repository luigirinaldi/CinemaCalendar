import { parse } from 'node-html-parser';
import { z } from 'zod';
import { fetchPage } from '../http';
import { cinemaDate } from '../dates';
import { plainText, publicUrl } from '../programmeScraper';
import type { FilmShowings } from '../types';

const Movies = z.array(
    z.object({
        id: z.number(),
        title: z.string().min(1),
        director: z.string().nullish(),
        duration: z.number().nullish(),
        posterpath: z.string().nullish(),
    })
);
const Shows = z.array(
    z.object({
        id: z.number(),
        cinemaid: z.string(),
        mediaid: z.object({ id: z.number() }),
        screenid: z.object({ id: z.number() }).nullish(),
        showtime: z.string().regex(/T\d{2}:\d{2}/),
        school: z.boolean().optional(),
        cancelled: z.boolean().optional(),
        deleted: z.boolean().optional(),
    })
);

export async function loadCineBoutiqueProgramme(
    bookingOrigin: string
): Promise<{ movies: unknown; shows: unknown }> {
    const root = parse(await (await fetchPage(bookingOrigin)).text());
    // This public application token is supplied by the booking page, not an account credential.
    const token = root
        .querySelector('meta[name="api_token"]')
        ?.getAttribute('content');
    const script = root
        .querySelectorAll('script[src]')
        .map((s) => s.getAttribute('src')!)
        .find((src) =>
            /\.cineoffice\.fr\/vad\/client\/build\/static\/js\/main\.js/.test(
                src
            )
        );
    if (!token || !script)
        throw new Error('Ciné Boutique public API configuration is missing');
    const origin = new URL(script).origin;
    const get = async (path: string) =>
        (
            await fetchPage(
                `${origin}/vad/${path}?${new URLSearchParams({ api_token: token })}`
            )
        ).json() as Promise<unknown>;
    const [movies, shows] = await Promise.all([get('media'), get('shows')]);
    return { movies, shows };
}

export function parseCineBoutiqueProgramme(
    source: { movies: unknown; shows: unknown },
    cinemaId: string,
    bookingOrigin: string
): FilmShowings[] {
    const movies = new Map(
        Movies.parse(source.movies).map((movie) => [movie.id, movie])
    );
    return Shows.parse(source.shows)
        .filter(
            (show) =>
                show.cinemaid === cinemaId &&
                !show.school &&
                !show.cancelled &&
                !show.deleted
        )
        .map((show) => {
            const movie = movies.get(show.mediaid.id);
            if (!movie)
                throw new Error(
                    `Ciné Boutique metadata missing for film ${show.mediaid.id}`
                );
            const url = publicUrl(`/media/${movie.id}`, bookingOrigin);
            return {
                film: {
                    title: plainText(movie.title),
                    url,
                    director: movie.director || undefined,
                    duration:
                        movie.duration && movie.duration > 0
                            ? movie.duration / 60
                            : undefined,
                    coverUrl: movie.posterpath
                        ? publicUrl(movie.posterpath, bookingOrigin)
                        : undefined,
                },
                showings: [
                    {
                        startTime: cinemaDate(show.showtime, 'Europe/Brussels'),
                        theatre: show.screenid
                            ? `Salle ${show.screenid.id}`
                            : undefined,
                        bookingUrl: `${url}?showId=${show.id}`,
                    },
                ],
            };
        });
}
