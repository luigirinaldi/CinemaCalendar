import { z } from 'zod';

export const FilmSchema = z.object({
    title: z.string(),
    url: z.string(),
    director: z.string().optional(),
    duration: z.number().optional(),
    language: z.string().optional(),
    year: z.number().optional(),
    country: z.string().optional(),
    coverUrl: z.string().optional(),
});

export const ShowingSchema = z.object({
    startTime: z.string(),
    bookingUrl: z.string().optional(),
    theatre: z.string().optional(),
});

export const FilmShowingsSchema = z.object({
    film: FilmSchema,
    showings: z.array(ShowingSchema),
});

export const CinemaSchema = z.object({
    name: z.string(),
    location: z.string(),
    coordinates: z.object({ lat: z.string(), lng: z.string() }).optional(),
    defaultLanguage: z
        .string()
        .regex(
            /^[a-z]{2}(-[A-Z]{2})?$/,
            "Invalid TMDB language code (use something like 'en' or 'en-US')"
        ),
});

export const CinemaShowingSchema = z.object({
    cinema: CinemaSchema,
    showings: z.array(FilmShowingsSchema),
});

export const CinemaShowingsSchema = z.array(CinemaShowingSchema);

export type Film = z.infer<typeof FilmSchema>;
export type Showing = z.infer<typeof ShowingSchema>;
export type FilmShowings = z.infer<typeof FilmShowingsSchema>;
export type Cinema = z.infer<typeof CinemaSchema>;
export type CinemaShowing = z.infer<typeof CinemaShowingSchema>;
export type CinemaShowings = z.infer<typeof CinemaShowingsSchema>;

// Type of the scraper function
// Each scraper may scrape multiple cinemas,
// each containing a cinema and the showings for that cinema
export type ScraperFunction = () => Promise<CinemaShowings>;
