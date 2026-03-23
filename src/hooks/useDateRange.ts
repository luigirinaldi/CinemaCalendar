import { useReducer, useMemo, useEffect, useCallback } from 'react';
import type { DateRange } from '../types';
import { getUrlSearchParams, setUrlSearchParams, parseLocalDate, toLocalDateStr } from '../utils/url';

interface DateRangeState {
    dateRange: DateRange;
    currentDate: Date;
    customStartDate: string;
    customEndDate: string;
}

type DateRangeAction =
    | { type: 'SET_RANGE';        payload: DateRange }
    | { type: 'NAVIGATE';         payload: 'prev' | 'next' }
    | { type: 'RESET_TO_TODAY' }
    | { type: 'SET_CUSTOM_START'; payload: string }
    | { type: 'SET_CUSTOM_END';   payload: string };

function dateRangeReducer(state: DateRangeState, action: DateRangeAction): DateRangeState {
    switch (action.type) {
        case 'SET_RANGE':
            return { ...state, dateRange: action.payload };
        case 'NAVIGATE': {
            const delta = action.payload === 'next' ? 1 : -1;
            const next = new Date(state.currentDate);
            if (state.dateRange === 'today') next.setDate(next.getDate() + delta);
            else next.setDate(next.getDate() + delta * 7);
            return { ...state, currentDate: next };
        }
        case 'RESET_TO_TODAY':
            return { ...state, currentDate: new Date() };
        case 'SET_CUSTOM_START':
            return { ...state, customStartDate: action.payload };
        case 'SET_CUSTOM_END':
            return { ...state, customEndDate: action.payload };
    }
}

function initState(): DateRangeState {
    const { dateRange, date, start, end } = getUrlSearchParams();
    return {
        dateRange:       dateRange ?? 'today',
        currentDate:     date ? parseLocalDate(date) : new Date(),
        customStartDate: start ?? toLocalDateStr(new Date()),
        customEndDate:   end  ?? toLocalDateStr(new Date()),
    };
}

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
    const [state, dispatch] = useReducer(dateRangeReducer, undefined, initState);

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

    // Sync date state to URL
    useEffect(() => {
        const { dateRange, currentDate, customStartDate, customEndDate } = state;
        if (dateRange === 'today' || dateRange === 'thisWeek') {
            setUrlSearchParams(
                { dateRange, date: toLocalDateStr(currentDate) },
                ['start', 'end']
            );
        } else if (dateRange === 'custom') {
            setUrlSearchParams({ dateRange, start: customStartDate, end: customEndDate }, ['date']);
        } else {
            setUrlSearchParams({ dateRange }, ['date', 'start', 'end']);
        }
    }, [state]);

    const setDateRange = useCallback((r: DateRange) => {
        dispatch({ type: 'SET_RANGE', payload: r });
        if (r === 'today' || r === 'thisWeek') dispatch({ type: 'RESET_TO_TODAY' });
    }, []);

    const navigateDate = useCallback((dir: 'prev' | 'next') => {
        dispatch({ type: 'NAVIGATE', payload: dir });
    }, []);

    const resetToToday = useCallback(() => {
        dispatch({ type: 'RESET_TO_TODAY' });
    }, []);

    const setCustomStartDate = useCallback((v: string) => {
        dispatch({ type: 'SET_CUSTOM_START', payload: v });
    }, []);

    const setCustomEndDate = useCallback((v: string) => {
        dispatch({ type: 'SET_CUSTOM_END', payload: v });
    }, []);

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
