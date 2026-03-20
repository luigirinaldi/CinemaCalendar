import { Calendar, ChevronLeft, ChevronRight, Film, MapPin } from 'lucide-react';
import type { DateRange, GroupBy } from '../types';
import { formatDateRange } from '../utils/formatters';

interface AppHeaderProps {
    city: string;
    cities: string[];
    onCityChange: (city: string) => void;
    dateRange: DateRange;
    onDateRangeChange: (range: DateRange) => void;
    currentDate: Date;
    onNavigate: (direction: 'prev' | 'next') => void;
    onResetToToday: () => void;
    customStartDate: string;
    customEndDate: string;
    onCustomStartDateChange: (value: string) => void;
    onCustomEndDateChange: (value: string) => void;
    groupBy: GroupBy;
    onGroupByChange: (groupBy: GroupBy) => void;
}

export default function AppHeader({
    city,
    cities,
    onCityChange,
    dateRange,
    onDateRangeChange,
    currentDate,
    onNavigate,
    onResetToToday,
    customStartDate,
    customEndDate,
    onCustomStartDateChange,
    onCustomEndDateChange,
    groupBy,
    onGroupByChange,
}: AppHeaderProps) {
    const isToday = () => {
        const now = new Date();
        return (
            now.getFullYear() === currentDate.getFullYear() &&
            now.getMonth() === currentDate.getMonth() &&
            now.getDate() === currentDate.getDate()
        );
    };

    const getDateRangeDisplay = () => {
        const base = new Date(currentDate);
        const start = new Date(base.getFullYear(), base.getMonth(), base.getDate());
        if (dateRange === 'today') {
            return start.toLocaleDateString('en-UK', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
            });
        }
        if (dateRange === 'thisWeek') {
            const end = new Date(start);
            end.setDate(end.getDate() + 6);
            return formatDateRange(start, end);
        }
        return null;
    };

    const tabClass = (active: boolean) =>
        `px-4 py-2 rounded-lg transition ${
            active
                ? 'bg-red-700 text-white'
                : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
        }`;

    return (
        <header className="bg-neutral-950 border-b border-red-900/30">
            <div className="max-w-7xl mx-auto px-4 py-6">
                {/* Title + city selector */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <Film className="w-8 h-8 text-red-600" />
                        <h1 className="text-3xl font-bold">CineView</h1>
                    </div>
                    <select
                        value={city}
                        onChange={(e) => onCityChange(e.target.value)}
                        className="bg-neutral-800 text-white px-4 py-2 rounded-lg border border-neutral-700 focus:border-red-600 outline-none w-48"
                    >
                        {cities.map((c) => (
                            <option key={c} value={c}>
                                {c}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="space-y-4">
                    {/* Date range mode buttons */}
                    <div>
                        <label className="text-sm text-neutral-400 mb-2 block">
                            Date Range
                        </label>
                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={() => {
                                    onDateRangeChange('today');
                                    onResetToToday();
                                }}
                                className={tabClass(dateRange === 'today')}
                            >
                                <Calendar className="inline w-4 h-4 mr-2" />
                                Today
                            </button>
                            <button
                                onClick={() => {
                                    onDateRangeChange('thisWeek');
                                    onResetToToday();
                                }}
                                className={tabClass(dateRange === 'thisWeek')}
                            >
                                <Calendar className="inline w-4 h-4 mr-2" />
                                This Week
                            </button>
                            <button
                                onClick={() => onDateRangeChange('anytime')}
                                className={tabClass(dateRange === 'anytime')}
                            >
                                <Calendar className="inline w-4 h-4 mr-2" />
                                Anytime
                            </button>
                            <button
                                onClick={() => onDateRangeChange('custom')}
                                className={tabClass(dateRange === 'custom')}
                            >
                                <Calendar className="inline w-4 h-4 mr-2" />
                                Custom Range
                            </button>
                        </div>
                    </div>

                    {/* Date navigator for today / this week */}
                    {(dateRange === 'today' || dateRange === 'thisWeek') && (
                        <div className="flex items-center gap-4 bg-neutral-800 rounded-lg p-4">
                            <button
                                onClick={() => onNavigate('prev')}
                                className="p-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 transition"
                                title={dateRange === 'today' ? 'Previous day' : 'Previous week'}
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                            <div className="flex-1 text-center">
                                <div className="text-lg font-semibold">
                                    {getDateRangeDisplay()}
                                </div>
                                {!isToday() && (
                                    <button
                                        onClick={onResetToToday}
                                        className="text-sm text-red-500 hover:text-red-400 mt-1"
                                    >
                                        Back to today
                                    </button>
                                )}
                            </div>
                            <button
                                onClick={() => onNavigate('next')}
                                className="p-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 transition"
                                title={dateRange === 'today' ? 'Next day' : 'Next week'}
                            >
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        </div>
                    )}

                    {/* Custom date range inputs */}
                    {dateRange === 'custom' && (
                        <div className="flex flex-wrap gap-4 items-center">
                            <div>
                                <label className="text-sm text-neutral-400 block mb-1">
                                    Start Date
                                </label>
                                <input
                                    type="date"
                                    value={customStartDate}
                                    onChange={(e) => onCustomStartDateChange(e.target.value)}
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
                                    onChange={(e) => onCustomEndDateChange(e.target.value)}
                                    className="bg-neutral-800 text-white px-3 py-2 rounded border border-neutral-700 focus:border-red-600 outline-none"
                                />
                            </div>
                        </div>
                    )}

                    {/* Group by buttons */}
                    <div>
                        <label className="text-sm text-neutral-400 mb-2 block">Group By</label>
                        <div className="flex gap-2">
                            <button
                                onClick={() => onGroupByChange('movie')}
                                className={tabClass(groupBy === 'movie')}
                            >
                                <Film className="inline w-4 h-4 mr-2" />
                                By Movie
                            </button>
                            <button
                                onClick={() => onGroupByChange('cinema')}
                                className={tabClass(groupBy === 'cinema')}
                            >
                                <MapPin className="inline w-4 h-4 mr-2" />
                                By Cinema
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
}
