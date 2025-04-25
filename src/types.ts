export interface FilmShowing {
    name: string;
    tmdbId: number | string | null;
    startTime: string;
    endTime?: string;
    duration: number;
}