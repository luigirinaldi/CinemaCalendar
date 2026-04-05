import { Calendar, ChevronLeft, ChevronRight, Film, List, MapPin } from 'lucide-react';
import { useState } from 'react';
import type { DateRange, GroupBy } from '../types';
import { parseLocalDate } from '../utils/url';

const tabClass = (active: boolean) =>
    `px-4 py-2 rounded-lg transition ${
        active ? 'bg-red-700 text-white' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
    }`;

function DateRangeTabs({
    dateRange,
    onDateRangeChange,
    onResetToToday,
}: {
    dateRange: DateRange;
    onDateRangeChange: (r: DateRange) => void;
    onResetToToday: () => void;
}) {
    return (
        <div>
            <label className="text-sm text-neutral-400 mb-2 block">Date Range</label>
            <div className="flex flex-wrap gap-2">
                <button
                    onClick={() => { onDateRangeChange('today'); onResetToToday(); }}
                    className={tabClass(dateRange === 'today')}
                >
                    <Calendar className="inline w-4 h-4 mr-2" />Today
                </button>
                <button
                    onClick={() => onDateRangeChange('range')}
                    className={tabClass(dateRange === 'range')}
                >
                    <Calendar className="inline w-4 h-4 mr-2" />Range
                </button>
                <button
                    onClick={() => onDateRangeChange('anytime')}
                    className={tabClass(dateRange === 'anytime')}
                >
                    <Calendar className="inline w-4 h-4 mr-2" />Anytime
                </button>
            </div>
        </div>
    );
}

function DateNavigator({
    currentDate,
    onNavigate,
    onSetCurrentDate,
    onResetToToday,
}: {
    currentDate: Date;
    onNavigate: (dir: 'prev' | 'next') => void;
    onSetCurrentDate: (v: string) => void;
    onResetToToday: () => void;
}) {
    const isToday = () => {
        const now = new Date();
        return (
            now.getFullYear() === currentDate.getFullYear() &&
            now.getMonth() === currentDate.getMonth() &&
            now.getDate() === currentDate.getDate()
        );
    };

    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;

    return (
        <div className="flex items-center gap-2 bg-neutral-800 rounded-lg p-2">
            <button
                onClick={() => onNavigate('prev')}
                className="p-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 transition"
                title="Previous day"
            >
                <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex-1 text-center">
                <DateCell value={dateStr} onChange={onSetCurrentDate} label="date" large />
                {!isToday() && (
                    <button
                        onClick={onResetToToday}
                        className="text-sm text-red-500 hover:text-red-400 mt-1 block mx-auto"
                    >
                        Back to today
                    </button>
                )}
            </div>
            <button
                onClick={() => onNavigate('next')}
                className="p-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 transition"
                title="Next day"
            >
                <ChevronRight className="w-5 h-5" />
            </button>
        </div>
    );
}

function DateCell({
    value,
    onChange,
    label,
    large = false,
}: {
    value: string;
    onChange: (v: string) => void;
    label: string;
    large?: boolean;
}) {
    const [editing, setEditing] = useState(false);
    const fmt = (dateStr: string) =>
        large
            ? parseLocalDate(dateStr).toLocaleDateString('en-UK', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
              })
            : parseLocalDate(dateStr).toLocaleDateString('en-UK', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
              });

    if (editing) {
        return (
            <input
                type="date"
                value={value}
                autoFocus
                onChange={(e) => { onChange(e.target.value); setEditing(false); }}
                onBlur={() => setEditing(false)}
                className="bg-neutral-700 text-white text-sm font-semibold rounded px-2 py-0.5 outline-none border border-neutral-500 w-36"
            />
        );
    }

    return (
        <button
            onClick={() => setEditing(true)}
            title={`Set ${label} date`}
            className={`font-semibold hover:text-red-400 transition ${large ? 'text-lg md:text-xl' : 'text-sm md:text-base'}`}
        >
            {fmt(value)}
        </button>
    );
}

