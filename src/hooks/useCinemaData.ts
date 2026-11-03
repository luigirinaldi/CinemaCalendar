import supabase from '../supabase';
import { useEffect, useState } from 'react';
import {
    fetchCinemas,
    fetchScreenings,
    type Cinema,
    type Screening,
} from '../calendarApi';
import { cityZone, dateBounds } from '../lib/dates';
import type { Filters } from '../types';

const message = (error: unknown) =>
    error instanceof Error ? error.message : 'Unable to load cinema data.';
export function useCinemaData(filters: Filters) {
    const [cinemas, setCinemas] = useState<Cinema[]>([]);
    const [city, setCity] = useState('');
    const [screenings, setScreenings] = useState<Screening[]>([]);
    const [initialLoading, setInitialLoading] = useState(true);
    const [loading, setLoading] = useState(false);
    const [cinemaError, setCinemaError] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [revision, setRevision] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        setInitialLoading(true);
        setCinemaError(null);
        fetchCinemas(supabase, controller.signal)
            .then((rows) => {
                if (controller.signal.aborted) return;
                setCinemas(rows);
                setCity(
                    (previous) =>
                        previous ||
                        rows.find((row) => row.location)?.location ||
                        ''
                );
            })
            .catch((e) => {
                if (!controller.signal.aborted) setCinemaError(message(e));
            })
            .finally(() => {
                if (!controller.signal.aborted) setInitialLoading(false);
            });
        return () => controller.abort();
    }, [revision]);
    const { dateRange, currentDate, customStartDate, customEndDate } = filters;
    useEffect(() => {
        const controller = new AbortController();
        setScreenings([]);
        setError(null);
        if (!city) return () => controller.abort();
        setLoading(true);
        async function load() {
            try {
                const [start, end] = dateBounds(
                    { dateRange, currentDate, customStartDate, customEndDate },
                    cityZone(city)
                );
                const rows = await fetchScreenings(
                    supabase,
                    city,
                    start,
                    end,
                    controller.signal
                );
                if (!controller.signal.aborted) setScreenings(rows);
            } catch (e) {
                if (!controller.signal.aborted) setError(message(e));
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }
        void load();
        return () => controller.abort();
    }, [
        city,
        dateRange,
        currentDate,
        customStartDate,
        customEndDate,
        revision,
    ]);
    return {
        cinemas,
        city,
        setCity,
        screenings,
        loading: initialLoading || loading,
        error: cinemaError || error,
        retry: () => setRevision((value) => value + 1),
    };
}
