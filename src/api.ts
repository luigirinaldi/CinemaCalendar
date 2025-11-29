import supabase from './supabase';

import type { Tables } from '../database.types';

export type FilmTable = Tables<'new_films'>;
export type CinemaTable = Tables<'new_cinemas'>;
export type ShowingsTable = Tables<'new_showings'>;

export type TMDBFilm = {
  id: number;
  created_at: string; // timestamp with time zone → string in Supabase JS
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
  letterboxd_ratings: any | null; // jsonb
  release_date: string;
};

export type FilmWithShowingsAndTMDB = FilmTable & {
    new_showings: ShowingsTable[];
    tmdb_films: TMDBFilm | null;
};

export type CinemasWithShowings = CinemaTable & {
    new_films: FilmWithShowingsAndTMDB
}

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
): Promise<FilmWithShowingsAndTMDB[]> => {
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
    console.log(date_range, response.data.length);
    return response.data;
};
