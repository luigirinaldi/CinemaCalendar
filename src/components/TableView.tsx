import {
    groupByMovie,
    groupByCinema,
    sortGroupedByStartTime,
    sortScreeningByStartTime,
} from '../utils/grouping';
import { formatTime, formatDate } from '../utils/formatters';
import type { ShowingsTable, CinemaTable, FilmWithPoster } from '../api';

interface Props {
    screenings: ShowingsTable[];
    getMovie: (id: number) => FilmWithPoster | undefined;
    getCinema: (id: number) => CinemaTable | undefined;
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

export default function TableView({ screenings, getMovie, getCinema }: Props) {
    const rows = groupByMovie(screenings, getMovie).sort(sortGroupedByStartTime);

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="sticky top-0 bg-neutral-900 border-b border-neutral-700 text-neutral-400 text-xs uppercase tracking-wider">
                        <th className="px-4 py-3 font-medium w-1/4">Title</th>
                        <th className="px-4 py-3 font-medium w-1/6">Director</th>
                        <th className="px-4 py-3 font-medium w-1/6">Cinemas</th>
                        <th className="px-4 py-3 font-medium">Times</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(([key, filmScreenings]) => {
                        const movie = getMovie(filmScreenings[0].film_id);
                        const cinemaGroups = groupByCinema(filmScreenings);
                        const cinemaIds = Object.keys(cinemaGroups).map(Number);
                        const multiCinema = cinemaIds.length > 1;

                        return (
                            <tr
                                key={key}
                                className="border-b border-neutral-800 odd:bg-neutral-900 even:bg-neutral-800 hover:bg-neutral-700 transition-colors align-top"
                            >
                                {/* Title */}
                                <td className="px-4 py-3">
                                    <span className="font-semibold text-white">
                                        {movie?.title ?? '—'}
                                    </span>
                                    {movie?.release_year && (
                                        <span className="text-neutral-500 text-sm ml-2">
                                            {movie.release_year}
                                        </span>
                                    )}
                                </td>

                                {/* Director */}
                                <td className="px-4 py-3 text-neutral-300 text-sm">
                                    {movie?.director ?? '—'}
                                </td>

                                {/* Cinemas */}
                                <td className="px-4 py-3 text-neutral-300 text-sm">
                                    {cinemaIds.map((id) => (
                                        <div key={id}>{getCinema(id)?.name ?? `Cinema ${id}`}</div>
                                    ))}
                                </td>

                                {/* Times */}
                                <td className="px-4 py-3">
                                    {cinemaIds.map((id) => {
                                        const dayGroups = groupByCalendarDay(
                                            cinemaGroups[id].sort(sortScreeningByStartTime)
                                        );
                                        return (
                                            <div
                                                key={id}
                                                className={multiCinema ? 'mb-3 last:mb-0' : ''}
                                            >
                                                {multiCinema && (
                                                    <div className="text-neutral-500 text-xs mb-1">
                                                        {getCinema(id)?.name ?? `Cinema ${id}`}
                                                    </div>
                                                )}
                                                {dayGroups.map(([day, dayScreenings]) => (
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
                                                ))}
                                            </div>
                                        );
                                    })}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
