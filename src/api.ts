import type { QueryData } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';
import { fetchAllPages } from './lib/pagination';

const cinemaQuery = (supabase: SupabaseClient<Database>) =>
    supabase.from('new_cinemas').select('*', { count: 'exact' }).order('id');
// Explicit FK names avoid ambiguity through new_films.cinema_id.
const screeningQuery = (supabase: SupabaseClient<Database>) =>
    supabase
        .from('new_showings')
        .select(
            `
    id, film_id, cinema_id, start_time, booking_url,
    film:new_films!new_showings_film_id_fkey(*, tmdb_films(*)),
    cinema:new_cinemas!new_showings_cinema_id_fkey!inner(*)
`,
            { count: 'exact' }
        )
        .order('start_time')
        .order('id');

export type Cinema = QueryData<ReturnType<typeof cinemaQuery>>[number];
export type Screening = QueryData<ReturnType<typeof screeningQuery>>[number];

export async function fetchCinemas(
    supabase: SupabaseClient<Database>,
    signal: AbortSignal
): Promise<Cinema[]> {
    return fetchAllPages(async (from, to) => {
        const { data, error, count } = await cinemaQuery(supabase)
            .range(from, to)
            .abortSignal(signal);
        if (error) throw new Error(`Failed to fetch cinemas: ${error.message}`);
        return { data: data ?? [], count };
    });
}

export async function fetchScreenings(
    supabase: SupabaseClient<Database>,
    city: string,
    start: string | null,
    end: string | null,
    signal: AbortSignal
): Promise<Screening[]> {
    if (!city) return [];
    return fetchAllPages(async (from, to) => {
        // The !inner join filters the parent rows by city on the server.
        let query = screeningQuery(supabase).eq('cinema.location', city);
        if (start) query = query.gte('start_time', start);
        if (end) query = query.lt('start_time', end);
        const { data, error, count } = await query
            .range(from, to)
            .abortSignal(signal);
        if (error)
            throw new Error(`Failed to fetch screenings: ${error.message}`);
        return { data: data ?? [], count };
    });
}

export * from './catalogPresentation';
