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
    screeningsList: ShowingsTable[]
): Record<number, ShowingsTable[]> => {
    const grouped: Record<number, ShowingsTable[]> = {};
    screeningsList.forEach((s) => {
        const day = new Date(s.start_time).getDay();
        if (!grouped[day]) grouped[day] = [];
        grouped[day].push(s);
    });
    return grouped;
};

export const groupByMovie = (
    screeningsList: ShowingsTable[],
    getMovie: (id: number) => FilmTable | undefined
): Array<[string, ShowingsTable[]]> => {
    type Group = {
        key: string;
        movie: FilmTable | null;
        screenings: ShowingsTable[];
    };
    const groups: Group[] = [];

    screeningsList.forEach((s) => {
        const movie = getMovie(s.film_id) ?? null;
        let existing: Group | undefined;

        if (movie) {
            if (movie.tmdb_id != null) {
                existing = groups.find(
                    (g) =>
                        g.movie?.tmdb_id != null &&
                        g.movie.tmdb_id === movie.tmdb_id
                );
            }
            if (!existing) {
                existing = groups.find((g) => {
                    const gm = g.movie;
                    if (!gm) return false;
                    if (movie.title && gm.title !== movie.title) return false;
                    if (
                        movie.duration != null &&
                        gm.duration !== movie.duration
                    )
                        return false;
                    if (movie.director && gm.director !== movie.director)
                        return false;
                    return true;
                });
            }
        } else {
            existing = groups.find((g) => g.key === `film:${s.film_id}`);
        }

        if (existing) {
            existing.screenings.push(s);
        } else {
            let key: string;
            if (movie && movie.tmdb_id != null) {
                key = `tmdb:${movie.tmdb_id}`;
            } else if (movie) {
                const parts: string[] = [];
                if (movie.title) parts.push(movie.title.trim());
                if (movie.duration != null) parts.push(String(movie.duration));
                if (movie.director) parts.push(movie.director.trim());
                key = `title:${parts.join('|')}`;
            } else {
                key = `film:${s.film_id}`;
            }
            groups.push({ key, movie, screenings: [s] });
        }
    });

    return groups.map((g) => [g.key, g.screenings]);
};
