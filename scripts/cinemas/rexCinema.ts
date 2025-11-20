import type { CinemaShowing, FilmShowings, Cinema } from '../types';

interface RexApiEvent {
    id_orario_evento: string; // number in string
    inizio: number; // epoch time (in milliseconds)
    id_cinebot: string; // number in string
    locandina_special: string; // could be ""
    tipo_prezzo_1: string; // "" or non empty string
    valore_prezzo_1: string; // "0" or positive number in string
    valore_prevendita_1: string; // "0" or positive number in string
    tipo_prezzo_2: string; // "" or non empty string
    valore_prezzo_2: string; // "0" or positive number in string
    valore_prevendita_2: string; // "0" or positive number in string
    tipo_prezzo_3: string; // "" or non empty string
    valore_prezzo_3: string; // "0" or positive number in string
    valore_prevendita_3: string; // "0" or positive number in string
    tipo_prezzo_4: string; // "" or non empty string
    valore_prezzo_4: string; // "0" or positive number in string
    valore_prevendita_4: string; // "0" or positive number in string
    tipo_prezzo_5: string; // "" or non empty string
    valore_prezzo_5: string; // "0" or positive number in string
    valore_prevendita_5: string; // "0" or positive number in string
    fl_film_vos: string; // "y"/"n"
    cast: string; // "y"/"n"
}

interface RexApiFilm {
    titolo: string;
    autore: string; // usually the director, could be "??????? ????????" if unknown, or ""
    durata: string; // number of minutes, inside a string
    descrizione?: string;
    locandina?: string; // base64 (if this string is XXXXX, the image is accessible for ex. through "data:image/jpeg;base64,XXXXX")
    // of the next 4 attributes, only one should be "y", and "n" the others (not verified)
    categoria_film: string; // "y"/"n"
    categoria_teatro: string; // "y"/"n"
    categoria_musica: string; // "y"/"n"
    categoria_teatroragazzi: string; // "y"/"n"
    categoria_kids: string; // could be ""
    categoria_vos: string; // could be ""
    categoria_cineforum: string; // could be ""
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
                            event.fl_film_vos === 'y' ? 'Original Version' : 'Italian',
                        ...(film.autore && { director: film.autore }),
                        ...(film.locandina && { coverUrl: 'data:image/jpeg;base64,' + film.locandina }),
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
