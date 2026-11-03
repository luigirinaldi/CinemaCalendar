import { dayKey } from '../lib/dates';
import { filmKey } from '../lib/groupings';
import type { FilmTable, ShowingsTable } from '../api';

export const sortScreeningByStartTime = (a: ShowingsTable, b: ShowingsTable) =>
    new Date(a.start_time).getTime() - new Date(b.start_time).getTime();

export const sortGroupedByStartTime = (
    [_k_a, a]: [unknown, ShowingsTable[]],
    [_k_b, b]: [unknown, ShowingsTable[]]
) =>
    Math.min(...a.map((s) => new Date(s.start_time).getTime())) -
    Math.min(...b.map((s) => new Date(s.start_time).getTime()));

export const groupByCinema = (
    screeningsList: ShowingsTable[]
): Record<number, ShowingsTable[]> => {
    const grouped: Record<number, ShowingsTable[]> = {};
    screeningsList.forEach((s) => {
        if (!grouped[s.cinema_id]) grouped[s.cinema_id] = [];
        grouped[s.cinema_id].push(s);
    });
    return grouped;
};

export const groupByDay = (
    screeningsList: ShowingsTable[],
    zone: string
): Record<string, ShowingsTable[]> => {
    const grouped: Record<string, ShowingsTable[]> = {};
    screeningsList.forEach((s) => {
        const day = dayKey(s.start_time, zone);
        if (!grouped[day]) grouped[day] = [];
        grouped[day].push(s);
    });
    return grouped;
};

export const groupByMovie = (
    screeningsList: ShowingsTable[],
    getMovie: (id: number) => FilmTable | undefined
): Array<[string, ShowingsTable[]]> => {
    const groups = new Map<string, ShowingsTable[]>();
    for (const row of [...screeningsList].sort(sortScreeningByStartTime)) {
        const key = filmKey(getMovie(row.film_id), row.film_id);
        const rows = groups.get(key) ?? [];
        rows.push(row);
        groups.set(key, rows);
    }
    return [...groups];
};
