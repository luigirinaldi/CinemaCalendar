import type { DateRange, GroupBy } from '../types';

export function getUrlSearchParams(): {
    city: string | null;
    dateRange: DateRange | null;
    date: string | null;
    start: string | null;
    end: string | null;
    groupBy: GroupBy | null;
} {
    const p = new URLSearchParams(window.location.search);
    const dateRange = p.get('dateRange');
    const groupBy = p.get('groupBy');
    return {
        city: p.get('city'),
        dateRange: isDateRange(dateRange) ? dateRange : null,
        date: p.get('date'),
        start: p.get('start'),
        end: p.get('end'),
        groupBy: isGroupBy(groupBy) ? groupBy : null,
    };
}

export function setUrlSearchParams(set: Record<string, string>, del: string[] = []) {
    const url = new URL(window.location.href);
    Object.entries(set).forEach(([k, v]) => url.searchParams.set(k, v));
    del.forEach((k) => url.searchParams.delete(k));
    history.replaceState(null, '', url.toString());
}

function isDateRange(value: string | null): value is DateRange {
    return value === 'today' || value === 'thisWeek' || value === 'anytime' || value === 'custom';
}

function isGroupBy(value: string | null): value is GroupBy {
    return value === 'movie' || value === 'cinema';
}
