import { Clock, ExternalLink } from 'lucide-react';
import {
    groupByMovie,
    groupByCinema,
    sortGroupedByStartTime,
    sortScreeningByStartTime,
} from '../utils/grouping';
import { formatTime, formatDate } from '../utils/formatters';
import { buildDayUrl } from '../utils/url';
import type { ShowMode } from '../types';
import type { ShowingsTable, CinemaTable, FilmWithPoster } from '../api';

const TMDB_FAVICON =
    'https://www.themoviedb.org/assets/2/favicon-32x32-543a21832c8931d3494a68881f6afcafc58e96c5d324345377f3197a37b367b5.png';

interface Props {
    screenings: ShowingsTable[];
    getMovie: (id: number) => FilmWithPoster | undefined;
    getCinema: (id: number) => CinemaTable | undefined;
    showTimes: boolean;
    singleDay: boolean;
    showMode: ShowMode;
    onShowModeChange: (m: ShowMode) => void;
}

function groupByCalendarDay(screenings: ShowingsTable[]): [string, ShowingsTable[]][] {
    const map = new Map<string, ShowingsTable[]>();
    screenings.forEach((s) => {
        const key = formatDate(s.start_time);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(s);
    });
    return Array.from(map.entries());
}

interface ScreeningTimesProps {
    cinemaScreenings: ShowingsTable[];
    getCinema: (id: number) => CinemaTable | undefined;
    showTimes: boolean;
    singleDay: boolean;
}

function ScreeningTimes({ cinemaScreenings, getCinema, showTimes, singleDay }: ScreeningTimesProps) {
    const cinemaGroups = groupByCinema(cinemaScreenings);
    const cinemaIds = Object.keys(cinemaGroups).map(Number);

    return (
        <div className="divide-y divide-neutral-600">
            {cinemaIds.map((id) => {
                const dayGroups = groupByCalendarDay(cinemaGroups[id].sort(sortScreeningByStartTime));
                return (
                    <div key={id} className="flex flex-col md:flex-row md:gap-4 py-1 first:pt-0 last:pb-0">
                        <span className="text-neutral-300 text-sm md:w-40 md:shrink-0 mb-1 md:mb-0">
                            {getCinema(id)?.name ?? `Cinema ${id}`}
                        </span>
                        <div className="flex-1">
                            {showTimes ? (
                                dayGroups.map(([day, dayScreenings]) => (
                                    <div key={day} className="flex flex-wrap items-baseline gap-x-2 mb-1 last:mb-0">
                                        {!singleDay && <span className="text-neutral-500 text-xs w-24 shrink-0">{day}</span>}
                                        <div className="flex flex-wrap gap-x-2 gap-y-1">
                                            {dayScreenings.map((s) =>
                                                s.booking_url ? (
                                                    <a
                                                        key={s.id}
                                                        href={s.booking_url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        title="Book tickets"
                                                        className="inline-flex items-center gap-0.5 text-red-400 opacity-80 hover:opacity-100"
                                                    >
                                                        <span className="text-sm tabular-nums">{formatTime(s.start_time)}</span>
                                                        <ExternalLink className="w-3 h-3 shrink-0" />
                                                    </a>
                                                ) : (
                                                    <span key={s.id} className="text-red-400 text-sm tabular-nums">
                                                        {formatTime(s.start_time)}
                                                    </span>
                                                )
                                            )}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="flex flex-wrap gap-x-3 gap-y-1">
                                    {dayGroups.map(([day, dayScreenings]) => (
                                        <a
                                            key={day}
                                            href={buildDayUrl(new Date(dayScreenings[0].start_time))}
                                            className="text-neutral-400 text-xs hover:text-white hover:underline"
                                        >
                                            {day}
                                        </a>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export default function TableView({ screenings, getMovie, getCinema, showTimes, singleDay, showMode, onShowModeChange }: Props) {
    const rows = groupByMovie(screenings, getMovie).sort(sortGroupedByStartTime);

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="sticky top-0 bg-neutral-900 border-b border-neutral-600 text-neutral-400 text-xs uppercase tracking-wider">
                        <th className="px-4 py-3 font-medium w-1/4">Title</th>
                        <th className="px-4 py-3 font-medium w-1/6 hidden md:table-cell">Director</th>
                        <th className="px-4 py-3 font-medium">
                            <div className="flex items-center gap-2 justify-start">
                                <span>{showTimes ? 'Cinema / Times' : 'Cinema / Days'}</span>
                                {!singleDay && (
                                    <button
                                        onClick={() => onShowModeChange(showMode === 'full' ? 'compact' : 'full')}
                                        title={showMode === 'full' ? 'Hide times' : 'Show times'}
                                        className={`p-1 rounded transition ${showMode === 'full' ? 'bg-red-700 text-white hover:bg-red-600' : 'text-red-500 hover:text-red-400'}`}
                                    >
                                        <Clock className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(([key, filmScreenings]) => {
                        const movie = getMovie(filmScreenings[0].film_id);
                        const tmdb = movie?.tmdb_info ?? null;
                        const title = tmdb?.title ?? movie?.title ?? '—';
                        const year = tmdb?.release_date
                            ? new Date(tmdb.release_date).getFullYear()
                            : movie?.release_year;
                        const tmdbUrl = tmdb ? `https://www.themoviedb.org/movie/${tmdb.id}` : null;
                        return (
                            <tr
                                key={key}
                                className="border-t border-neutral-700 odd:bg-neutral-900 even:bg-neutral-800 hover:bg-neutral-700 transition-colors align-top"
                            >
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                        <span className="font-semibold text-white">{title}</span>
                                        {year && <span className="text-neutral-500 text-sm hidden md:inline">{year}</span>}
                                        {tmdbUrl && (
                                            <a
                                                href={tmdbUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                title="View on TMDB"
                                            >
                                                <img
                                                    src={TMDB_FAVICON}
                                                    alt="TMDB"
                                                    className="w-4 h-4 shrink-0 opacity-60 hover:opacity-100"
                                                />
                                            </a>
                                        )}
                                    </div>
                                    {(year || movie?.director) && (
                                        <div className="text-neutral-400 text-sm mt-0.5 md:hidden">
                                            {year && <span className="text-neutral-500">{year}</span>}
                                            {year && movie?.director && <span className="text-neutral-600 mx-1">·</span>}
                                            {movie?.director && <span>{movie.director}</span>}
                                        </div>
                                    )}
                                </td>

                                <td className="px-4 py-3 text-neutral-300 text-sm hidden md:table-cell">
                                    {movie?.director ?? '—'}
                                </td>

                                <td className="px-4 py-3">
                                    <ScreeningTimes
                                        cinemaScreenings={filmScreenings}
                                        getCinema={getCinema}
                                        showTimes={showTimes}
                                        singleDay={singleDay}
                                    />
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
