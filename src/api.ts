import supabase from './supabase';

import type { Tables } from '../database.types';


export const fetchMovies = async (): Promise<Tables<'films'>[]> => {
    const response = await supabase.from('films').select();
    if (response.error !== null || response.data === null) throw new Error(`Failed to fetch films: ${response.error}`)
    return response.data;
};

export const fetchCinemas = async (): Promise<Tables<'cinemas'>[]> => {
    const response = await supabase.from('cinemas').select();
    if (response.error !== null || response.data === null) throw new Error(`Failed to fetch cinemas: ${response.error}`)
    return response.data;
};

export const fetchScreenings = async (
    date_range: [Date, Date] | null,
    cinema_ids: number[]
): Promise<Tables<'film_showings'>[]> => {
    let response;
    if (date_range === null) {
        response = await supabase.from('film_showings').select().in('cinema_id', cinema_ids);
    } else {
        const [start, end] = date_range;
        response = await supabase.from('film_showings').select().in('cinema_id', cinema_ids).lte("start_time", end.toISOString()).gte('start_time', start.toISOString());
    }
    if (response.error !== null || response.data === null) throw new Error(`Failed to fetch screenings: ${response.error}`)
    console.log(date_range, response.data.length);
    return response.data;
};
