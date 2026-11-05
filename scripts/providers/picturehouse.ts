import { z } from 'zod';
import { fetchPage } from '../http';
import { cinemaDate } from '../dates';
import { plainText } from '../programmeScraper';
import type { FilmShowings } from '../types';

const PicturehouseProgramme = z.object({
    response: z.literal('success'),
    movies: z.array(
        z.object({
            ScheduledFilmId: z.string().min(1),
            Title: z.string().min(1),
            RunTime: z.string().optional(),
            image_url: z.string().optional(),
            show_times: z.array(
                z.object({
                    CinemaId: z.string(),
                    SessionId: z.string().min(1),
                    Showtime: z.string().regex(/[T ]\d{2}:\d{2}/),
                    ScreenName: z.string().optional(),
                    IsAllocatedSeating: z.boolean().optional(),
                })
            ),
        })
    ),
});

export async function loadPicturehouseProgramme(
    cinemaId: string
): Promise<unknown> {
    // The site's Show All Dates action. This is a read-only listings POST.
    const response = await fetchPage(
        'https://www.picturehouses.com/api/get-movies-ajax',
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest',
            },
            body: new URLSearchParams({
                cinema_id: cinemaId,
                start_date: 'show_all_dates',
            }),
        }
    );
    return response.json();
}

export function parsePicturehouseProgramme(
    source: unknown,
    cinemaId: string,
    website: string
): FilmShowings[] {
    return PicturehouseProgramme.parse(source).movies.flatMap((movie) => {
        // Films can be grouped across venues; top-level CinemaId is not a reliable filter.
        const sessions = movie.show_times.filter(
            (session) => session.CinemaId === cinemaId
        );
        if (!sessions.length) return [];
        return [
            {
                film: {
                    title: plainText(movie.Title),
                    url: `https://www.picturehouses.com/movie-details/${cinemaId}/${encodeURIComponent(movie.ScheduledFilmId)}`,
                    duration:
                        Number(movie.RunTime) > 0
                            ? Number(movie.RunTime)
                            : undefined,
                    coverUrl: movie.image_url || undefined,
                },
                showings: sessions.map((session) => ({
                    startTime: cinemaDate(session.Showtime, 'Europe/London'),
                    theatre: session.ScreenName,
                    bookingUrl: session.SessionId
                        ? `https://web.picturehouses.com/order/showtimes/${cinemaId}-${encodeURIComponent(session.SessionId)}/${session.IsAllocatedSeating === false ? 'tickets' : 'seats'}`
                        : website,
                })),
            },
        ];
    });
}
