import 'dotenv/config';
import type { Movie } from '../src/types';

type TMDBObj = {
    id: number;
    title: string;
    release_date: string;
    popularity: number;
};
type TMDBSearch = {
    page: number;
    results: TMDBObj[];
    total_pages: number;
    total_results: number;
};

const OPTIONS = {
    method: 'GET',
    headers: {
        accept: 'application/json',
        Authorization: 'Bearer ' + process.env.TMDB_API_KEY
    }, // kindly don't steal this access token for your personal use, instead get one for free at https://www.themoviedb.org/settings/api
};

async function getTMDB(film : Movie) : Promise<TMDBObj|null> {
    if (!film.release_date) { // if there is no release date, set the current year as fallback
        film.release_date = (new Date).getFullYear().toString();
    }
    let search = await searchOnTMDB(film);
    if (!search || search.total_results == 0) {
        console.error(`No TMDB results for ${film.title} (${film.release_date})`);
        return null;
    }
    let TMDBMovie = search.results[0];
    // try to find the best match among multiple results
    // if (search.results.length > 1) {
    //     TMDBMovie = await guessMovie(search, film);
    // }
    return TMDBMovie;
}

async function searchOnTMDB (film:Movie) : Promise<TMDBSearch|null> {
    let title = film.title;
    for (let i = 0; i < 3; i++) {
        // I use year because it seems the search engine is more flexible with it and it is less prone to mismatch,
        // if it doesn't work, it could be useful retrying with primary_release_year instead of year
        let res = await fetch(`https://api.themoviedb.org/3/search/movie?query=${encodeURI(title)}&include_adult=true&year=${film.release_date}&page=1`, OPTIONS);
        let search : TMDBSearch = await res.json();
        if (typeof search !== 'undefined') {
            if (search.total_results == 0) { // found no results
                // If there are no results, we try to match without the release date.
                res = await fetch(`https://api.themoviedb.org/3/search/movie?query=${encodeURI(title)}&include_adult=true&page=1`, OPTIONS);
                search = await res.json();
            }
            if (search.total_results != 0) {
                return search;
            }
        }
    }
    console.error(`Failed to get TMDB results for ${film.title} (${film.release_date}) after 3 attempts`);
    return null;
}

/**
 * Tries to fix the horrible TMDB search algorithm through a series of filters on the results.
 * @param search - The TMDB API response object.
 * @param film - The Movie object.
 */
async function guessMovie(search:TMDBSearch, film:Movie) : Promise<TMDBObj> {
    // The first check is title exact match, as it is the most reliable.
    // If there are no results, we try to match the release date.
    // Year match is skipped as it is highly unreliable.
    let results = search.results.filter(movie => movie.title == film.title);
    if (results.length == 0) {
        results = search.results.filter(movie => movie.release_date == film.release_date);
        if (results.length == 0) {
            return search.results[0];
        }
    } else if (results.length > 1) {
        let filtered = results.filter(movie => movie.release_date == film.release_date);
        if (filtered.length == 0) {
            filtered = results;
        }
        if (filtered.length > 1) {
            // Filters out fakes or duplicates (yes, they can appear in the wrong order...).
            return filtered.reduce((max, movie) => movie.popularity > max.popularity ? movie : max);
        }
        return filtered[0];
    }
    return results[0];
}
