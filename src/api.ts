import supabase from './supabase';

import type { Tables } from '../database.types';

export type FilmTable = Tables<'new_films'>;
export type CinemaTable = Tables<'new_cinemas'>;
export type ShowingsTable = Tables<'new_showings'>;


export type TMDBFilm = {
    id: number;
    created_at: string;
    adult: boolean;
    backdrop_path: string | null;
    genre_ids: number[];
    original_language: string;
    original_title: string;
    overview: string;
    popularity: number;
    poster_path: string | null;
    title: string;
    video: boolean;
    vote_average: number;
    vote_count: number;
    letterboxd_slug: string | null;
    letterboxd_avg_rating: number | null;
    letterboxd_num_ratings: number | null;
    letterboxd_ratings: any | null;
    release_date: string;
};

// Extended film type used by the frontend: includes a resolved poster_url
export type FilmWithPoster = FilmTable & { 
    poster_url?: string | null;
    tmdb_info: TMDBFilm | null;
 };

export type FilmWithShowingsAndTMDB = FilmTable & {
    new_showings: ShowingsTable[];
    tmdb_films: TMDBFilm | null;
};

export type CinemasWithShowings = CinemaTable & {
    new_films: FilmWithShowingsAndTMDB;
};

// use TMDB size that matches the actual display width (w342 is good for ~220-350px wide posters)
const tmdbImageBase = 'https://image.tmdb.org/t/p/w342';

export function filmWithPoster(f: FilmWithShowingsAndTMDB): FilmWithPoster {
    const posterPath = f.tmdb_films?.poster_path ?? null;
    let poster_url: string | null = null;
    if (posterPath) {
        poster_url = `${tmdbImageBase}${posterPath}`;
    } else if (f.cover_url) {
        poster_url = f.cover_url;
    } else {
        const escape = (s: string) =>
            s
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        const titleRaw = f.title ?? 'No title';
        const year = f.release_year ?? '';

        const wrapLines = (text: string, maxChars = 20) => {
            const words = text.split(/\s+/);
            const lines: string[] = [];
            let current = '';
            for (const w of words) {
                if ((current + ' ' + w).trim().length <= maxChars) {
                    current = (current + ' ' + w).trim();
                } else {
                    if (current.length) lines.push(current);
                    current = w;
                }
            }
            if (current.length) lines.push(current);
            return lines;
        };

        const lines = wrapLines(titleRaw, 20);
        const tspans = lines
            .map(
                (ln, idx) =>
                    `<tspan x='50%' dy='${idx === 0 ? '0' : '1.6em'}' font-size='${idx === 0 ? 22 : 18}'>${escape(ln)}</tspan>`
            )
            .join('');

        const svg = `<?xml version='1.0' encoding='UTF-8'?>
<svg xmlns='http://www.w3.org/2000/svg' width='400' height='600' viewBox='0 0 400 600'>
  <rect width='100%' height='100%' fill='#26272b'/>
  <text x='50%' y='42%' fill='#ffffff' font-family='Helvetica,Arial,sans-serif' font-weight='600' text-anchor='middle'>${tspans}</text>
  <text x='50%' y='78%' fill='#bfc7cb' font-family='Helvetica,Arial,sans-serif' font-size='16' text-anchor='middle'>${escape(String(year))}</text>
</svg>`;
        poster_url = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    }

    return { ...f, tmdb_info: f.tmdb_films, poster_url };
}

export const fetchCinemas = async (): Promise<CinemaTable[]> => {
    const response = await supabase.from('new_cinemas').select();
    if (response.error !== null || response.data === null)
        throw new Error(`Failed to fetch cinemas: ${response.error}`);
    if (response.data.length === 0) {
        console.error(response);
        throw new Error(`Empty cinemas`);
    }
    return response.data;
};

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const screeningsCache = new Map<string, { data: FilmWithShowingsAndTMDB[]; fetchedAt: number }>();

function screeningsCacheKey(date_range: [Date, Date] | null, cinema_ids: number[]): string {
    const ids = [...cinema_ids].sort().join(',');
    const range = date_range
        ? `${date_range[0].toISOString()}|${date_range[1].toISOString()}`
        : 'null';
    return `${ids}::${range}`;
}

// VITE_FUNCTIONS_URL overrides the functions endpoint (useful for local dev).
// Falls back to the standard Supabase functions URL derived from VITE_SUPABASE_URL.
const functionsUrl =
    import.meta.env.VITE_FUNCTIONS_URL ??
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

export const fetchLetterboxdSlugs = async (username: string): Promise<Set<string>> => {
    const res = await fetch(`${functionsUrl}/letterboxd-list`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY}`,
        },
        body: JSON.stringify({ username }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
    }
    const { slugs } = await res.json();
    return new Set<string>(slugs);
};

export const fetchScreenings = async (
    date_range: [Date, Date] | null,
    cinema_ids: number[]
): Promise<FilmWithShowingsAndTMDB[]> => {
    const key = screeningsCacheKey(date_range, cinema_ids);
    const cached = screeningsCache.get(key);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        return cached.data;
    }

    let response;
    if (date_range === null) {
        response = await supabase
            .from('new_films')
            .select('*, new_showings!inner(*), tmdb_films(*)')
            .in('cinema_id', cinema_ids);
    } else {
        const [start, end] = date_range;
        response = await supabase
            .from('new_films')
            .select('*, new_showings!inner(*), tmdb_films(*)')
            .in('cinema_id', cinema_ids)
            .lte('new_showings.start_time', end.toISOString())
            .gte('new_showings.start_time', start.toISOString());
    }
    if (response.error !== null || response.data === null)
        throw new Error(`Failed to fetch screenings: ${response.error}`);

    const data = response.data as FilmWithShowingsAndTMDB[];
    screeningsCache.set(key, { data, fetchedAt: Date.now() });
    return data;
};
