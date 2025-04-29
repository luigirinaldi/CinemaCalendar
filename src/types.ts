export interface FilmShowing {
  name: string;
  tmdbId: number | string | null;
  startTime: string;
  endTime?: string;
  duration: number;
}

export interface CinemaShowing {
  cinema: string;
  location: string; // string (city name) for now can be gps coordinate or both
  showings: FilmShowing[];
}

export type ScraperFunction = () => Promise<CinemaShowing[]>;
