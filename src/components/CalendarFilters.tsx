import type { ReactNode } from 'react';
import {
    Calendar,
    ChevronLeft,
    ChevronRight,
    Film,
    MapPin,
    List,
} from 'lucide-react';
import { DateTime } from 'luxon';
import type { DateRange, Filters, GroupBy } from '../types';
import { rangeLabel, todayIn } from '../lib/dates';

interface Props {
    children?: ReactNode;
    filters: Filters;
    onChange: (filters: Filters) => void;
    groupBy: GroupBy;
    onGroupChange: (value: GroupBy) => void;
    zone: string;
}
const buttonClass = (active: boolean) =>
    `px-4 py-2 rounded-lg transition ${active ? 'bg-red-700 text-white' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'}`;
const ranges: [DateRange, string][] = [
    ['today', 'Today'],
    ['thisWeek', 'This Week'],
    ['anytime', 'Anytime'],
    ['custom', 'Custom Range'],
];
export function CalendarFilters({
    children,
    filters,
    onChange,
    groupBy,
    onGroupChange,
    zone,
}: Props) {
    const update = (value: Partial<Filters>) =>
        onChange({ ...filters, ...value });
    const navigate = (direction: number) =>
        update({
            currentDate: DateTime.fromISO(filters.currentDate, { zone })
                .plus({
                    days: direction * (filters.dateRange === 'today' ? 1 : 7),
                })
                .toISODate()!,
        });
    return (
        <div className="space-y-4">
            <fieldset>
                <legend className="text-sm text-neutral-400 mb-2">
                    Group By
                </legend>
                <div className="flex flex-wrap gap-2">
                    <button
                        className={buttonClass(groupBy === 'table')}
                        aria-pressed={groupBy === 'table'}
                        onClick={() => onGroupChange('table')}
                    >
                        <List className="inline w-4 h-4 mr-2" />
                        Table
                    </button>
                    <button
                        className={buttonClass(groupBy === 'movie')}
                        aria-pressed={groupBy === 'movie'}
                        onClick={() => onGroupChange('movie')}
                    >
                        <Film className="inline w-4 h-4 mr-2" />
                        By Movie
                    </button>
                    <button
                        className={buttonClass(groupBy === 'cinema')}
                        aria-pressed={groupBy === 'cinema'}
                        onClick={() => onGroupChange('cinema')}
                    >
                        <MapPin className="inline w-4 h-4 mr-2" />
                        By Cinema
                    </button>
                    <button
                        className={buttonClass(groupBy === 'map')}
                        aria-pressed={groupBy === 'map'}
                        onClick={() => onGroupChange('map')}
                    >
                        <MapPin className="inline w-4 h-4 mr-2" />
                        Map
                    </button>
                </div>
            </fieldset>
            {children}
            <fieldset>
                <legend className="text-sm text-neutral-400 mb-2">
                    Date Range
                </legend>
                <div className="flex flex-wrap gap-2">
                    {ranges.map(([value, label]) => (
                        <button
                            key={value}
                            aria-pressed={filters.dateRange === value}
                            className={buttonClass(filters.dateRange === value)}
                            onClick={() =>
                                update({
                                    dateRange: value,
                                    ...(['today', 'thisWeek'].includes(value)
                                        ? { currentDate: todayIn(zone) }
                                        : {}),
                                })
                            }
                        >
                            <Calendar className="inline w-4 h-4 mr-2" />
                            {label}
                        </button>
                    ))}
                </div>
            </fieldset>
            {['today', 'thisWeek'].includes(filters.dateRange) && (
                <div className="flex items-center gap-4 bg-neutral-800 rounded-lg p-4">
                    <button
                        aria-label="Previous period"
                        className="p-2 rounded-lg bg-neutral-700 hover:bg-neutral-600"
                        onClick={() => navigate(-1)}
                    >
                        <ChevronLeft />
                    </button>
                    <div className="flex-1 text-center">
                        <div className="text-lg font-semibold">
                            {rangeLabel(filters, zone)}
                        </div>
                        {filters.currentDate !== todayIn(zone) && (
                            <button
                                className="text-sm text-red-500 mt-1"
                                onClick={() =>
                                    update({ currentDate: todayIn(zone) })
                                }
                            >
                                Back to today
                            </button>
                        )}
                    </div>
                    <button
                        aria-label="Next period"
                        className="p-2 rounded-lg bg-neutral-700 hover:bg-neutral-600"
                        onClick={() => navigate(1)}
                    >
                        <ChevronRight />
                    </button>
                </div>
            )}
            {filters.dateRange === 'custom' && (
                <div className="flex flex-wrap gap-4">
                    {(['customStartDate', 'customEndDate'] as const).map(
                        (field, index) => (
                            <label
                                key={field}
                                className="text-sm text-neutral-400"
                            >
                                {index === 0 ? 'Start Date' : 'End Date'}
                                <input
                                    type="date"
                                    value={filters[field]}
                                    onChange={(event) =>
                                        update({ [field]: event.target.value })
                                    }
                                    className="block bg-neutral-800 text-white px-3 py-2 rounded border border-neutral-700 mt-1"
                                />
                            </label>
                        )
                    )}
                </div>
            )}
        </div>
    );
}
