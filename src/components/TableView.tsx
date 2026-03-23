import {
    groupByMovie,
    groupByCinema,
    sortGroupedByStartTime,
    sortScreeningByStartTime,
} from '../utils/grouping';
import { formatTime, formatDate } from '../utils/formatters';
import { buildDayUrl } from '../utils/url';
import type { ShowingsTable, CinemaTable, FilmWithPoster } from '../api';

interface Props {
    screenings: ShowingsTable[];
    getMovie: (id: number) => FilmWithPoster | undefined;
    getCinema: (id: number) => CinemaTable | undefined;
    showTimes: boolean;
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

export default function TableView({ screenings, getMovie, getCinema, showTimes }: Props) {
    const rows = groupByMovie(screenings, getMovie).sort(sortGroupedByStartTime);

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="sticky top-0 bg-neutral-900 border-b border-neutral-700 text-neutral-400 text-xs uppercase tracking-wider">
                        <th className="px-4 py-3 font-medium w-1/4">Title</th>
                        <th className="px-4 py-3 font-medium w-1/6">Director</th>
                        <th className="px-4 py-3 font-medium w-1/6">Cinema</th>
                        <th className="px-4 py-3 font-medium">{showTimes ? 'Times' : 'Days'}</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.flatMap(([key, filmScreenings], filmIndex) => {
                        const movie = getMovie(filmScreenings[0].film_id);
                        const cinemaGroups = groupByCinema(filmScreenings);
                        const cinemaIds = Object.keys(cinemaGroups).map(Number);
                        const bg = filmIndex % 2 === 0 ? 'bg-neutral-900' : 'bg-neutral-800';

                        return cinemaIds.map((id, cinemaIndex) => {
                            const isFirst = cinemaIndex === 0;
                            const dayGroups = groupByCalendarDay(
                                cinemaGroups[id].sort(sortScreeningByStartTime)
                            );
                            return (
                                <tr
                                    key={`${key}-${id}`}
                                    className={`${bg} hover:bg-neutral-700 transition-colors align-top ${isFirst ? 'border-t border-neutral-700' : 'border-t border-neutral-800/50'}`}
                                >
                                    {isFirst && (
                                        <>
                                            <td rowSpan={cinemaIds.length} className="px-4 py-3">
                                                <span className="font-semibold text-white">
                                                    {movie?.title ?? '—'}
                                                </span>
                                                {movie?.release_year && (
                                                    <span className="text-neutral-500 text-sm ml-2">
                                                        {movie.release_year}
                                                    </span>
                                                )}
                                            </td>
                                            <td rowSpan={cinemaIds.length} className="px-4 py-3 text-neutral-300 text-sm">
                                                {movie?.director ?? '—'}
                                            </td>
                                        </>
                                    )}

                                    <td className="px-4 py-3 text-neutral-300 text-sm">
                                        {getCinema(id)?.name ?? `Cinema ${id}`}
                                    </td>

                                    <td className="px-4 py-3">
                                        {showTimes ? (
                                            dayGroups.map(([day, dayScreenings]) => (
                                                <div
                                                    key={day}
                                                    className="flex flex-wrap items-baseline gap-x-2 mb-1 last:mb-0"
                                                >
                                                    <span className="text-neutral-500 text-xs w-24 shrink-0">
                                                        {day}
                                                    </span>
                                                    <div className="flex flex-wrap gap-x-2 gap-y-1">
                                                        {dayScreenings.map((s) =>
                                                            s.booking_url ? (
                                                                <a
                                                                    key={s.id}
                                                                    href={s.booking_url}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="text-red-400 hover:text-red-300 text-sm tabular-nums underline"
                                                                >
                                                                    {formatTime(s.start_time)}
                                                                </a>
                                                            ) : (
                                                                <span
                                                                    key={s.id}
                                                                    className="text-red-400 text-sm tabular-nums"
                                                                >
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
                                    </td>
                                </tr>
                            );
                        });
                    })}
                </tbody>
            </table>
        </div>
    );
}
