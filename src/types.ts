export interface FilmShowing {
    name: string;
    tmbdId: number | string | null;
    startTime: string;
    endTime?: string;
    duration: number;
}
  