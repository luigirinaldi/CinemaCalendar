import { useMemo } from 'react';
import { Calendar, MapPin } from 'lucide-react';
import type { Screening } from '../calendarApi';
import type { GroupBy } from '../types';
import { byCinema, byDay, byMovie } from '../lib/groupings';
import { formatDate, formatTime } from '../lib/dates';

function BookingTime({
    screening,
    zone,
}: {
    screening: Screening;
    zone: string;
}) {
    const time = formatTime(screening.start_time, zone);
    const url = screening.booking_url;
    return url && /^https?:\/\//i.test(url) ? (
        <a
            className="text-neutral-300 underline"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
        >
            {time}
        </a>
    ) : (
        <span className="text-neutral-300">{time}</span>
    );
}
function MovieCard({
    screenings,
    zone,
}: {
    screenings: Screening[];
    zone: string;
}) {
    const movie = screenings[0].film;
    return (
        <article className="bg-neutral-800 rounded-lg p-6">
            <h3 className="text-xl font-bold mb-2">
                {movie?.title ?? 'Unknown film'}
            </h3>
            {movie?.duration != null && (
                <p className="text-neutral-400 mb-4">{movie.duration} min</p>
            )}
            <div className="space-y-2">
                <h4 className="text-sm font-semibold text-neutral-300">
                    {screenings.length} Screening
                    {screenings.length !== 1 ? 's' : ''}
                </h4>
                {byCinema(screenings).map(([id, rows]) => (
                    <div
                        key={id}
                        className="bg-neutral-700 rounded p-3 text-sm"
                    >
                        <p className="font-medium">
                            {rows[0].cinema?.name ?? 'Unknown cinema'}
                        </p>
                        {byDay(rows, zone).map(([day, showings]) => (
                            <div
                                key={day}
                                className="flex justify-between items-start gap-2"
                            >
                                <p className="text-neutral-400 flex-shrink-0">
                                    {formatDate(showings[0].start_time, zone)}
                                </p>
                                <div className="flex gap-x-2 flex-wrap justify-end">
                                    {showings.map((screening) => (
                                        <BookingTime
                                            key={screening.id}
                                            screening={screening}
                                            zone={zone}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </article>
    );
}
function CinemaCard({
    screenings,
    zone,
}: {
    screenings: Screening[];
    zone: string;
}) {
    const cinema = screenings[0].cinema;
    return (
        <article className="bg-neutral-800 rounded-lg p-6">
            <h2 className="text-2xl font-bold mb-2">
                {cinema?.name ?? 'Unknown cinema'}
            </h2>
            <p className="text-neutral-400 mb-4 flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                {cinema?.location}
            </p>
            <div className="space-y-4">
                {screenings.map((screening) => (
                    <div
                        key={screening.id}
                        className="bg-neutral-700 rounded p-4 flex justify-between items-center gap-3"
                    >
                        <div>
                            <h3 className="text-lg font-semibold">
                                {screening.film?.title ?? 'Unknown film'}
                            </h3>
                            {screening.film?.duration != null && (
                                <p className="text-neutral-400 text-sm">
                                    {screening.film.duration} min
                                </p>
                            )}
                        </div>
                        <div className="text-right">
                            <BookingTime screening={screening} zone={zone} />
                            <div className="text-sm text-neutral-400">
                                {formatDate(screening.start_time, zone)}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </article>
    );
}
export function ScreeningResults({
    screenings,
    groupBy,
    zone,
}: {
    screenings: Screening[];
    groupBy: GroupBy;
    zone: string;
}) {
    const groups = useMemo(
        () =>
            groupBy === 'movie' ? byMovie(screenings) : byCinema(screenings),
        [screenings, groupBy]
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
    const Card = groupBy === 'movie' ? MovieCard : CinemaCard;
    return (
        <div
            className={
                groupBy === 'movie'
                    ? 'grid gap-6 md:grid-cols-2 lg:grid-cols-3'
                    : 'space-y-8'
            }
        >
            {groups.map(([key, rows]) => (
                <Card key={key} screenings={rows} zone={zone} />
            ))}
        </div>
    );
}