function RangeDateNavigator({
    rangeStartDate,
    rangeEndDate,
    onNavigateStart,
    onNavigateEnd,
    onSetStart,
    onSetEnd,
}: {
    rangeStartDate: string;
    rangeEndDate: string;
    onNavigateStart: (dir: 'prev' | 'next') => void;
    onNavigateEnd: (dir: 'prev' | 'next') => void;
    onSetStart: (v: string) => void;
    onSetEnd: (v: string) => void;
}) {
    return (
        <div className="flex items-center gap-2 bg-neutral-800 rounded-lg p-2">
            <div className="flex rounded-lg overflow-hidden">
                <button
                    onClick={() => onNavigateStart('prev')}
                    className="p-2 bg-neutral-700 hover:bg-neutral-600 transition"
                    title="Move start date back"
                >
                    <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                    onClick={() => onNavigateStart('next')}
                    className="p-2 bg-neutral-700 hover:bg-neutral-600 transition border-l border-neutral-600"
                    title="Move start date forward"
                >
                    <ChevronRight className="w-5 h-5" />
                </button>
            </div>
            <div className="flex-1 text-center">
                <DateCell value={rangeStartDate} onChange={onSetStart} label="start" />
                <span className="text-neutral-500 mx-2">—</span>
                <DateCell value={rangeEndDate} onChange={onSetEnd} label="end" />
            </div>
            <div className="flex rounded-lg overflow-hidden">
                <button
                    onClick={() => onNavigateEnd('prev')}
                    className="p-2 bg-neutral-700 hover:bg-neutral-600 transition"
                    title="Move end date back"
                >
                    <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                    onClick={() => onNavigateEnd('next')}
                    className="p-2 bg-neutral-700 hover:bg-neutral-600 transition border-l border-neutral-600"
                    title="Move end date forward"
                >
                    <ChevronRight className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
}

function GroupByTabs({
    groupBy,
    onGroupByChange,
}: {
    groupBy: GroupBy;
    onGroupByChange: (g: GroupBy) => void;
}) {
    return (
        <div>
            <label className="text-sm text-neutral-400 mb-2 block">Group By</label>
            <div className="flex gap-2">
                <button
                    onClick={() => onGroupByChange('table')}
                    className={tabClass(groupBy === 'table')}
                >
                    <List className="inline w-4 h-4 mr-2" />Table
                </button>
                <button
                    onClick={() => onGroupByChange('movie')}
                    className={tabClass(groupBy === 'movie')}
                >
                    <Film className="inline w-4 h-4 mr-2" />By Movie
                </button>
                <button
                    onClick={() => onGroupByChange('cinema')}
                    className={tabClass(groupBy === 'cinema')}
                >
                    <MapPin className="inline w-4 h-4 mr-2" />By Cinema
                </button>
            </div>
        </div>
    );
}

interface AppHeaderProps {
    city: string;
    cities: string[];
    onCityChange: (city: string) => void;
    dateRange: DateRange;
    currentDate: Date;
    rangeStartDate: string;
    rangeEndDate: string;
    onDateRangeChange: (r: DateRange) => void;
    onNavigate: (dir: 'prev' | 'next') => void;
    onSetCurrentDate: (v: string) => void;
    onResetToToday: () => void;
    onNavigateRangeStart: (dir: 'prev' | 'next') => void;
    onNavigateRangeEnd: (dir: 'prev' | 'next') => void;
    onSetRangeStartDate: (v: string) => void;
    onSetRangeEndDate: (v: string) => void;
    groupBy: GroupBy;
    onGroupByChange: (groupBy: GroupBy) => void;
}

export default function AppHeader({
    city,
    cities,
    onCityChange,
    dateRange,
    currentDate,
    rangeStartDate,
    rangeEndDate,
    onDateRangeChange,
    onNavigate,
    onSetCurrentDate,
    onResetToToday,
    onNavigateRangeStart,
    onNavigateRangeEnd,
    onSetRangeStartDate,
    onSetRangeEndDate,
    groupBy,
    onGroupByChange,
}: AppHeaderProps) {

    return (
        <>
            <div className="bg-neutral-950 border-b border-red-900/30">
                <div className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between">
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
                            <option key={c} value={c}>{c}</option>
                        ))}
                    </select>
                </div>
            </div>
            <div className="bg-neutral-950 border-b border-red-900/30">
                <div className="max-w-7xl mx-auto px-4 py-3 space-y-3">
                    <GroupByTabs groupBy={groupBy} onGroupByChange={onGroupByChange} />
                    <DateRangeTabs
                        dateRange={dateRange}
                        onDateRangeChange={onDateRangeChange}
                        onResetToToday={onResetToToday}
                    />
                </div>
            </div>
            {(dateRange === 'today' || dateRange === 'range') && (
                <div className="sticky top-0 z-10 bg-neutral-950 border-b border-red-900/30">
                    <div className="max-w-7xl mx-auto px-4 py-3">
                        {dateRange === 'today' && (
                            <DateNavigator
                                currentDate={currentDate}
                                onNavigate={onNavigate}
                                onSetCurrentDate={onSetCurrentDate}
                                onResetToToday={onResetToToday}
                            />
                        )}
                        {dateRange === 'range' && (
                            <RangeDateNavigator
                                rangeStartDate={rangeStartDate}
                                rangeEndDate={rangeEndDate}
                                onNavigateStart={onNavigateRangeStart}
                                onNavigateEnd={onNavigateRangeEnd}
                                onSetStart={onSetRangeStartDate}
                                onSetEnd={onSetRangeEndDate}
                            />
                        )}
                    </div>
                </div>
            )}
        </>
    );
}
