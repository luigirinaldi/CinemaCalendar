import supabase from './supabase';

import type { Tables } from '../database.types';

export type FilmTable = Tables<'new_films'>;
export type CinemaTable = Tables<'new_cinemas'>;
export type ShowingsTable = Tables<'new_showings'>;

// Extended film type used by the frontend: includes a resolved poster_url
export type FilmWithPoster = FilmTable & { poster_url?: string | null };

export const fetchMovies = async (): Promise<FilmWithPoster[]> => {
    const response = await supabase.from('new_films').select();
    if (response.error !== null || response.data === null)
        throw new Error(`Failed to fetch films: ${response.error}`);
    if (response.data.length === 0) {
        console.error(response);
        throw new Error(`Empty films`);
    }
    // use TMDB size that matches the actual display width (w342 is good for ~220-350px wide posters)
    const tmdbImageBase = 'https://image.tmdb.org/t/p/w342';

    const tmdbIds = Array.from(
        new Set(
            response.data
                .map((r: any) => r.tmdb_id)
                .filter((id: any) => id !== null && typeof id !== 'undefined')
        )
    ) as number[];

    const tmdbMap: Record<number, string | null> = {};
    if (tmdbIds.length > 0) {
        const tmdbResp = await supabase
            .from('tmdb_films')
            .select('id, poster_path')
            .in('id', tmdbIds);
        if (!tmdbResp.error && tmdbResp.data) {
            for (const t of tmdbResp.data as { id: number; poster_path: string | null }[]) {
                tmdbMap[t.id] = t.poster_path ?? null;
            }
        }
    }

    return (response.data as FilmTable[]).map((f) => {
        const posterPath = f.tmdb_id ? tmdbMap[f.tmdb_id] ?? null : null;
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

        return { ...f, poster_url };
    });
};

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

export const fetchScreenings = async (
    date_range: [Date, Date] | null,
    cinema_ids: number[]
): Promise<ShowingsTable[]> => {
    let response;
    if (date_range === null) {
        response = await supabase
            .from('new_showings')
            .select()
            .in('cinema_id', cinema_ids);
    } else {
        const [start, end] = date_range;
        response = await supabase
            .from('new_showings')
            .select()
            .in('cinema_id', cinema_ids)
            .lte('start_time', end.toISOString())
            .gte('start_time', start.toISOString());
    }
    if (response.error !== null || response.data === null)
        throw new Error(`Failed to fetch screenings: ${response.error}`);
    console.log(date_range, response.data.length);
    return response.data;
};
