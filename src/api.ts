import supabase from './supabase';

import type { Tables } from '../database.types';

export type FilmTable = Tables<'new_films'>;
export type CinemaTable = Tables<'new_cinemas'>;
export type ShowingsTable = Tables<'new_showings'>;

export const fetchMovies = async (): Promise<FilmTable[]> => {
    const response = await supabase.from('new_films').select();
    if (response.error !== null || response.data === null)
        throw new Error(`Failed to fetch films: ${response.error}`);
    if (response.data.length === 0) {
        console.error(response);
        throw new Error(`Empty films`);
    }
    return response.data;
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
