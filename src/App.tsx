import { useState, useEffect, useRef } from 'react';
import { Calendar } from 'lucide-react';
import {
    fetchCinemas,
    fetchScreenings,
    filmWithPoster,
    type CinemaTable,
    type FilmWithPoster,
    type ShowingsTable,
} from './api';
import type { GroupBy, ShowMode } from './types';
import { groupByMovie, sortGroupedByStartTime } from './utils/grouping';
import { getUrlSearchParams, setUrlSearchParams } from './utils/url';
import { useDateRange } from './hooks/useDateRange';
import AppHeader from './components/AppHeader';
import MovieCard from './components/MovieCard';
import ByCinemaView from './components/ByCinemaView';
import TableView from './components/TableView';

function App() {
    const [groupBy, setGroupBy] = useState<GroupBy>(getUrlSearchParams().groupBy ?? 'table');
    const [showMode, setShowMode] = useState<ShowMode>(getUrlSearchParams().showMode ?? 'compact');
    const {
        dateRange,
        currentDate,
        customStartDate,
        customEndDate,
        computedRange,
        setDateRange,
        navigateDate,
        resetToToday,
        setCustomStartDate,
        setCustomEndDate,
    } = useDateRange();

    const isSingleDay = dateRange === 'today';
    const showTimes = isSingleDay || showMode === 'full';
    const [movies, setMovies] = useState<FilmWithPoster[]>([]);
    const [cinemas, setCinemas] = useState<CinemaTable[]>([]);
    const [screenings, setScreenings] = useState<ShowingsTable[]>([]);
    const [loading, setLoading] = useState(true);
    const initialLoadDone = useRef(false);
    const [city, setCity] = useState<string>('');

    // Fetch cinemas once on mount
    useEffect(() => {
        const fetchData = async () => {
            const cinemaData = await fetchCinemas();
            setCinemas(cinemaData);
            const cities = getCities(cinemaData).filter((c): c is string => c !== null);
            const urlCity = getUrlSearchParams().city;
            const matched = urlCity
                ? cities.find((c) => c.toLowerCase() === urlCity.toLowerCase())
                : null;
            setCity(matched ?? cities[0]);
        };
        fetchData();
    }, []);

    // Sync city to URL
    useEffect(() => {
        if (city) setUrlSearchParams({ city: city.toLowerCase() });
    }, [city]);

    // Sync groupBy to URL
    useEffect(() => {
        setUrlSearchParams({ groupBy });
    }, [groupBy]);

    // Sync showMode to URL
    useEffect(() => {
        setUrlSearchParams({ showMode });
    }, [showMode]);

    // Re-fetch screenings whenever filters change
    useEffect(() => {
        const fetchData = async () => {
            const data = await fetchScreenings(computedRange, getCityCinemaIds(cinemas, city));
            setMovies(data.map(filmWithPoster));
            setScreenings(data.flatMap((f) => f.new_showings));
            if (!initialLoadDone.current) {
                initialLoadDone.current = true;
                setLoading(false);
            }
        };
        fetchData();
    }, [computedRange, city, cinemas]);

    const getCities = (cinemas: CinemaTable[]) => [...new Set(cinemas.map((c) => c.location))];
    const getCityCinemaIds = (cinemas: CinemaTable[], city: string) =>
        cinemas.filter((c) => c.location === city).map((c) => c.id);

    const getMovie = (id: number) => movies.find((m) => m.id === id) as FilmWithPoster | undefined;
    const getCinema = (id: number) => cinemas.find((c) => c.id === id);

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
                currentDate={currentDate}
                customStartDate={customStartDate}
                customEndDate={customEndDate}
                onDateRangeChange={setDateRange}
                onNavigate={navigateDate}
                onResetToToday={resetToToday}
                onCustomStartDateChange={setCustomStartDate}
                onCustomEndDateChange={setCustomEndDate}
                groupBy={groupBy}
                onGroupByChange={setGroupBy}
                showMode={showMode}
                onShowModeChange={setShowMode}
            />
            <main className={`max-w-7xl mx-auto py-8 ${groupBy === 'cinema' ? 'px-2 md:px-4' : groupBy === 'table' ? 'px-0 md:px-4' : 'px-4'}`}>
                {screenings.length === 0 ? (
                    <div className="bg-neutral-800 rounded-lg p-12 text-center">
                        <Calendar className="w-16 h-16 mx-auto text-neutral-700 mb-4" />
                        <p className="text-xl text-neutral-400">
                            No screenings found for the selected date range
                        </p>
                    </div>
                ) : groupBy === 'movie' ? (
                    <div className="flex flex-wrap gap-6 justify-around">
                        {groupByMovie(screenings, getMovie)
                            .sort(sortGroupedByStartTime)
                            .map(([key, movieScreenings]) => (
                                <MovieCard
                                    key={key}
                                    movieKey={key}
                                    screenings={movieScreenings}
                                    getMovie={getMovie}
                                    getCinema={getCinema}
                                    showTimes={showTimes}
                                />
                            ))}
                    </div>
                ) : groupBy === 'cinema' ? (
                    <ByCinemaView
                        screenings={screenings}
                        getMovie={getMovie}
                        getCinema={getCinema}
                        showTimes={showTimes}
                    />
                ) : (
                    <TableView
                        screenings={screenings}
                        getMovie={getMovie}
                        getCinema={getCinema}
                        showTimes={showTimes}
                        singleDay={isSingleDay}
                    />
                )}
            </main>
        </div>
    );
}

export default App;
