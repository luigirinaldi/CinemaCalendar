import type { CinemaTable, FilmTable, ShowingsTable } from '../api';
import { formatDate, formatTime } from '../utils/formatters';
import {
    groupByCinema,
    groupByDay,
    sortGroupedByStartTime,
    sortScreeningByStartTime,
} from '../utils/grouping';

interface MovieCardProps {
    movieKey: string;
    screenings: ShowingsTable[];
    getMovie: (id: number) => FilmTable | undefined;
    getCinema: (id: number) => CinemaTable | undefined;
}

export default function MovieCard({
    movieKey,
    screenings,
    getMovie,
    getCinema,
}: MovieCardProps) {
    const movie = getMovie(screenings[0]?.film_id ?? -1);

    return (
        <div key={movieKey} className="bg-neutral-800 rounded-lg p-6">
            <h3 className="text-xl font-bold mb-2">{movie?.title}</h3>
            <p className="text-neutral-400 mb-4">{movie?.duration} min</p>
            <div className="space-y-2">
                <h4 className="text-sm font-semibold text-neutral-300">
                    {screenings.length} Screening{screenings.length !== 1 ? 's' : ''}
                </h4>
                {Object.entries(groupByCinema(screenings))
                    .sort(sortGroupedByStartTime)
                    .map(([cinemaId, cinemaScreenings]) => {
                        const cinema = getCinema(Number(cinemaId));
                        return (
                            <div
                                key={cinemaId}
                                className="bg-neutral-700 rounded p-3 text-sm"
                            >
                                <p className="font-medium">{cinema?.name}</p>
                                <div className="flex flex-col justify-between">
                                    {Object.entries(
                                        groupByDay(
                                            cinemaScreenings.sort(sortScreeningByStartTime)
                                        )
                                    )
                                        .sort(sortGroupedByStartTime)
                                        .map(([day, dayScreenings]) => (
                                            <div
                                                key={day}
                                                className="flex justify-between items-start"
                                            >
                                                <p className="text-neutral-400 flex-shrink-0">
                                                    {formatDate(dayScreenings[0].start_time)}
                                                </p>
                                                <div className="flex gap-x-2 flex-wrap justify-end">
                                                    {dayScreenings
                                                        .sort(sortScreeningByStartTime)
                                                        .map((screening) =>
                                                            screening.booking_url ? (
                                                                <a
                                                                    key={screening.id}
                                                                    className="text-red-500 inline underline"
                                                                    href={screening.booking_url}
                                                                    target="_blank"
                                                                >
                                                                    {formatTime(
                                                                        screening.start_time
                                                                    )}
                                                                </a>
                                                            ) : (
                                                                <p
                                                                    key={screening.id}
                                                                    className="text-red-500 inline"
                                                                >
                                                                    {formatTime(
                                                                        screening.start_time
                                                                    )}
                                                                </p>
                                                            )
                                                        )}
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            </div>
                        );
                    })}
            </div>
        </div>
    );
}
