import { useState, useEffect } from 'react';
import {
    Calendar,
    Film,
    MapPin,
    Clock,
    ChevronLeft,
    ChevronRight,
} from 'lucide-react';

import supabase from './supabase';

// Types
interface Movie {
    id: string;
    title: string;
    duration: number;
    genre: string;
    rating: string;
}

interface Cinema {
    id: string;
    name: string;
    location: string;
}

interface Screening {
    id: string;
    movieId: string;
    cinemaId: string;
    datetime: string;
    price: number;
}

type DateRange = 'today' | 'thisWeek' | 'anytime' | 'custom';
type GroupBy = 'movie' | 'cinema';

// Mock data - Replace with actual database queries
const mockMovies: Movie[] = [
    {
        id: '1',
        title: 'The Stellar Voyage',
        duration: 142,
        genre: 'Sci-Fi',
        rating: 'PG-13',
    },
    {
        id: '2',
        title: 'Midnight in Paris Redux',
        duration: 118,
        genre: 'Drama',
        rating: 'PG',
    },
    {
        id: '3',
        title: 'Action Heroes',
        duration: 135,
        genre: 'Action',
        rating: 'R',
    },
    {
        id: '4',
        title: 'The Last Garden',
        duration: 156,
        genre: 'Drama',
        rating: 'PG-13',
    },
];

const mockCinemas: Cinema[] = [
    { id: '1', name: 'Grand Cinema', location: 'Downtown' },
    { id: '2', name: 'Riverside Theater', location: 'Riverside District' },
    { id: '3', name: 'Metro Cineplex', location: 'City Center' },
];

const mockScreenings: Screening[] = [
    {
        id: '1',
        movieId: '1',
        cinemaId: '1',
        datetime: '2025-11-04T14:30:00',
        price: 12,
    },
    {
        id: '2',
        movieId: '1',
        cinemaId: '1',
        datetime: '2025-11-04T19:00:00',
        price: 15,
    },
    {
        id: '3',
        movieId: '2',
        cinemaId: '2',
        datetime: '2025-11-04T16:00:00',
        price: 11,
    },
    {
        id: '4',
        movieId: '3',
        cinemaId: '3',
        datetime: '2025-11-04T20:30:00',
        price: 14,
    },
    {
        id: '5',
        movieId: '1',
        cinemaId: '2',
        datetime: '2025-11-05T15:00:00',
        price: 12,
    },
    {
        id: '6',
        movieId: '4',
        cinemaId: '1',
        datetime: '2025-11-06T18:00:00',
        price: 13,
    },
    {
        id: '7',
        movieId: '2',
        cinemaId: '3',
        datetime: '2025-11-07T17:30:00',
        price: 12,
    },
    {
        id: '8',
        movieId: '3',
        cinemaId: '2',
        datetime: '2025-11-08T21:00:00',
        price: 15,
    },
    {
        id: '9',
        movieId: '4',
        cinemaId: '3',
        datetime: '2025-11-10T19:30:00',
        price: 13,
    },
    {
        id: '10',
        movieId: '1',
        cinemaId: '3',
        datetime: '2025-11-15T20:00:00',
        price: 14,
    },
];

