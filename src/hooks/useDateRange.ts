import { useReducer, useMemo, useEffect, useCallback } from 'react';
import type { DateRange } from '../types';
import { getUrlSearchParams, setUrlSearchParams, parseLocalDate, toLocalDateStr } from '../utils/url';

interface DateRangeState {
    dateRange: DateRange;
    currentDate: Date;
    rangeStartDate: string;
    rangeEndDate: string;
}

type DateRangeAction =
    | { type: 'SET_RANGE';              payload: DateRange }
    | { type: 'NAVIGATE';               payload: 'prev' | 'next' }
    | { type: 'RESET_TO_TODAY' }
    | { type: 'NAVIGATE_RANGE_START';   payload: 'prev' | 'next' }
    | { type: 'NAVIGATE_RANGE_END';     payload: 'prev' | 'next' }
    | { type: 'SET_RANGE_START';        payload: string }
    | { type: 'SET_RANGE_END';          payload: string }
    | { type: 'SET_CURRENT_DATE';       payload: string };

function defaultRangeEnd(): string {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return toLocalDateStr(d);
}

function dateRangeReducer(state: DateRangeState, action: DateRangeAction): DateRangeState {
    switch (action.type) {
        case 'SET_RANGE': {
            if (action.payload === 'range') {
                return {
                    ...state,
                    dateRange: 'range',
                    rangeStartDate: toLocalDateStr(new Date()),
                    rangeEndDate: defaultRangeEnd(),
                };
            }
            return { ...state, dateRange: action.payload };
        }
        case 'NAVIGATE': {
            const delta = action.payload === 'next' ? 1 : -1;
            const next = new Date(state.currentDate);
            next.setDate(next.getDate() + delta);
            return { ...state, currentDate: next };
        }
        case 'RESET_TO_TODAY':
            return { ...state, currentDate: new Date() };
        case 'NAVIGATE_RANGE_START': {
            const delta = action.payload === 'next' ? 1 : -1;
            const d = parseLocalDate(state.rangeStartDate);
            d.setDate(d.getDate() + delta);
            return { ...state, rangeStartDate: toLocalDateStr(d) };
        }
        case 'NAVIGATE_RANGE_END': {
            const delta = action.payload === 'next' ? 1 : -1;
            const d = parseLocalDate(state.rangeEndDate);
            d.setDate(d.getDate() + delta);
            return { ...state, rangeEndDate: toLocalDateStr(d) };
        }
        case 'SET_RANGE_START':
            return { ...state, rangeStartDate: action.payload };
        case 'SET_RANGE_END':
            return { ...state, rangeEndDate: action.payload };
        case 'SET_CURRENT_DATE':
            return { ...state, currentDate: parseLocalDate(action.payload) };
    }
}

function initState(): DateRangeState {
    const { dateRange, date, start, end } = getUrlSearchParams();
    return {
        dateRange:      dateRange ?? 'today',
        currentDate:    date ? parseLocalDate(date) : new Date(),
        rangeStartDate: start ?? toLocalDateStr(new Date()),
        rangeEndDate:   end  ?? defaultRangeEnd(),
    };
}

export interface UseDateRangeResult {
    dateRange: DateRange;
    currentDate: Date;
    rangeStartDate: string;
    rangeEndDate: string;
    computedRange: [Date, Date] | null;
    setDateRange: (r: DateRange) => void;
    navigateDate: (dir: 'prev' | 'next') => void;
    resetToToday: () => void;
    navigateRangeStart: (dir: 'prev' | 'next') => void;
    navigateRangeEnd: (dir: 'prev' | 'next') => void;
    setRangeStartDate: (v: string) => void;
    setRangeEndDate: (v: string) => void;
    setCurrentDate: (v: string) => void;
}

export function useDateRange(): UseDateRangeResult {
    const [state, dispatch] = useReducer(dateRangeReducer, undefined, initState);

    const computedRange = useMemo((): [Date, Date] | null => {
        const { dateRange, currentDate, rangeStartDate, rangeEndDate } = state;
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
            case 'range':
                return [parseLocalDate(rangeStartDate), parseLocalDate(rangeEndDate)];
            case 'anytime':
                return null;
        }
    }, [state]);

    // Sync date state to URL
    useEffect(() => {
        const { dateRange, currentDate, rangeStartDate, rangeEndDate } = state;
        if (dateRange === 'today') {
            setUrlSearchParams(
                { dateRange, date: toLocalDateStr(currentDate) },
                ['start', 'end']
            );
        } else if (dateRange === 'range') {
            setUrlSearchParams({ dateRange, start: rangeStartDate, end: rangeEndDate }, ['date']);
        } else {
            setUrlSearchParams({ dateRange }, ['date', 'start', 'end']);
        }
    }, [state]);

    const setDateRange = useCallback((r: DateRange) => {
        dispatch({ type: 'SET_RANGE', payload: r });
        if (r === 'today') dispatch({ type: 'RESET_TO_TODAY' });
    }, []);

    const navigateDate = useCallback((dir: 'prev' | 'next') => {
        dispatch({ type: 'NAVIGATE', payload: dir });
    }, []);

    const resetToToday = useCallback(() => {
        dispatch({ type: 'RESET_TO_TODAY' });
    }, []);

    const navigateRangeStart = useCallback((dir: 'prev' | 'next') => {
        dispatch({ type: 'NAVIGATE_RANGE_START', payload: dir });
    }, []);

    const navigateRangeEnd = useCallback((dir: 'prev' | 'next') => {
        dispatch({ type: 'NAVIGATE_RANGE_END', payload: dir });
    }, []);

    const setCurrentDate = useCallback((v: string) => {
        dispatch({ type: 'SET_CURRENT_DATE', payload: v });
    }, []);

    const setRangeStartDate = useCallback((v: string) => {
        dispatch({ type: 'SET_RANGE_START', payload: v });
    }, []);

    const setRangeEndDate = useCallback((v: string) => {
        dispatch({ type: 'SET_RANGE_END', payload: v });
    }, []);

    return {
        ...state,
        computedRange,
        setDateRange,
        navigateDate,
        resetToToday,
        navigateRangeStart,
        navigateRangeEnd,
        setCurrentDate,
        setRangeStartDate,
        setRangeEndDate,
    };
}
