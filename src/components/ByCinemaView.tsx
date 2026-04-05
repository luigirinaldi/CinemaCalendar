import { useState } from 'react';
import { ChevronDown, ChevronRight, MapPin } from 'lucide-react';
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
}

export default function ByCinemaView({ screenings, getMovie, getCinema }: ByCinemaViewProps) {
    const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

    function toggleCinema(id: number) {
        setCollapsed((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    return (
        <div className="space-y-4">
            {Object.entries(groupByCinema(screenings)).map(([cinemaId, cinemaScreenings]) => {
                const id = Number(cinemaId);
                const cinema = getCinema(id);
                const movieGroups = groupByMovie(cinemaScreenings, getMovie).sort(sortGroupedByStartTime);
                const isCollapsed = collapsed.has(id);

                return (
                    <div key={cinemaId} className="bg-neutral-800 rounded-lg overflow-hidden">
                        <button
                            onClick={() => toggleCinema(id)}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-neutral-700 transition text-left"
                        >
                            {isCollapsed
                                ? <ChevronRight className="w-5 h-5 text-neutral-400 shrink-0" />
                                : <ChevronDown className="w-5 h-5 text-neutral-400 shrink-0" />
                            }
                            <MapPin className="w-4 h-4 text-neutral-400 shrink-0" />
                            <h2 className="text-xl font-bold flex-1">{cinema?.name}</h2>
                            <span className="text-sm text-neutral-400 bg-neutral-700 px-2 py-0.5 rounded-full">
                                {movieGroups.length} film{movieGroups.length !== 1 ? 's' : ''}
                            </span>
                        </button>
                        {!isCollapsed && (
                            <div className="flex flex-wrap gap-4 justify-around px-4 pb-4">
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
                                                        showTimes={true}
                                                    />
                                                ))}
                                            </div>
                                        </FilmPosterCard>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
