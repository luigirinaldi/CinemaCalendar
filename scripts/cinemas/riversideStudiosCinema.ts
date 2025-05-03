import { CinemaShowing, FilmShowing } from '../../src/types';
import { DateTime } from 'luxon';

export async function scraper(): Promise<CinemaShowing[]> {
  let response = await fetch(
    'https://riversidestudios.co.uk/ajax/filter_stream/2/88/?offset=0&limit=500&q=',
    {
      method: 'GET',
    }
  );

  const result = await response.json();

  let films = 0;
  const movie_info_out: FilmShowing[] = result
    .filter((event) => event.event_type && event.event_type.includes('101'))
    .flatMap((event) => {
      films += 1;
      return Object.entries(event['performances']).map(([k, v]) => {
        let duration = +event['run_time'].match(/(\d+) mins/)[1];
        return {
          name: event['title'],
          startTime: DateTime.fromSeconds(+v[0]['timestamp']).toISO(),
          duration: duration,
          url: event['url'],
        } as FilmShowing;
      });
    });

  return [
    {
      cinema: 'RiverSideStudios',
      location: 'London',
      showings: movie_info_out,
    },
  ];
}
