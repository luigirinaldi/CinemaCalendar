export interface FilmShowing {
  name: string;
  tmdbId: number | string | null;
  startTime: string;
  endTime?: string;
  duration: number;
  url?:string;
}

export interface CinemaShowing {
  cinema: string;
  location: string; // string (city name) for now can be gps coordinate or both
  showings: FilmShowing[];
}

// represents the schema in the sqlite, should be generated automatically
export interface CinemaDB {
  id: number;
  name: string;
  location: string;
}

export interface FilmShowingDB {
  title: string;
  start_time: string;
  end_time?: string;
  duration: number;
  cinema_name: string;
  cinema_id: number;
  url?: string;
}

export type ScraperFunction = () => Promise<CinemaShowing[]>;
