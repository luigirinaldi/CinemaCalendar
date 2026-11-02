import { useState } from 'react';
import { Film } from 'lucide-react';
import { CalendarFilters } from './components/CalendarFilters';
import { ScreeningResults } from './components/ScreeningResults';
import { useCinemaData } from './hooks/useCinemaData';
import { cityZone, todayIn } from './lib/dates';
import type { Filters, GroupBy } from './types';

export default function App() {
    const [filters, setFilters] = useState<Filters>(() => {
        const today = todayIn('Europe/Rome');
        return {
            dateRange: 'thisWeek',
            currentDate: today,
            customStartDate: today,
            customEndDate: today,
        };
    });
    const [groupBy, setGroupBy] = useState<GroupBy>('movie');
    const { cinemas, city, setCity, screenings, loading, error, retry } =
        useCinemaData(filters);
    const cities = [
        ...new Set(
            cinemas.flatMap((cinema) =>
                cinema.location ? [cinema.location] : []
            )
        ),
    ];
    const zone = cityZone(city);
    return (
        <div className="min-h-screen bg-neutral-900 text-white">
            <header className="bg-neutral-950 border-b border-red-900/30">
                <div className="max-w-7xl mx-auto px-4 py-6">
                    <div className="flex flex-wrap gap-4 items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <Film className="w-8 h-8 text-red-600" />
                            <h1 className="text-3xl font-bold">CineView</h1>
                        </div>
                        <select
                            aria-label="City"
                            value={city}
                            onChange={(event) => setCity(event.target.value)}
                            className="bg-neutral-800 text-white px-4 py-2 rounded-lg border border-neutral-700 w-48"
                        >
                            {cities.map((name) => (
                                <option key={name} value={name}>
                                    {name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <CalendarFilters
                        filters={filters}
                        onChange={setFilters}
                        groupBy={groupBy}
                        onGroupChange={setGroupBy}
                        zone={zone}
                    />
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
                ) : (
                    <ScreeningResults
                        screenings={screenings}
                        groupBy={groupBy}
                        zone={zone}
                    />
                )}
            </main>
        </div>
    );
}
