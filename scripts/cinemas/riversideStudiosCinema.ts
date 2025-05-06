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

  const movie_info_out: FilmShowing[] = result
    .filter((event) => event.event_type && event.event_type.includes('101'))
    .flatMap((event) => {
      let duration = +event['run_time'].match(/(\d+) mins/)[1];
      return Object.entries(event['performances']).flatMap(
        ([_dayTimestamp, performances]) => {
          return performances.flatMap((perf) => {
            return {
              name: event['title'].trim(),
              startTime: DateTime.fromSeconds(+perf['timestamp']).toISO(),
              duration: duration,
              url: event['url'],
            } as FilmShowing;
          });
        }
      );
    });
  return [
    {
      cinema: 'RiverSideStudios',
      location: 'London',
      showings: movie_info_out,
    },
  ];
}

scraper();
