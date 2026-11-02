import type { Screening } from '../api';
import { dayKey } from './dates';

export function groupScreenings(
    screenings: Screening[],
    key: (s: Screening) => string
) {
    const groups = new Map<string, Screening[]>();
    for (const screening of [...screenings].sort(
        (a, b) => Date.parse(a.start_time) - Date.parse(b.start_time)
    )) {
        const id = key(screening);
        const group = groups.get(id);
        if (group) group.push(screening);
        else groups.set(id, [screening]);
    }
    return [...groups.entries()];
}
export function movieKey(s: Screening) {
    const film = s.film;
    if (film?.tmdb_id != null) return `tmdb:${film.tmdb_id}`;
    // Conservative fallback: unknown metadata must not merge unrelated films.
    if (film?.title && film.director && film.release_year)
        return JSON.stringify([
            film.title.trim().toLowerCase(),
            film.director.trim().toLowerCase(),
            film.release_year,
            film.duration,
        ]);
    return `film:${s.film_id}`;
}
export const byMovie = (rows: Screening[]) => groupScreenings(rows, movieKey);
export const byCinema = (rows: Screening[]) =>
    groupScreenings(rows, (s) => String(s.cinema_id));
export const byDay = (rows: Screening[], zone: string) =>
    groupScreenings(rows, (s) => dayKey(s.start_time, zone));
