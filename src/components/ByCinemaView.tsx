import { Clock, MapPin } from 'lucide-react';
import type { CinemaTable, FilmTable, ShowingsTable } from '../api';
import { formatDate, formatTime } from '../utils/formatters';
import { groupByCinema, sortScreeningByStartTime } from '../utils/grouping';

interface ByCinemaViewProps {
    screenings: ShowingsTable[];
    getMovie: (id: number) => FilmTable | undefined;
    getCinema: (id: number) => CinemaTable | undefined;
}

export default function ByCinemaView({ screenings, getMovie, getCinema }: ByCinemaViewProps) {
    return (
        <div className="space-y-8">
            {Object.entries(groupByCinema(screenings)).map(([cinemaId, cinemaScreenings]) => {
                const cinema = getCinema(Number(cinemaId));
                return (
                    <div key={cinemaId} className="bg-neutral-800 rounded-lg p-6">
                        <h2 className="text-2xl font-bold mb-2">{cinema?.name}</h2>
                        <p className="text-neutral-400 mb-4 flex items-center gap-2">
                            <MapPin className="w-4 h-4" />
                            {cinema?.location}
                        </p>
                        <div className="space-y-4">
                            {cinemaScreenings
                                .sort(sortScreeningByStartTime)
                                .map((screening) => {
                                    const movie = getMovie(screening.film_id);
                                    return (
                                        <div
                                            key={screening.id}
                                            className="bg-neutral-700 rounded p-4 flex justify-between items-center"
                                        >
                                            <div>
                                                <h3 className="text-lg font-semibold">
                                                    {movie?.title}
                                                </h3>
                                                <p className="text-neutral-400 text-sm">
                                                    {movie?.duration} min
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-neutral-300 flex items-center gap-2">
                                                    <Clock className="w-4 h-4" />
                                                    {formatTime(screening.start_time)}
                                                </div>
                                                <div className="text-sm text-neutral-400">
                                                    {formatDate(screening.start_time)}
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
