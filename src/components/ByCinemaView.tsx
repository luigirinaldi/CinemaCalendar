import { MapPin } from 'lucide-react';
import type { CinemaTable, FilmWithPoster, ShowingsTable } from '../api';
import {
    groupByCinema,
    groupByDay,
    groupByMovie,
    sortGroupedByStartTime,
    sortScreeningByStartTime,
} from '../utils/grouping';
import FilmPosterCard, { DayRow } from './FilmPosterCard';

interface ByCinemaViewProps {
    screenings: ShowingsTable[];
    getMovie: (id: number) => FilmWithPoster | undefined;
    getCinema: (id: number) => CinemaTable | undefined;
    showTimes: boolean;
}

export default function ByCinemaView({ screenings, getMovie, getCinema, showTimes }: ByCinemaViewProps) {
    return (
        <div className="space-y-8">
            {Object.entries(groupByCinema(screenings)).map(([cinemaId, cinemaScreenings]) => {
                const cinema = getCinema(Number(cinemaId));
                const movieGroups = groupByMovie(cinemaScreenings, getMovie).sort(
                    sortGroupedByStartTime
                );
                return (
                    <div key={cinemaId} className="bg-neutral-800 rounded-lg p-4">
                        <h2 className="text-2xl font-bold mb-2">{cinema?.name}</h2>
                        <div className="flex flex-wrap gap-4 justify-around">
                            {movieGroups.map(([key, movieScreenings]) => {
                                const movie = getMovie(movieScreenings[0]?.film_id ?? -1);
                                const byDay = Object.entries(
                                    groupByDay(movieScreenings.sort(sortScreeningByStartTime))
                                ).sort(sortGroupedByStartTime);
                                return (
                                    <FilmPosterCard key={key} movie={movie} className="bg-neutral-700">
                                        <div className="space-y-1">
                                            {byDay.map(([_day, dayScreenings]) => (
                                                <DayRow
                                                    key={dayScreenings[0]?.id}
                                                    screenings={dayScreenings}
                                                    showTimes={showTimes}
                                                />
                                            ))}
                                        </div>
                                    </FilmPosterCard>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
