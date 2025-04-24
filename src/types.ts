export interface FilmShowing {
  name: string;
  tmdbId: number | string | null;
  startTime: string;
  duration: number; // Duration in minutes or null if not available
}
