import { useState, useEffect } from 'react';
import { Calendar } from 'lucide-react';
import {
    fetchCinemas,
    fetchMovies,
    fetchScreenings,
    type CinemaTable,
    type FilmTable,
    type ShowingsTable,
} from './api';
import type { DateRange, GroupBy } from './types';
import { groupByMovie, sortGroupedByStartTime } from './utils/grouping';
import AppHeader from './components/AppHeader';
import MovieCard from './components/MovieCard';
import ByCinemaView from './components/ByCinemaView';

function App() {
    const [dateRange, setDateRange] = useState<DateRange>('thisWeek');
    const [groupBy, setGroupBy] = useState<GroupBy>('movie');
    const [customStartDate, setCustomStartDate] = useState(new Date().toISOString());
    const [customEndDate, setCustomEndDate] = useState(new Date().toISOString());
    const [currentDate, setCurrentDate] = useState(new Date());
    const [movies, setMovies] = useState<FilmTable[]>([]);
    const [cinemas, setCinemas] = useState<CinemaTable[]>([]);
    const [screenings, setScreenings] = useState<ShowingsTable[]>([]);
    const [loading, setLoading] = useState(true);
    const [city, setCity] = useState<string>('');

    // Fetch movies and cinemas once on mount
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            const movieData = await fetchMovies();
            setMovies(movieData);
            const cinemaData = await fetchCinemas();
            setCinemas(cinemaData);
            setCity(getCities(cinemaData).filter((c) => c !== null)[0]);
            setLoading(false);
        };
        fetchData();
    }, []);

    // Re-fetch screenings whenever filters change
    useEffect(() => {
        const getDateRange = (): [Date, Date] | null => {
            switch (dateRange) {
                case 'today':
                    return [
                        currentDate,
                        new Date(
                            currentDate.getFullYear(),
                            currentDate.getMonth(),
                            currentDate.getDate() + 1,
                            4,
                            0
                        ),
                    ];
                case 'thisWeek':
                    return [
                        currentDate,
                        new Date(
                            currentDate.getFullYear(),
                            currentDate.getMonth(),
                            currentDate.getDate() + 7,
                            4,
                            0
                        ),
                    ];
                case 'custom':
                    return [new Date(customStartDate), new Date(customEndDate)];
                case 'anytime':
                    return null;
            }
        };

        const fetchData = async () => {
            const data = await fetchScreenings(getDateRange(), getCityCinemaIds(cinemas, city));
            setScreenings(data);
        };
        fetchData();
    }, [dateRange, currentDate, customStartDate, customEndDate, city, cinemas]);

    const getCities = (cinemas: CinemaTable[]) => [...new Set(cinemas.map((c) => c.location))];
    const getCityCinemaIds = (cinemas: CinemaTable[], city: string) =>
        cinemas.filter((c) => c.location === city).map((c) => c.id);

    const getMovie = (id: number) => movies.find((m) => m.id === id);
    const getCinema = (id: number) => cinemas.find((c) => c.id === id);

    const navigateDate = (direction: 'prev' | 'next') => {
        const newDate = new Date(currentDate);
        const delta = direction === 'next' ? 1 : -1;
        if (dateRange === 'today') newDate.setDate(newDate.getDate() + delta);
        else if (dateRange === 'thisWeek') newDate.setDate(newDate.getDate() + delta * 7);
        setCurrentDate(newDate);
    };

    const resetToToday = () => setCurrentDate(new Date());

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                <div className="text-white text-xl">Loading screenings...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-neutral-900 text-white">
            <AppHeader
                city={city}
                cities={getCities(cinemas).filter((c): c is string => c !== null)}
                onCityChange={setCity}
                dateRange={dateRange}
                onDateRangeChange={setDateRange}
                currentDate={currentDate}
                onNavigate={navigateDate}
                onResetToToday={resetToToday}
                customStartDate={customStartDate}
                customEndDate={customEndDate}
                onCustomStartDateChange={setCustomStartDate}
                onCustomEndDateChange={setCustomEndDate}
                groupBy={groupBy}
                onGroupByChange={setGroupBy}
            />
            <main className="max-w-7xl mx-auto px-4 py-8">
                {screenings.length === 0 ? (
                    <div className="bg-neutral-800 rounded-lg p-12 text-center">
                        <Calendar className="w-16 h-16 mx-auto text-neutral-700 mb-4" />
                        <p className="text-xl text-neutral-400">
                            No screenings found for the selected date range
                        </p>
                    </div>
                ) : groupBy === 'movie' ? (
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {groupByMovie(screenings, getMovie)
                            .sort(sortGroupedByStartTime)
                            .map(([key, movieScreenings]) => (
                                <MovieCard
                                    key={key}
                                    movieKey={key}
                                    screenings={movieScreenings}
                                    getMovie={getMovie}
                                    getCinema={getCinema}
                                />
                            ))}
                    </div>
                ) : (
                    <ByCinemaView
                        screenings={screenings}
                        getMovie={getMovie}
                        getCinema={getCinema}
                    />
                )}
            </main>
        </div>
    );
}

export default App;
