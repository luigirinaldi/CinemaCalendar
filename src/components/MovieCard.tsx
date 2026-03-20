import type { CinemaTable, FilmWithPoster, ShowingsTable } from '../api';
import {
    groupByCinema,
    groupByDay,
    sortGroupedByStartTime,
    sortScreeningByStartTime,
} from '../utils/grouping';
import FilmPosterCard, { DayRow } from './FilmPosterCard';

function CinemaGroup({
    cinemaId,
    screenings,
    getCinema,
}: {
    cinemaId: string;
    screenings: ShowingsTable[];
    getCinema: (id: number) => CinemaTable | undefined;
}) {
    const cinema = getCinema(Number(cinemaId));
    const byDay = Object.entries(
        groupByDay(screenings.sort(sortScreeningByStartTime))
    ).sort(sortGroupedByStartTime);

    return (
        <div className="bg-neutral-700 rounded p-2 text-sm">
            <p className="font-medium">{cinema?.name}</p>
            <div className="flex flex-col justify-between">
                {byDay.map(([day, dayScreenings]) => (
                    <DayRow key={day} screenings={dayScreenings} />
                ))}
            </div>
        </div>
    );
}

interface MovieCardProps {
    movieKey: string;
    screenings: ShowingsTable[];
    getMovie: (id: number) => FilmWithPoster | undefined;
    getCinema: (id: number) => CinemaTable | undefined;
}

export default function MovieCard({ movieKey, screenings, getMovie, getCinema }: MovieCardProps) {
    const movie = getMovie(screenings[0]?.film_id ?? -1);
    const byCinema = Object.entries(groupByCinema(screenings)).sort(sortGroupedByStartTime);

    return (
        <FilmPosterCard key={movieKey} movie={movie}>
            <div className="space-y-1">
                <h4 className="text-sm font-medium text-neutral-300">
                    {screenings.length} Screening{screenings.length !== 1 ? 's' : ''}
                </h4>
                {byCinema.map(([cinemaId, cinemaScreenings]) => (
                    <CinemaGroup
                        key={cinemaId}
                        cinemaId={cinemaId}
                        screenings={cinemaScreenings}
                        getCinema={getCinema}
                    />
                ))}
            </div>
        </FilmPosterCard>
    );
}
