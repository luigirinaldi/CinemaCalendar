import type { CinemaShowing } from '../src/types';

export async function scraper(): Promise<CinemaShowing[]> {
  const response = await fetch(
    `https://www.cinemarex.it/pages/rexJsonCompact.php`
  );

  console.log(
    'The request to rexcinema API gave response code: ',
    response.status
  );
  if (response.status !== 200) {
    return []; // This returns an empty list of movies so the getData script won't be stopped in case of an error
  }
  const data = await response.json();

  return [
    {
      cinema: 'RexCinema',
      location: 'Padova',
      showings: data.titoli.flatMap((film) =>
        film.eventi.map((show) => ({
          name: film.titolo,
          tmdbId: show.id_cinebot,
          startTime: show.inizio,
          duration: +film.durata // the '+' converts the string to number
        }))
      ),
    },
  ];
}
