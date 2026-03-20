import type { CinemaTable, FilmTable, ShowingsTable } from '../api';
import { formatDate, formatTime } from '../utils/formatters';
import {
    groupByCinema,
    groupByDay,
    sortGroupedByStartTime,
    sortScreeningByStartTime,
} from '../utils/grouping';

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

function DayRow({ screenings }: { screenings: ShowingsTable[] }) {
    return (
        <div className="flex justify-between items-start">
            <p className="text-neutral-400 flex-shrink-0">
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
        <div className="bg-neutral-700 rounded p-3 text-sm">
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
    getMovie: (id: number) => FilmTable | undefined;
    getCinema: (id: number) => CinemaTable | undefined;
}

export default function MovieCard({ movieKey, screenings, getMovie, getCinema }: MovieCardProps) {
    const movie = getMovie(screenings[0]?.film_id ?? -1);
    const byCinema = Object.entries(groupByCinema(screenings)).sort(sortGroupedByStartTime);

    return (
        <div key={movieKey} className="bg-neutral-800 rounded-lg p-6">
            <h3 className="text-xl font-bold mb-2">{movie?.title}</h3>
            <p className="text-neutral-400 mb-4">{movie?.duration} min</p>
            <div className="space-y-2">
                <h4 className="text-sm font-semibold text-neutral-300">
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
        </div>
    );
}
