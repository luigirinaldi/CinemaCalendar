export interface Film {
    title: string;
    url: string;
    director?: string;
    duration?: number;
    language?: string;
    year?: number;
    country?: string;
}

export interface Showing {
    startTime: string;
    bookingUrl?: string;
    theatre?: string;
}

export interface FilmShowings {
    film: Film;
    showings: Showing[];
}

export interface Cinema {
    name: string;
    location: string; // string (city name)
    coordinates: [string, string];
}

export interface CinemaShowing {
    cinema: Cinema;
    showings: FilmShowings[];
}

// Type of the scraper function
// Each scraper may scrape multiple cinemas,
// each containing a cinema and the showings for that cinema
export type ScraperFunction = () => Promise<CinemaShowing[]>;
