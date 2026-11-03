import supabase from '../supabase';
import { useEffect, useMemo, useState } from 'react';
import {
    fetchCinemas,
    fetchScreenings,
    type Cinema,
    type Screening,
} from '../api';
import { cityZone, dateBounds } from '../lib/dates';
import type { Filters } from '../types';
import { cinemasInArea, nearestCity, type SearchArea } from '../lib/location';

const message = (error: unknown) =>
    error instanceof Error ? error.message : 'Unable to load cinema data.';
export function useCinemaData(
    filters: Filters,
    initialCity = '',
    initialArea: SearchArea | null = null
) {
    const [cinemas, setCinemas] = useState<Cinema[]>([]);
    const [city, setCity] = useState(initialCity);
    const [area, setArea] = useState(initialArea);
    const searchCinemas = useMemo(
        () =>
            area
                ? cinemasInArea(cinemas, area)
                : cinemas.filter((c) => c.location === city),
        [cinemas, city, area]
    );
    const zone = cityZone(
        area ? (nearestCity(cinemas, area)?.city ?? city) : city
    );
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
                        rows.find(
                            (row) =>
                                row.location?.toLowerCase() ===
                                previous.toLowerCase()
                        )?.location ||
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
        if (!city || !searchCinemas.length) {
            setLoading(false);
            return () => controller.abort();
        }
        setLoading(true);
        async function load() {
            try {
                const locations = [
                    ...new Set(
                        searchCinemas.flatMap((c) =>
                            c.location ? [c.location] : []
                        )
                    ),
                ];
                const results = await Promise.all(
                    locations.map((location) => {
                        const [start, end] = dateBounds(
                            {
                                dateRange,
                                currentDate,
                                customStartDate,
                                customEndDate,
                            },
                            cityZone(location)
                        );
                        return fetchScreenings(
                            supabase,
                            location,
                            start,
                            end,
                            controller.signal,
                            area
                                ? searchCinemas
                                      .filter((c) => c.location === location)
                                      .map((c) => c.id)
                                : undefined
                        );
                    })
                );
                const rows = results.flat();
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
        searchCinemas,
        area,
    ]);
    return {
        cinemas,
        city,
        setCity,
        area,
        setArea,
        searchCinemas,
        zone,
        screenings,
        loading: initialLoading || loading,
        error: cinemaError || error,
        retry: () => setRevision((value) => value + 1),
    };
}
