import type { CinemaShowing } from '../types';

export async function scraper(): Promise<CinemaShowing[]> {
    const response = await fetch(
        `https://www.cinemarex.it/pages/rexJsonCompact.php`
    );

    if (response.status !== 200) {
        console.warn(
            'The request to rexcinema API gave response code: ',
            response.status
        );
        return []; // This returns an empty list of movies so the getData script won't be stopped in case of an error
    }
    const data = await response.json();

    return [
        {
            cinema: 'RexCinema',
            location: 'Padova',
            showings: data.titoli.flatMap((film: { eventi: any[]; titolo: any; durata: string | number; }) =>
                film.eventi.map((show: { id_cinebot: any; inizio: string | number | Date; }) => ({
                    name: film.titolo,
                    localId: show.id_cinebot,
                    startTime: new Date(show.inizio).toISOString(),
                    duration: +film.durata, // the '+' converts the string to number
                }))
            ),
        },
    ];
}