function App() {
    const [dateRange, setDateRange] = useState<DateRange>('thisWeek');
    const [groupBy, setGroupBy] = useState<GroupBy>('movie');
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    const [currentDate, setCurrentDate] = useState(new Date());
    const [movies, setMovies] = useState<Movie[]>([]);
    const [cinemas, setCinemas] = useState<Cinema[]>([]);
    const [screenings, setScreenings] = useState<Screening[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Replace with actual database queries
        const fetchData = async () => {
            setLoading(true);
            await new Promise((resolve) => setTimeout(resolve, 500));
            const data = await supabase.from('films').select();
            console.log(data);
            setMovies(mockMovies);
            setCinemas(mockCinemas);
            setScreenings(mockScreenings);
            setLoading(false);
        };
        fetchData();
    }, []);

    const getMovie = (id: string) => movies.find((m) => m.id === id);
    const getCinema = (id: string) => cinemas.find((c) => c.id === id);

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

    const getFilteredScreenings = () => {
        const baseDate = new Date(currentDate);
        const todayStart = new Date(
            baseDate.getFullYear(),
            baseDate.getMonth(),
            baseDate.getDate()
        );
        const todayEnd = new Date(todayStart);
        todayEnd.setDate(todayEnd.getDate() + 1);

        const weekEnd = new Date(todayStart);
        weekEnd.setDate(weekEnd.getDate() + 7);

        return screenings.filter((s) => {
            const screeningDate = new Date(s.datetime);

            switch (dateRange) {
                case 'today':
                    return (
                        screeningDate >= todayStart && screeningDate < todayEnd
                    );
                case 'thisWeek':
                    return (
                        screeningDate >= todayStart && screeningDate <= weekEnd
                    );
                case 'anytime':
                    return true;
                case 'custom':
                    if (!customStartDate && !customEndDate) return true;
                    const start = customStartDate
                        ? new Date(customStartDate)
                        : new Date(0);
                    const end = customEndDate
                        ? new Date(customEndDate)
                        : new Date('2100-01-01');
                    end.setHours(23, 59, 59, 999);
                    return screeningDate >= start && screeningDate <= end;
                default:
                    return true;
            }
        });
    };

    const groupByMovie = (screeningsList: Screening[]) => {
        const grouped: { [key: string]: Screening[] } = {};
        screeningsList.forEach((s) => {
            if (!grouped[s.movieId]) grouped[s.movieId] = [];
            grouped[s.movieId].push(s);
        });
        return grouped;
    };

    const groupByCinema = (screeningsList: Screening[]) => {
        const grouped: { [key: string]: Screening[] } = {};
        screeningsList.forEach((s) => {
            if (!grouped[s.cinemaId]) grouped[s.cinemaId] = [];
            grouped[s.cinemaId].push(s);
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

    const filteredScreenings = getFilteredScreenings();

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

    return (
        <div className="min-h-screen bg-neutral-900 text-white">
            <header className="bg-neutral-950 border-b border-red-900/30">
                <div className="max-w-7xl mx-auto px-4 py-6">
                    <div className="flex items-center gap-3 mb-6">
                        <Film className="w-8 h-8 text-red-600" />
                        <h1 className="text-3xl font-bold">CineView</h1>
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
                {filteredScreenings.length === 0 ? (
                    <div className="bg-neutral-800 rounded-lg p-12 text-center">
                        <Calendar className="w-16 h-16 mx-auto text-neutral-700 mb-4" />
                        <p className="text-xl text-neutral-400">
                            No screenings found for the selected date range
                        </p>
                    </div>
                ) : groupBy === 'movie' ? (
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {Object.entries(groupByMovie(filteredScreenings)).map(
                            ([movieId, movieScreenings]) => {
                                const movie = getMovie(movieId);
                                return (
                                    <div
                                        key={movieId}
                                        className="bg-neutral-800 rounded-lg p-6"
                                    >
                                        <h3 className="text-xl font-bold mb-2">
                                            {movie?.title}
                                        </h3>
                                        <p className="text-neutral-400 mb-4">
                                            {movie?.genre} • {movie?.rating} •{' '}
                                            {movie?.duration} min
                                        </p>
                                        <div className="space-y-2">
                                            <h4 className="text-sm font-semibold text-neutral-300">
                                                {movieScreenings.length}{' '}
                                                Screening
                                                {movieScreenings.length !== 1
                                                    ? 's'
                                                    : ''}
                                            </h4>
                                            {movieScreenings
                                                .sort(
                                                    (a, b) =>
                                                        new Date(
                                                            a.datetime
                                                        ).getTime() -
                                                        new Date(
                                                            b.datetime
                                                        ).getTime()
                                                )
                                                .map((screening) => {
                                                    const cinema = getCinema(
                                                        screening.cinemaId
                                                    );
                                                    return (
                                                        <div
                                                            key={screening.id}
                                                            className="bg-neutral-700 rounded p-3 text-sm"
                                                        >
                                                            <div className="flex justify-between items-start">
                                                                <div>
                                                                    <p className="font-medium">
                                                                        {
                                                                            cinema?.name
                                                                        }
                                                                    </p>
                                                                    <p className="text-neutral-400">
                                                                        {formatDate(
                                                                            screening.datetime
                                                                        )}
                                                                    </p>
                                                                </div>
                                                                <div className="text-right">
                                                                    <p className="text-neutral-300">
                                                                        {formatTime(
                                                                            screening.datetime
                                                                        )}
                                                                    </p>
                                                                    <p className="text-red-500 font-semibold">
                                                                        $
                                                                        {
                                                                            screening.price
                                                                        }
                                                                    </p>
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
                ) : (
                    <div className="space-y-8">
                        {Object.entries(groupByCinema(filteredScreenings)).map(
                            ([cinemaId, cinemaScreenings]) => {
                                const cinema = getCinema(cinemaId);
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
                                                            a.datetime
                                                        ).getTime() -
                                                        new Date(
                                                            b.datetime
                                                        ).getTime()
                                                )
                                                .map((screening) => {
                                                    const movie = getMovie(
                                                        screening.movieId
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
                                                                        movie?.genre
                                                                    }{' '}
                                                                    •{' '}
                                                                    {
                                                                        movie?.rating
                                                                    }{' '}
                                                                    •{' '}
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
                                                                        screening.datetime
                                                                    )}
                                                                </div>
                                                                <div className="text-sm text-neutral-400">
                                                                    {formatDate(
                                                                        screening.datetime
                                                                    )}
                                                                </div>
                                                                <div className="text-red-500 font-semibold mt-1">
                                                                    $
                                                                    {
                                                                        screening.price
                                                                    }
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
