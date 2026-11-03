import { useMemo } from 'react';
import { Calendar } from 'lucide-react';
import { filmWithPoster, type Screening } from '../api';
import type { GroupBy } from '../types';
import { byMovie } from '../lib/groupings';
import MovieCard from './MovieCard';
import ByCinemaView from './ByCinemaView';

export function ScreeningResults({
    screenings,
    groupBy,
    zone,
}: {
    screenings: Screening[];
    groupBy: GroupBy;
    zone: string;
}) {
    const movies = useMemo(
        () =>
            new Map(
                screenings.flatMap((row) =>
                    row.film
                        ? [[row.film_id, filmWithPoster(row.film)] as const]
                        : []
                )
            ),
        [screenings]
    );
    const cinemas = useMemo(
        () => new Map(screenings.map((row) => [row.cinema_id, row.cinema])),
        [screenings]
    );
    if (!screenings.length)
        return (
            <div className="bg-neutral-800 rounded-lg p-12 text-center">
                <Calendar className="w-16 h-16 mx-auto text-neutral-700 mb-4" />
                <p className="text-xl text-neutral-400">
                    No screenings found for the selected date range
                </p>
            </div>
        );
    const getMovie = (id: number) => movies.get(id);
    const getCinema = (id: number) => cinemas.get(id);
    return groupBy === 'cinema' ? (
        <ByCinemaView
            screenings={screenings}
            getMovie={getMovie}
            getCinema={getCinema}
            zone={zone}
        />
    ) : (
        <div className="flex flex-wrap gap-6 justify-start">
            {byMovie(screenings).map(([key, rows]) => (
                <MovieCard
                    key={key}
                    movieKey={key}
                    screenings={rows}
                    getMovie={getMovie}
                    getCinema={getCinema}
                    zone={zone}
                />
            ))}
        </div>
    );
}
