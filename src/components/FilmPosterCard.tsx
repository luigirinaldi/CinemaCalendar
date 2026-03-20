import type { ReactNode } from 'react';
import type { FilmWithPoster, ShowingsTable } from '../api';
import { formatDate, formatTime } from '../utils/formatters';
import { sortScreeningByStartTime } from '../utils/grouping';

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

export function DayRow({ screenings }: { screenings: ShowingsTable[] }) {
    return (
        <div className="flex justify-between items-start">
            <p className="text-neutral-400 flex-shrink-0 text-xs">
                {formatDate(screenings[0].start_time)}
            </p>
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
                    <h3 className="text-base font-semibold leading-tight">{movie?.title}</h3>
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
