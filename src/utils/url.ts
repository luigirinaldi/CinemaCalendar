import { GROUP_BY_VALUES, SHOW_MODE_VALUES, TABLE_SORT_VALUES } from '../types';
import type { DateRange, GroupBy, ShowMode, TableSort } from '../types';

/** Parse a YYYY-MM-DD string as local midnight (avoids UTC-offset day shift). */
export function parseLocalDate(str: string): Date {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
}

/** Serialize a Date to YYYY-MM-DD using local calendar date (not UTC). */
export function toLocalDateStr(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function getUrlSearchParams(): {
    city: string | null;
    dateRange: DateRange | null;
    date: string | null;
    start: string | null;
    end: string | null;
    groupBy: GroupBy | null;
    showMode: ShowMode | null;
    tableSort: TableSort | null;
} {
    const p = new URLSearchParams(window.location.search);
    const dateRange = p.get('dateRange');
    const groupBy = p.get('groupBy');
    const showMode = p.get('showMode');
    const tableSort = p.get('tableSort');
    return {
        city: p.get('city'),
        dateRange: isDateRange(dateRange) ? dateRange : null,
        date: p.get('date'),
        start: p.get('start'),
        end: p.get('end'),
        groupBy: isGroupBy(groupBy) ? groupBy : null,
        showMode: isShowMode(showMode) ? showMode : null,
        tableSort: isTableSort(tableSort) ? tableSort : null,
    };
}

export function buildDayUrl(date: Date): string {
    const url = new URL(window.location.href);
    url.searchParams.set('dateRange', 'today');
    url.searchParams.set('date', toLocalDateStr(date));
    url.searchParams.delete('start');
    url.searchParams.delete('end');
    return url.toString();
}

export function setUrlSearchParams(set: Record<string, string>, del: string[] = []) {
    const url = new URL(window.location.href);
    Object.entries(set).forEach(([k, v]) => url.searchParams.set(k, v));
    del.forEach((k) => url.searchParams.delete(k));
    history.replaceState(null, '', url.toString());
}

function isDateRange(value: string | null): value is DateRange {
    return value === 'today' || value === 'range' || value === 'anytime';
}

function isGroupBy(value: string | null): value is GroupBy {
    return GROUP_BY_VALUES.includes(value as GroupBy);
}

function isShowMode(value: string | null): value is ShowMode {
    return SHOW_MODE_VALUES.includes(value as ShowMode);
}

function isTableSort(value: string | null): value is TableSort {
    return TABLE_SORT_VALUES.includes(value as TableSort);
}
