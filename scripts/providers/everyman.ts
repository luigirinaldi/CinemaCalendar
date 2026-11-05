import { DateTime } from 'luxon';
import { z } from 'zod';
import { fetchPage, mapConcurrent } from '../http';
import { cinemaDate } from '../dates';
import { plainText, publicUrl } from '../programmeScraper';
import type { FilmShowings } from '../types';

const API = 'https://www.everymancinema.com/api/gatsby-source-boxofficeapi/';
const ScheduledDays = z.object({
    scheduledDays: z.record(z.string(), z.array(z.iso.date())),
});
const Session = z.object({
    id: z.string().min(1),
    startsAt: z.string().regex(/[T ]\d{2}:\d{2}/),
    isExpired: z.boolean().optional(),
    screen: z.object({ name: z.string().optional() }).nullish(),
    data: z
        .object({
            ticketing: z
                .array(
                    z.object({
                        provider: z.string().optional(),
                        urls: z.array(z.string()),
                    })
                )
                .optional(),
        })
        .optional(),
});
const Schedule = z.record(
    z.string(),
    z.object({
        schedule: z.record(z.string(), z.record(z.string(), z.array(Session))),
    })
);
const Movies = z.array(
    z.object({
        id: z.string(),
        title: z.string().min(1),
        runtime: z.number().nullish(),
        poster: z.string().nullish(),
        direction: z.array(z.string()).nullish(),
    })
);

async function get(path: string, params: URLSearchParams): Promise<unknown> {
    return (await fetchPage(`${API}${path}?${params}`)).json();
}

export async function loadEverymanProgramme(
    theaterId: string
): Promise<{ schedule: unknown; movies: unknown }> {
    const { scheduledDays } = ScheduledDays.parse(
        await get('scheduledMovies', new URLSearchParams({ theaterId }))
    );
    const days = Object.values(scheduledDays).flat().sort();
    if (!days.length)
        return { schedule: { [theaterId]: { schedule: {} } }, movies: [] };
    // Discover the last on-sale day instead of truncating advance/event screenings to a week.
    const to = DateTime.fromISO(days.at(-1)!, { zone: 'Europe/London' }).plus({
        days: 1,
    });
    const schedule = Schedule.parse(
        await get(
            'schedule',
            new URLSearchParams({
                from: `${days[0]}T00:00:00`,
                to: `${to.toISODate()}T03:00:00`,
                theaters: JSON.stringify({
                    id: theaterId,
                    timeZone: 'Europe/London',
                }),
            })
        )
    );
    if (!schedule[theaterId])
        throw new Error(`Everyman schedule is missing theater ${theaterId}`);
    const ids = Object.keys(schedule[theaterId].schedule);
    const chunks: string[][] = [];
    for (let index = 0; index < ids.length; index += 50)
        chunks.push(ids.slice(index, index + 50));
    const movies = (
        await mapConcurrent(
            chunks,
            async (chunk) => {
                const params = new URLSearchParams({
                    basic: 'false',
                    castingLimit: '10',
                });
                chunk.forEach((id) => params.append('ids', id));
                return Movies.parse(await get('movies', params));
            },
            2
        )
    ).flat();
    return { schedule, movies };
}

export function parseEverymanProgramme(
    source: { schedule: unknown; movies: unknown },
    theaterId: string,
    website: string
): FilmShowings[] {
    const schedule = Schedule.parse(source.schedule)[theaterId];
    if (!schedule)
        throw new Error(`Everyman schedule is missing theater ${theaterId}`);
    const movies = new Map(
        Movies.parse(source.movies).map((movie) => [movie.id, movie])
    );
    return Object.entries(schedule.schedule).map(([id, dates]) => {
        const movie = movies.get(id);
        if (!movie)
            throw new Error(
                `Everyman metadata missing for scheduled movie ${id}`
            );
        return {
            film: {
                title: plainText(movie.title),
                // The API has no CMS film permalink. Keep a stable venue listings URL;
                // session-specific purchase URLs belong on showings, not film identities.
                url: website,
                duration:
                    movie.runtime && movie.runtime > 0
                        ? movie.runtime / 60
                        : undefined,
                coverUrl: movie.poster || undefined,
                director: movie.direction?.join(', ') || undefined,
            },
            showings: Object.values(dates)
                .flat()
                .filter((session) => !session.isExpired)
                .map((session) => {
                    const tickets = session.data?.ticketing ?? [];
                    const booking = (
                        tickets.find(
                            (ticket) => ticket.provider === 'default'
                        ) ?? tickets[0]
                    )?.urls[0];
                    return {
                        startTime: cinemaDate(
                            session.startsAt,
                            'Europe/London'
                        ),
                        theatre: session.screen?.name,
                        bookingUrl: booking
                            ? publicUrl(booking, website)
                            : website,
                    };
                }),
        };
    });
}
