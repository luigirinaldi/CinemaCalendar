import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import type { FilmWithPoster, ShowingsTable } from '../api';

import { formatDate, formatTime } from '../lib/dates';
import { sortScreeningByStartTime } from '../utils/grouping';
import { buildDayUrl } from '../utils/url';
import { letterboxdFilmUrl } from '../lib/filmLinks';

export function ScreeningTime({
    screening,
    zone,
}: {
    screening: ShowingsTable;
    zone: string;
}) {
    const time = formatTime(screening.start_time, zone);
    if (screening.booking_url && /^https?:\/\//i.test(screening.booking_url)) {
        return (
            <a
                href={screening.booking_url}
                target="_blank"
                rel="noopener noreferrer"
                title="Book tickets"
                className="inline-flex items-center gap-0.5 text-red-500 opacity-80 hover:opacity-100"
            >
                <span className="tabular-nums">{time}</span>
                <ExternalLink className="w-3 h-3 shrink-0" />
            </a>
        );
    }
    return <span className="text-red-500 tabular-nums">{time}</span>;
}

export function DayRow({
    screenings,
    showTimes,
    zone,
}: {
    screenings: ShowingsTable[];
    showTimes: boolean;
    zone: string;
}) {
    const dayLabel = formatDate(screenings[0].start_time, zone);
    if (!showTimes) {
        return (
            <a
                href={buildDayUrl(new Date(screenings[0].start_time), zone)}
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
                {[...screenings].sort(sortScreeningByStartTime).map((s) => (
                    <ScreeningTime key={s.id} screening={s} zone={zone} />
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

export default function FilmPosterCard({
    movie,
    children,
    className = 'bg-neutral-800',
}: FilmPosterCardProps) {
    const title = movie?.tmdb_info?.title ?? movie?.title ?? 'Unknown film';
    const year =
        movie?.tmdb_info?.release_date?.slice(0, 4) || movie?.release_year;
    const tmdbId = movie?.tmdb_info?.id ?? movie?.tmdb_id;
    const letterboxdUrl = letterboxdFilmUrl(
        movie?.tmdb_info?.letterboxd_slug,
        tmdbId
    );
    const linkClass =
        'inline-flex items-center gap-1.5 rounded-md border border-neutral-600 px-2 py-1 text-xs font-medium text-neutral-200 transition hover:border-neutral-400 hover:bg-neutral-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400';
    return (
        <article
            className={`${className} rounded-xl border border-neutral-700 shadow-sm overflow-hidden flex flex-col w-48 sm:w-56 max-w-full`}
        >
            {movie?.poster_url && (
                <img
                    src={movie.poster_url}
                    alt={`${title} poster`}
                    loading="lazy"
                    className="w-full aspect-[2/3] object-cover bg-neutral-900"
                />
            )}
            <div className="p-3 sm:p-4 flex flex-col gap-3">
                <div className="space-y-2">
                    <h3 className="text-base font-semibold leading-snug text-white break-words">
                        {title}
                    </h3>
                    {movie?.director && (
                        <p className="text-sm leading-relaxed break-words">
                            <span className="text-neutral-400">
                                Directed by{' '}
                            </span>
                            <span className="text-neutral-200">
                                {movie.director}
                            </span>
                        </p>
                    )}
                    {(year ||
                        (movie?.duration != null && movie.duration > 0)) && (
                        <p className="flex flex-wrap items-center gap-x-2 text-xs text-neutral-400">
                            {year && <span>{year}</span>}
                            {year &&
                                movie?.duration != null &&
                                movie.duration > 0 && (
                                    <span aria-hidden="true">/</span>
                                )}
                            {movie?.duration != null && movie.duration > 0 && (
                                <span>{movie.duration} min</span>
                            )}
                        </p>
                    )}
                    {(tmdbId != null || letterboxdUrl) && (
                        <div className="flex flex-wrap gap-2 pt-1">
                            {tmdbId != null && (
                                <a
                                    className={linkClass}
                                    href={`https://www.themoviedb.org/movie/${tmdbId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="View on TMDB"
                                >
                                    TMDB{' '}
                                    <ExternalLink
                                        className="w-3 h-3"
                                        aria-hidden="true"
                                    />
                                </a>
                            )}
                            {letterboxdUrl && (
                                <a
                                    className={linkClass}
                                    href={letterboxdUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="View on Letterboxd"
                                >
                                    Letterboxd{' '}
                                    <ExternalLink
                                        className="w-3 h-3"
                                        aria-hidden="true"
                                    />
                                </a>
                            )}
                        </div>
                    )}
                </div>
                <div className="border-t border-neutral-600/60 pt-3">
                    {children}
                </div>
            </div>
        </article>
    );
}
