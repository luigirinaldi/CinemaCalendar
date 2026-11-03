import type { SearchArea } from '../lib/location';
import { cinemasInArea } from '../lib/location';
import { lazy, Suspense, useMemo } from 'react';
import { filmWithPoster, type Cinema, type Screening } from '../api';
import type { Filters, ShowMode, TableSort } from '../types';
import TableView from './TableView';
const MapView = lazy(() => import('./MapView'));

interface Props {
    screenings: Screening[];
    cinemas: Cinema[];
    city: string;
    area: SearchArea | null;
    onAreaChange: (area: SearchArea) => void;
    zone: string;
    view: 'table' | 'map';
    filters: Filters;
    showMode: ShowMode;
    onShowModeChange: (value: ShowMode) => void;
    tableSort: TableSort | null;
    onTableSortChange: (value: TableSort | null) => void;
}

export function CatalogViews({
    screenings,
    cinemas,
    city,
    area,
    onAreaChange,
    zone,
    view,
    filters,
    showMode,
    onShowModeChange,
    tableSort,
    onTableSortChange,
}: Props) {
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
    const cinemaMap = useMemo(
        () => new Map(cinemas.map((cinema) => [cinema.id, cinema])),
        [cinemas]
    );
    if (view === 'map') {
        const filmsByCinema = new Map<number, Set<number>>();
        for (const row of screenings) {
            const films = filmsByCinema.get(row.cinema_id) ?? new Set<number>();
            films.add(row.film_id);
            filmsByCinema.set(row.cinema_id, films);
        }
        return (
            <Suspense
                fallback={
                    <p
                        role="status"
                        className="flex h-96 items-center justify-center text-neutral-400"
                    >
                        Loading cinema map...
                    </p>
                }
            >
                <MapView
                    cinemas={area ? cinemasInArea(cinemas, area) : cinemas}
                    selectedCity={area ? '' : city}
                    area={area}
                    onAreaChange={onAreaChange}
                    activeCinemaIds={new Set(filmsByCinema.keys())}
                    cinemaMovieCounts={
                        new Map(
                            [...filmsByCinema].map(([id, films]) => [
                                id,
                                films.size,
                            ])
                        )
                    }
                />
            </Suspense>
        );
    }
    return (
        <TableView
            screenings={screenings}
            getMovie={(id) => movies.get(id)}
            getCinema={(id) => cinemaMap.get(id)}
            zone={zone}
            singleDay={filters.dateRange === 'today'}
            showTimes={filters.dateRange === 'today' || showMode === 'full'}
            showMode={showMode}
            onShowModeChange={onShowModeChange}
            tableSort={tableSort}
            onTableSortChange={onTableSortChange}
        />
    );
}
