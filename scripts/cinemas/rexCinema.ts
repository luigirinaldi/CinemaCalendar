import type { CinemaShowing, FilmShowings, Cinema } from '../types';

interface RexApiEvent {
    id_cinebot: string;
    inizio: string;
    vos: string;
    prezzo?: string;
}

interface RexApiFilm {
    titolo: string;
    durata: string;
    autore?: string;
    eventi: RexApiEvent[];
}

interface RexApiResponse {
    titoli: RexApiFilm[];
}

const CINEMA: Cinema = {
    name: 'Rex Cinema',
    location: 'Padova',
};

const LOG_PREFIX = '[' + CINEMA.name + ']';
const BASE_URL = 'https://www.cinemarex.it';

export async function scraper(): Promise<CinemaShowing[]> {
    const response = await fetch(`${BASE_URL}/pages/rexJsonCompact.php`);

    if (response.status !== 200) {
        console.warn(
            `${LOG_PREFIX} The request to rexcinema API gave response code: `,
            response.status
        );
        return []; // Return empty list on error to avoid stopping the getData script
    }

    const data = (await response.json()) as RexApiResponse;

    // Transform data into the new format, grouping by film
    const filmMap = new Map<string, FilmShowings>();

    data.titoli.forEach((film) => {
        film.eventi.forEach((event) => {
            const filmKey = `${film.titolo}_${event.id_cinebot}`;

            if (!filmMap.has(filmKey)) {
                // Initialize new film entry
                filmMap.set(filmKey, {
                    film: {
                        title: film.titolo,
                        url: `${BASE_URL}/scheda.php?id=${event.id_cinebot}`,
                        duration: +film.durata,
                        language:
                            event.vos === '1' ? 'Original Version' : 'Italian',
                        ...(film.autore && { director: film.autore }),
                    },
                    showings: [],
                });
            }

            // Add showing to existing film entry
            const filmEntry = filmMap.get(filmKey)!;
            filmEntry.showings.push({
                startTime: new Date(event.inizio).toISOString(),
                bookingUrl: `${BASE_URL}/acquista.php?id=${event.id_cinebot}`,
            });
        });
    });

    return [
        {
            cinema: CINEMA,
            showings: Array.from(filmMap.values()),
        },
    ];
}
