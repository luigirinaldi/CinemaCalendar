import { useMemo } from 'react';
import { filmWithPoster, type Cinema, type Screening } from '../api';
import type { Filters, ShowMode, TableSort } from '../types';
import TableView from './TableView';
import MapView from './MapView';

interface Props {
    screenings: Screening[];
    cinemas: Cinema[];
    city: string;
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
            <MapView
                cinemas={cinemas}
                selectedCity={city}
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
