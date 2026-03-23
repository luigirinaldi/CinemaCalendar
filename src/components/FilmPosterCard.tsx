import type { ReactNode } from 'react';
import type { FilmWithPoster, ShowingsTable } from '../api';

const TMDB_FAVICON =
    'https://www.themoviedb.org/assets/2/favicon-32x32-543a21832c8931d3494a68881f6afcafc58e96c5d324345377f3197a37b367b5.png';
import { formatDate, formatTime } from '../utils/formatters';
import { sortScreeningByStartTime } from '../utils/grouping';
import { buildDayUrl } from '../utils/url';

export function ScreeningTime({ screening }: { screening: ShowingsTable }) {
    const time = formatTime(screening.start_time);
    const cls = 'text-red-500 inline';
    return screening.booking_url ? (
        <a className={`${cls} underline`} href={screening.booking_url} target="_blank">
            {time}
        </a>
    ) : (
        <p className={cls}>{time}</p>
    );
}

export function DayRow({
    screenings,
    showTimes,
}: {
    screenings: ShowingsTable[];
    showTimes: boolean;
}) {
    const dayLabel = formatDate(screenings[0].start_time);
    if (!showTimes) {
        return (
            <a
                href={buildDayUrl(new Date(screenings[0].start_time))}
                className="block text-neutral-400 text-xs hover:text-white hover:underline"
            >
                {dayLabel}
            </a>
        );
    }
    return (
        <div className="flex justify-between items-start">
            <p className="text-neutral-400 flex-shrink-0 text-xs">{dayLabel}</p>
            <div className="flex gap-x-2 flex-wrap justify-end">
                {screenings.sort(sortScreeningByStartTime).map((s) => (
                    <ScreeningTime key={s.id} screening={s} />
                ))}
            </div>
        </div>
    );
}

interface FilmPosterCardProps {
    movie: FilmWithPoster | undefined;
    children: ReactNode;
    className?: string;
}

export default function FilmPosterCard({ movie, children, className = 'bg-neutral-800' }: FilmPosterCardProps) {
    return (
        <div className={`${className} rounded-lg overflow-hidden flex flex-col w-40 sm:w-48`}>
            {movie?.poster_url ? (
                <img
                    src={movie.poster_url}
                    alt={movie.title ?? 'Poster'}
                    loading="lazy"
                    className="w-full aspect-[2/3] object-cover"
                />
            ) : null}
            <div className="p-3 flex flex-col">
                <div className="mb-2">
                    <div className="flex items-start justify-between gap-1">
                        <h3 className="text-base font-semibold leading-tight">
                            {movie?.tmdb_info?.title ?? movie?.title}
                        </h3>
                        {movie?.tmdb_info && (
                            <a
                                href={`https://www.themoviedb.org/movie/${movie.tmdb_info.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="View on TMDB"
                                className="shrink-0 mt-0.5"
                            >
                                <img
                                    src={TMDB_FAVICON}
                                    alt="TMDB"
                                    className="w-4 h-4 shrink-0 opacity-60 hover:opacity-100"
                                />
                            </a>
                        )}
                    </div>
                    {movie?.director ? (
                        <p className="text-neutral-400 text-xs mt-1">{movie.director}</p>
                    ) : null}
                    <p className="text-neutral-500 text-xs mt-1">{movie?.duration} min</p>
                </div>
                {children}
            </div>
        </div>
    );
}
