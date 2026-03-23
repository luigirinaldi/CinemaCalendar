import { useSyncExternalStore, useMemo } from 'react';
import type { DateRange } from '../types';
import { getUrlSearchParams, setUrlSearchParams, parseLocalDate, toLocalDateStr } from '../utils/url';

interface DateRangeState {
    dateRange: DateRange;
    currentDate: Date;
    customStartDate: string;
    customEndDate: string;
}

function initState(): DateRangeState {
    const { dateRange, date, start, end } = getUrlSearchParams();
    return {
        dateRange:       dateRange ?? 'thisWeek',
        currentDate:     date ? parseLocalDate(date) : new Date(),
        customStartDate: start ?? toLocalDateStr(new Date()),
        customEndDate:   end  ?? toLocalDateStr(new Date()),
    };
}

export class DateRangeStore {
    private state: DateRangeState = initState();
    private listeners = new Set<() => void>();

    subscribe = (listener: () => void): () => void => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    getSnapshot = (): DateRangeState => this.state;

    private setState(next: Partial<DateRangeState>) {
        this.state = { ...this.state, ...next };
        this.syncUrl();
        this.listeners.forEach((l) => l());
    }

    private syncUrl() {
        const { dateRange, currentDate, customStartDate, customEndDate } = this.state;
        if (dateRange === 'today' || dateRange === 'thisWeek') {
            setUrlSearchParams({ dateRange, date: toLocalDateStr(currentDate) }, ['start', 'end']);
        } else if (dateRange === 'custom') {
            setUrlSearchParams({ dateRange, start: customStartDate, end: customEndDate }, ['date']);
        } else {
            setUrlSearchParams({ dateRange }, ['date', 'start', 'end']);
        }
    }

    setDateRange(r: DateRange) {
        const currentDate = (r === 'today' || r === 'thisWeek') ? new Date() : this.state.currentDate;
        this.setState({ dateRange: r, currentDate });
    }

    navigateDate(dir: 'prev' | 'next') {
        const delta = dir === 'next' ? 1 : -1;
        const next = new Date(this.state.currentDate);
        if (this.state.dateRange === 'today') next.setDate(next.getDate() + delta);
        else next.setDate(next.getDate() + delta * 7);
        this.setState({ currentDate: next });
    }

    resetToToday() {
        this.setState({ currentDate: new Date() });
    }

    setCustomStartDate(v: string) {
        this.setState({ customStartDate: v });
    }

    setCustomEndDate(v: string) {
        this.setState({ customEndDate: v });
    }
}

export const store = new DateRangeStore();

// Pre-bind methods so consumers always get stable function references
const setDateRange      = store.setDateRange.bind(store);
const navigateDate      = store.navigateDate.bind(store);
const resetToToday      = store.resetToToday.bind(store);
const setCustomStartDate = store.setCustomStartDate.bind(store);
const setCustomEndDate   = store.setCustomEndDate.bind(store);

export interface UseDateRangeResult {
    dateRange: DateRange;
    currentDate: Date;
    customStartDate: string;
    customEndDate: string;
    computedRange: [Date, Date] | null;
    setDateRange: (r: DateRange) => void;
    navigateDate: (dir: 'prev' | 'next') => void;
    resetToToday: () => void;
    setCustomStartDate: (v: string) => void;
    setCustomEndDate: (v: string) => void;
}

export function useDateRange(): UseDateRangeResult {
    const state = useSyncExternalStore(store.subscribe, store.getSnapshot);

    const computedRange = useMemo((): [Date, Date] | null => {
        const { dateRange, currentDate, customStartDate, customEndDate } = state;
        const dayStart = new Date(
            currentDate.getFullYear(),
            currentDate.getMonth(),
            currentDate.getDate(),
            0, 0, 0
        );
        switch (dateRange) {
            case 'today':
                return [dayStart, new Date(
                    currentDate.getFullYear(),
                    currentDate.getMonth(),
                    currentDate.getDate() + 1, 4, 0
                )];
            case 'thisWeek':
                return [dayStart, new Date(
                    currentDate.getFullYear(),
                    currentDate.getMonth(),
                    currentDate.getDate() + 7, 4, 0
                )];
            case 'custom':
                return [parseLocalDate(customStartDate), parseLocalDate(customEndDate)];
            case 'anytime':
                return null;
        }
    }, [state]);

    return {
        ...state,
        computedRange,
        setDateRange,
        navigateDate,
        resetToToday,
        setCustomStartDate,
        setCustomEndDate,
    };
}
