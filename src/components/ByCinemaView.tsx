import { MapPin } from 'lucide-react';
import type { CinemaTable, FilmWithPoster, ShowingsTable } from '../api';
import { formatDate, formatTime } from '../utils/formatters';
import {
    groupByCinema,
    groupByDay,
    groupByMovie,
    sortGroupedByStartTime,
    sortScreeningByStartTime,
} from '../utils/grouping';

interface ByCinemaViewProps {
    screenings: ShowingsTable[];
    getMovie: (id: number) => FilmWithPoster | undefined;
    getCinema: (id: number) => CinemaTable | undefined;
}

function ScreeningTime({ screening }: { screening: ShowingsTable }) {
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

export default function ByCinemaView({ screenings, getMovie, getCinema }: ByCinemaViewProps) {
    return (
        <div className="space-y-8">
            {Object.entries(groupByCinema(screenings)).map(([cinemaId, cinemaScreenings]) => {
                const cinema = getCinema(Number(cinemaId));
                const movieGroups = groupByMovie(cinemaScreenings, getMovie).sort(
                    sortGroupedByStartTime
                );
                return (
                    <div key={cinemaId} className="bg-neutral-800 rounded-lg p-6">
                        <h2 className="text-2xl font-bold mb-2">{cinema?.name}</h2>
                        <p className="text-neutral-400 mb-4 flex items-center gap-2">
                            <MapPin className="w-4 h-4" />
                            {cinema?.location}
                        </p>
                        <div className="flex flex-wrap gap-6 justify-around">
                            {movieGroups.map(([key, movieScreenings]) => {
                                const movie = getMovie(movieScreenings[0]?.film_id ?? -1);
                                const byDay = Object.entries(
                                    groupByDay(movieScreenings.sort(sortScreeningByStartTime))
                                ).sort(sortGroupedByStartTime);
                                return (
                                    <div
                                        key={key}
                                        className="bg-neutral-600 rounded-lg overflow-hidden flex flex-col w-30 sm:w-40"
                                    >
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
                                                <h3 className="text-base font-semibold leading-tight">
                                                    {movie?.title}
                                                </h3>
                                                {movie?.director ? (
                                                    <p className="text-neutral-400 text-xs mt-1">
                                                        {movie.director}
                                                    </p>
                                                ) : null}
                                                <p className="text-neutral-500 text-xs mt-1">
                                                    {movie?.duration} min
                                                </p>
                                            </div>
                                            <div className="space-y-1">
                                                {byDay.map(([_day, dayScreenings]) => (
                                                    <div
                                                        key={dayScreenings[0]?.id}
                                                        className="flex justify-between items-start"
                                                    >
                                                        <p className="text-neutral-400 flex-shrink-0 text-xs">
                                                            {formatDate(dayScreenings[0].start_time)}
                                                        </p>
                                                        <div className="flex gap-x-2 flex-wrap justify-end">
                                                            {dayScreenings
                                                                .sort(sortScreeningByStartTime)
                                                                .map((s) => (
                                                                    <ScreeningTime
                                                                        key={s.id}
                                                                        screening={s}
                                                                    />
                                                                ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
