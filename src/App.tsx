import { useEffect, useState } from 'react';
import { Film } from 'lucide-react';
import { CalendarFilters } from './components/CalendarFilters';
import { ScreeningResults } from './components/ScreeningResults';
import { useCinemaData } from './hooks/useCinemaData';
import { todayIn } from './lib/dates';
import type { Filters, GroupBy, ShowMode, TableSort } from './types';
import { CatalogViews } from './components/CatalogViews';
import LetterboxdFilter from './components/LetterboxdFilter';
import YearFilter from './components/YearFilter';
import { useScreeningFilters } from './hooks/useScreeningFilters';
import { calendarSearch } from './lib/calendarUrl';
import { initialCalendarState, PREFERENCES_KEY } from './lib/preferences';
import LocationPicker from './components/LocationPicker';

export default function App() {
    const [initial] = useState(() => {
        let storage: Storage | null = null;
        try {
            storage = window.localStorage;
        } catch {
            /* Storage may be disabled. */
        }
        return initialCalendarState(
            window.location.search,
            todayIn('Europe/Rome'),
            storage
        );
    });
    const [filters, setFilters] = useState<Filters>(initial.filters);
    const [groupBy, setGroupBy] = useState<GroupBy>(initial.groupBy);
    const [showMode, setShowMode] = useState<ShowMode>(initial.showMode);
    const [tableSort, setTableSort] = useState<TableSort | null>(
        initial.tableSort
    );
    const {
        cinemas,
        city,
        setCity,
        area,
        setArea,
        zone,
        screenings,
        loading,
        error,
        retry,
    } = useCinemaData(filters, initial.city, initial.area);
    const { visibleScreenings, movieYears, setLetterboxd, setYears } =
        useScreeningFilters(screenings);
    useEffect(() => {
        const url = new URL(window.location.href);
        url.search = calendarSearch(filters, city, area, todayIn(zone));
        window.history.replaceState(null, '', url);
    }, [filters, city, area, zone]);
    useEffect(() => {
        try {
            window.localStorage.setItem(
                PREFERENCES_KEY,
                JSON.stringify({ city, area, groupBy, showMode, tableSort })
            );
        } catch {
            /* Browsing and sharing still work when storage is unavailable. */
        }
    }, [city, area, groupBy, showMode, tableSort]);
    return (
        <div className="min-h-screen bg-neutral-900 text-white">
            <header className="bg-neutral-950 border-b border-red-900/30">
                <div className="max-w-7xl mx-auto px-4 py-6">
                    <div className="flex flex-wrap gap-4 items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <Film className="w-8 h-8 text-red-600" />
                            <h1 className="text-3xl font-bold">CineView</h1>
                        </div>
                        <LocationPicker
                            cinemas={cinemas}
                            city={city}
                            area={area}
                            onChange={(nextCity, nextArea) => {
                                setCity(nextCity);
                                setArea(nextArea);
                            }}
                        />
                    </div>
                    <CalendarFilters
                        filters={filters}
                        onChange={setFilters}
                        groupBy={groupBy}
                        onGroupChange={setGroupBy}
                        zone={zone}
                    >
                        <LetterboxdFilter onChange={setLetterboxd} />
                        <YearFilter
                            movieYears={movieYears}
                            onChange={setYears}
                        />
                    </CalendarFilters>
                </div>
            </header>
            <main className="max-w-7xl mx-auto px-4 py-8" aria-busy={loading}>
                {error ? (
                    <div role="alert" className="bg-neutral-800 rounded-lg p-6">
                        <p>{error}</p>
                        <button className="mt-3 underline" onClick={retry}>
                            Try again
                        </button>
                    </div>
                ) : loading ? (
                    <p role="status">Loading screenings...</p>
                ) : groupBy === 'map' || groupBy === 'table' ? (
                    <CatalogViews
                        screenings={visibleScreenings}
                        cinemas={cinemas}
                        city={city}
                        area={area}
                        onAreaChange={setArea}
                        zone={zone}
                        view={groupBy}
                        filters={filters}
                        showMode={showMode}
                        onShowModeChange={setShowMode}
                        tableSort={tableSort}
                        onTableSortChange={setTableSort}
                    />
                ) : (
                    <ScreeningResults
                        screenings={visibleScreenings}
                        groupBy={groupBy}
                        zone={zone}
                    />
                )}
            </main>
        </div>
    );
}
