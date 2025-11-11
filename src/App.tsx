import { useState, useEffect } from 'react';
import {
    Calendar,
    Film,
    MapPin,
    Clock,
    ChevronLeft,
    ChevronRight,
} from 'lucide-react';

import {
    fetchCinemas,
    fetchMovies,
    fetchScreenings,
    type CinemaTable,
    type FilmTable,
    type ShowingsTable,
} from './api';

type DateRange = 'today' | 'thisWeek' | 'anytime' | 'custom';
type GroupBy = 'movie' | 'cinema';

function App() {
    const [dateRange, setDateRange] = useState<DateRange>('thisWeek');
    const [groupBy, setGroupBy] = useState<GroupBy>('movie');
    const [customStartDate, setCustomStartDate] = useState(
        new Date().toISOString()
    );
    const [customEndDate, setCustomEndDate] = useState(
        new Date().toISOString()
    );
    const [currentDate, setCurrentDate] = useState(new Date());
    const [movies, setMovies] = useState<FilmTable[]>([]);
    const [cinemas, setCinemas] = useState<CinemaTable[]>([]);
    const [screenings, setScreenings] = useState<ShowingsTable[]>([]);
    const [loading, setLoading] = useState(true);
    const [city, setCity] = useState<string>('');

    useEffect(() => {
        // Fetch movie and cinema information once at the website load
        // Can assume that they won't change while the user is browsing
        const fetchData = async () => {
            setLoading(true);

            const movie_data = await fetchMovies();
            setMovies(movie_data);
            const cinemas_data = await fetchCinemas();
            setCinemas(cinemas_data);

            setCity(getCities(cinemas_data).filter((c) => c !== null)[0]);
            setLoading(false);
        };
        fetchData();
    }, []);

    useEffect(() => {
        // Compute the range of dates for the query to db
        const fetchData = async () => {
            const get_date_range = (): [Date, Date] | null => {
                switch (dateRange) {
                    // for the day, return going from today to the next day until 4 am (account for movies starting really late)
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
                        return [
                            new Date(customStartDate),
                            new Date(customEndDate),
                        ];
                    case 'anytime':
                        return null;
                }
            };

            const screenings = await fetchScreenings(
                get_date_range(),
                getCityCinemaIds(cinemas, city)
            );
            setScreenings(screenings);
        };
        fetchData();
    }, [dateRange, currentDate, customStartDate, customEndDate, city, cinemas]);

    const getMovie = (id: number) => movies.find((m) => m.id === id);
    const getCinema = (id: number) => cinemas.find((c) => c.id === id);

    const getCities = (cinemas: CinemaTable[]) => [
        ...new Set(cinemas.map((c) => c.location)),
    ];
    const getCityCinemaIds = (cinemas: CinemaTable[], city: string) =>
        cinemas.filter((c) => c.location === city).map((c) => c.id);

    const formatTime = (datetime: string) => {
        const date = new Date(datetime);
        return date.toLocaleTimeString('en-UK', {
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const formatDate = (datetime: string) => {
        const date = new Date(datetime);
        return date.toLocaleDateString('en-UK', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
        });
    };

    const formatDateRange = (start: Date, end: Date) => {
        const startStr = start.toLocaleDateString('en-UK', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
        const endStr = end.toLocaleDateString('en-UK', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
        return `${startStr} - ${endStr}`;
    };

    const navigateDate = (direction: 'prev' | 'next') => {
        const newDate = new Date(currentDate);
        if (dateRange === 'today') {
            newDate.setDate(
                newDate.getDate() + (direction === 'next' ? 1 : -1)
            );
        } else if (dateRange === 'thisWeek') {
            newDate.setDate(
                newDate.getDate() + (direction === 'next' ? 7 : -7)
            );
        }
        setCurrentDate(newDate);
    };

    const resetToToday = () => {
        setCurrentDate(new Date());
    };

    const groupByMovie = (
        screeningsList: ShowingsTable[]
    ): Array<[string, ShowingsTable[]]> => {
        type Group = {
            key: string;
            movie?: FilmTable | null;
            screenings: ShowingsTable[];
        };

        const groups: Group[] = [];

        screeningsList.forEach((s) => {
            const movie = getMovie(s.film_id);

            // Find an existing group for this movie using tmdb_id when present,
            // otherwise compare title/duration/director when those fields exist.
            let existing: Group | undefined = undefined;

            if (movie) {
                if (movie.tmdb_id != null) {
                    existing = groups.find(
                        (g) => g.movie?.tmdb_id != null && g.movie!.tmdb_id === movie.tmdb_id
                    );
                }

                if (!existing) {
                    existing = groups.find((g) => {
                        const gm = g.movie;
                        if (!gm) return false;
                        if (movie.title && gm.title !== movie.title) return false;
                        if (movie.duration != null && gm.duration !== movie.duration)
                            return false;
                        if (movie.director && gm.director !== movie.director) return false;
                        return true;
                    });
                }
            }

            if (existing) {
                existing.screenings.push(s);
            } else {
                let key: string;
                if (movie && movie.tmdb_id != null) {
                    key = `tmdb:${movie.tmdb_id}`;
                } else if (movie) {
                    const parts: string[] = [];
                    if (movie.title) parts.push(movie.title.trim());
                    if (movie.duration != null) parts.push(String(movie.duration));
                    if (movie.director) parts.push(movie.director.trim());
                    key = `title:${parts.join('|')}`;
                } else {
                    key = `film:${s.film_id}`;
                }

                groups.push({ key, movie: movie ?? null, screenings: [s] });
            }
        });

        return groups.map((g) => [g.key, g.screenings]);
    };

    const groupByCinema = (screeningsList: ShowingsTable[]) => {
        const grouped: { [key: number]: ShowingsTable[] } = {};
        screeningsList.forEach((s) => {
            if (!grouped[s.cinema_id]) grouped[s.cinema_id] = [];
            grouped[s.cinema_id].push(s);
        });
        return grouped;
    };

    const groupByDay = (screeningsList: ShowingsTable[]) => {
        const grouped: { [key: number]: ShowingsTable[] } = {};
        screeningsList.forEach((s) => {
            const showingDay = new Date(s.start_time).getDay();
            if (!grouped[showingDay]) grouped[showingDay] = [];
            grouped[showingDay].push(s);
        });
        return grouped;
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                <div className="text-white text-xl">Loading screenings...</div>
            </div>
        );
    }

    const getDateRangeDisplay = () => {
        const baseDate = new Date(currentDate);
        const todayStart = new Date(
            baseDate.getFullYear(),
            baseDate.getMonth(),
            baseDate.getDate()
        );

        if (dateRange === 'today') {
            return todayStart.toLocaleDateString('en-UK', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
            });
        } else if (dateRange === 'thisWeek') {
            const weekEnd = new Date(todayStart);
            weekEnd.setDate(weekEnd.getDate() + 6);
            return formatDateRange(todayStart, weekEnd);
        }
        return null;
    };

    const isToday = () => {
        const now = new Date();
        const current = new Date(currentDate);
        return (
            now.getFullYear() === current.getFullYear() &&
            now.getMonth() === current.getMonth() &&
            now.getDate() === current.getDate()
        );
    };

    const sortScreeningByStartTime = (a: ShowingsTable, b: ShowingsTable) => {
        return (
            new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
        );
    };

    const sortGroupedByStartTime = (
        [_k_a, a]: [unknown, ShowingsTable[]],
        [_k_b, b]: [unknown, ShowingsTable[]]
    ) =>
        Math.min(...a.map((s) => new Date(s.start_time).getTime())) -
        Math.min(...b.map((s) => new Date(s.start_time).getTime()));

    const makeByMovieCard = ([movieId, movieScreenings]: [
        string,
        ShowingsTable[],
    ]) => {
        // The group key is either `tmdb:<id>` or `title:...` so lookup the movie
        // using the first screening's film_id.
        const movie = getMovie(movieScreenings[0]?.film_id ?? -1);
        return (
            <div key={movieId} className="bg-neutral-800 rounded-lg p-6">
                <h3 className="text-xl font-bold mb-2">{movie?.title}</h3>
                <p className="text-neutral-400 mb-4">{movie?.duration} min</p>
                <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-neutral-300">
                        {movieScreenings.length} Screening
                        {movieScreenings.length !== 1 ? 's' : ''}
                    </h4>

                    {Object.entries(groupByCinema(movieScreenings))
                        .sort(sortGroupedByStartTime)
                        .map(([cinemaId, cinemaMovieScreening]) => {
                            const cinema = getCinema(Number(cinemaId));
                            return (
                                <div
                                    key={cinemaId}
                                    className="bg-neutral-700 rounded p-3 text-sm"
                                >
                                    <div>
                                        <p className="font-medium">
                                            {cinema?.name}
                                        </p>
                                    </div>
                                    <div className="flex flex-col justify-between">
                                        {Object.entries(
                                            groupByDay(
                                                cinemaMovieScreening.sort(
                                                    sortScreeningByStartTime
                                                )
                                            )
                                        )
                                            .sort(sortGroupedByStartTime)
                                            .map(([_day, dayScreenings]) => {
                                                return (
                                                    <div className="flex justify-between items-start">
                                                        <div className="flex-shrink-0 align-right">
                                                            <p className="text-neutral-400">
                                                                {formatDate(
                                                                    dayScreenings[0]
                                                                        .start_time
                                                                )}
                                                            </p>
                                                        </div>
                                                        <div className="flex gap-x-2 flex-wrap justify-end">
                                                            {dayScreenings
                                                                .sort(
                                                                    sortScreeningByStartTime
                                                                )
                                                                .map(
                                                                    (
                                                                        screening,
                                                                        _index,
                                                                        _array
                                                                    ) => {
                                                                        return (
                                                                            <div>
                                                                                {screening.booking_url ? (
                                                                                    <a
                                                                                        key={
                                                                                            screening.id
                                                                                        }
                                                                                        className="text-red-500 text-neutral-300 inline underline"
                                                                                        href={
                                                                                            screening.booking_url
                                                                                        }
                                                                                        target="_blank"
                                                                                    >
                                                                                        {formatTime(
                                                                                            screening.start_time
                                                                                        )}
                                                                                    </a>
                                                                                ) : (
                                                                                    <p
                                                                                        key={
                                                                                            screening.id
                                                                                        }
                                                                                        className="text-red-500 text-neutral-300 inline"
                                                                                    >
                                                                                        {formatTime(
                                                                                            screening.start_time
                                                                                        )}
                                                                                    </p>
                                                                                )}
                                                                            </div>
                                                                        );
                                                                    }
                                                                )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                </div>
                            );
                        })}
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-neutral-900 text-white">
            <header className="bg-neutral-950 border-b border-red-900/30">
                <div className="max-w-7xl mx-auto px-4 py-6">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <Film className="w-8 h-8 text-red-600" />
                            <h1 className="text-3xl font-bold">CineView</h1>
                        </div>
                        <div>
                            <select
                                value={city}
                                onChange={(e) => setCity(e.target.value)}
                                className="bg-neutral-800 text-white px-4 py-2 rounded-lg border border-neutral-700 focus:border-red-600 outline-none w-48"
                            >
                                {getCities(cinemas)
                                    .filter(
                                        (cityName): cityName is string =>
                                            cityName !== null
                                    )
                                    .map((cityName) => (
                                        <option key={cityName} value={cityName}>
                                            {cityName}
                                        </option>
                                    ))}
                            </select>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="text-sm text-neutral-400 mb-2 block">
                                Date Range
                            </label>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => {
                                        setDateRange('today');
                                        resetToToday();
                                    }}
                                    className={`px-4 py-2 rounded-lg transition ${
                                        dateRange === 'today'
                                            ? 'bg-red-700 text-white'
                                            : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                                    }`}
                                >
                                    <Calendar className="inline w-4 h-4 mr-2" />
                                    Today
                                </button>
                                <button
                                    onClick={() => {
                                        setDateRange('thisWeek');
                                        resetToToday();
                                    }}
                                    className={`px-4 py-2 rounded-lg transition ${
                                        dateRange === 'thisWeek'
                                            ? 'bg-red-700 text-white'
                                            : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                                    }`}
                                >
                                    <Calendar className="inline w-4 h-4 mr-2" />
                                    This Week
                                </button>
                                <button
                                    onClick={() => setDateRange('anytime')}
                                    className={`px-4 py-2 rounded-lg transition ${
                                        dateRange === 'anytime'
                                            ? 'bg-red-700 text-white'
                                            : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                                    }`}
                                >
                                    <Calendar className="inline w-4 h-4 mr-2" />
                                    Anytime
                                </button>
                                <button
                                    onClick={() => setDateRange('custom')}
                                    className={`px-4 py-2 rounded-lg transition ${
                                        dateRange === 'custom'
                                            ? 'bg-red-700 text-white'
                                            : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                                    }`}
                                >
                                    <Calendar className="inline w-4 h-4 mr-2" />
                                    Custom Range
                                </button>
                            </div>
                        </div>

                        {(dateRange === 'today' ||
                            dateRange === 'thisWeek') && (
                            <div className="flex items-center gap-4 bg-neutral-800 rounded-lg p-4">
                                <button
                                    onClick={() => navigateDate('prev')}
                                    className="p-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 transition"
                                    title={
                                        dateRange === 'today'
                                            ? 'Previous day'
                                            : 'Previous week'
                                    }
                                >
                                    <ChevronLeft className="w-5 h-5" />
                                </button>
                                <div className="flex-1 text-center">
                                    <div className="text-lg font-semibold">
                                        {getDateRangeDisplay()}
                                    </div>
                                    {!isToday() && (
                                        <button
                                            onClick={resetToToday}
                                            className="text-sm text-red-500 hover:text-red-400 mt-1"
                                        >
                                            Back to today
                                        </button>
                                    )}
                                </div>
                                <button
                                    onClick={() => navigateDate('next')}
                                    className="p-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 transition"
                                    title={
                                        dateRange === 'today'
                                            ? 'Next day'
                                            : 'Next week'
                                    }
                                >
                                    <ChevronRight className="w-5 h-5" />
                                </button>
                            </div>
                        )}

                        {dateRange === 'custom' && (
                            <div className="flex flex-wrap gap-4 items-center">
                                <div>
                                    <label className="text-sm text-neutral-400 block mb-1">
                                        Start Date
                                    </label>
                                    <input
                                        type="date"
                                        value={customStartDate}
                                        onChange={(e) =>
                                            setCustomStartDate(e.target.value)
                                        }
                                        className="bg-neutral-800 text-white px-3 py-2 rounded border border-neutral-700 focus:border-red-600 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm text-neutral-400 block mb-1">
                                        End Date
                                    </label>
                                    <input
                                        type="date"
                                        value={customEndDate}
                                        onChange={(e) =>
                                            setCustomEndDate(e.target.value)
                                        }
                                        className="bg-neutral-800 text-white px-3 py-2 rounded border border-neutral-700 focus:border-red-600 outline-none"
                                    />
                                </div>
                            </div>
                        )}

                        <div>
                            <label className="text-sm text-neutral-400 mb-2 block">
                                Group By
                            </label>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setGroupBy('movie')}
                                    className={`px-4 py-2 rounded-lg transition ${
                                        groupBy === 'movie'
                                            ? 'bg-red-700 text-white'
                                            : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                                    }`}
                                >
                                    <Film className="inline w-4 h-4 mr-2" />
                                    By Movie
                                </button>
                                <button
                                    onClick={() => setGroupBy('cinema')}
                                    className={`px-4 py-2 rounded-lg transition ${
                                        groupBy === 'cinema'
                                            ? 'bg-red-700 text-white'
                                            : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                                    }`}
                                >
                                    <MapPin className="inline w-4 h-4 mr-2" />
                                    By Cinema
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

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
                        {groupByMovie(screenings)
                            .sort(sortGroupedByStartTime)
                            .map(makeByMovieCard)}
                    </div>
                ) : (
                    <div className="space-y-8">
                        {Object.entries(groupByCinema(screenings)).map(
                            ([cinemaId, cinemaScreenings]) => {
                                const cinema = getCinema(Number(cinemaId));
                                return (
                                    <div
                                        key={cinemaId}
                                        className="bg-neutral-800 rounded-lg p-6"
                                    >
                                        <h2 className="text-2xl font-bold mb-2">
                                            {cinema?.name}
                                        </h2>
                                        <p className="text-neutral-400 mb-4 flex items-center gap-2">
                                            <MapPin className="w-4 h-4" />
                                            {cinema?.location}
                                        </p>
                                        <div className="space-y-4">
                                            {cinemaScreenings
                                                .sort(
                                                    (a, b) =>
                                                        new Date(
                                                            a.start_time
                                                        ).getTime() -
                                                        new Date(
                                                            b.start_time
                                                        ).getTime()
                                                )
                                                .map((screening) => {
                                                    const movie = getMovie(
                                                        screening.film_id
                                                    );
                                                    return (
                                                        <div
                                                            key={screening.id}
                                                            className="bg-neutral-700 rounded p-4 flex justify-between items-center"
                                                        >
                                                            <div>
                                                                <h3 className="text-lg font-semibold">
                                                                    {
                                                                        movie?.title
                                                                    }
                                                                </h3>
                                                                <p className="text-neutral-400 text-sm">
                                                                    {
                                                                        movie?.duration
                                                                    }{' '}
                                                                    min
                                                                </p>
                                                            </div>
                                                            <div className="text-right">
                                                                <div className="text-neutral-300 flex items-center gap-2">
                                                                    <Clock className="w-4 h-4" />
                                                                    {formatTime(
                                                                        screening.start_time
                                                                    )}
                                                                </div>
                                                                <div className="text-sm text-neutral-400">
                                                                    {formatDate(
                                                                        screening.start_time
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                        </div>
                                    </div>
                                );
                            }
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}

export default App;
