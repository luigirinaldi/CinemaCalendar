import { useMemo, useState } from 'react';
import type { Screening } from '../api';

export function filterScreenings(
    rows: Screening[],
    slugs: Set<string> | null,
    years: [number, number] | null
) {
    return rows.filter((row) => {
        const metadata = row.film?.tmdb_films;
        if (
            slugs &&
            (!metadata?.letterboxd_slug || !slugs.has(metadata.letterboxd_slug))
        )
            return false;
        const year = metadata?.release_date
            ? Number(metadata.release_date.slice(0, 4))
            : row.film?.release_year;
        return !years || (year != null && year >= years[0] && year <= years[1]);
    });
}

export function useScreeningFilters(screenings: Screening[]) {
    const [letterboxd, setLetterboxd] = useState<Set<string> | null>(null);
    const [years, setYears] = useState<[number, number] | null>(null);
    const visibleScreenings = useMemo(
        () => filterScreenings(screenings, letterboxd, years),
        [screenings, letterboxd, years]
    );
    const movieYears = useMemo(
        () =>
            screenings.flatMap((row) => {
                const date = row.film?.tmdb_films?.release_date;
                const year = date
                    ? Number(date.slice(0, 4))
                    : row.film?.release_year;
                return year != null && Number.isFinite(year) ? [year] : [];
            }),
        [screenings]
    );
    return { visibleScreenings, movieYears, setLetterboxd, setYears };
}
