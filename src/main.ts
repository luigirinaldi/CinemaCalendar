import { Calendar } from '@fullcalendar/core';
import timeGridPlugin from '@fullcalendar/timegrid';
import type { FilmShowing } from './types';

const DATA_PATH = import.meta.env.BASE_URL + '/data';

export async function loadCinemaShowings(): Promise<
  Record<string, FilmShowing[]>
> {
  const result: Record<string, FilmShowing[]> = {};

  // disgusting
  const files: string[] = (
    await (await fetch(DATA_PATH + '/cinemas.json')).json()
  )['cinemas'] as string[];

  console.log(files);

  for (let [_, file] of Object.entries(files)) {
    const movieData = await fetch(`${DATA_PATH}/${file}.json`);
    try {
      result[file] = (await movieData.json()) as FilmShowing[];
    } catch (e) {
      console.warn(`Failed to parse JSON in file: ${file}`, e);
    }
  }

  return result;
}

document.addEventListener('DOMContentLoaded', async function () {
  console.log('Hello World!');

  let cinemaData = await Promise.resolve(loadCinemaShowings());

  console.log(cinemaData);

  let events = [];
  for (let cinema in cinemaData) {
    console.log(cinema);
    for (let [_mv, movie] of Object.entries(cinemaData[cinema])) {
      let endDateString:string|undefined = movie.endTime;
      if (!endDateString) {
        const endDate = new Date(movie.startTime);
        endDate.setUTCMinutes(endDate.getUTCMinutes() + movie.duration);
        endDateString = endDate.toISOString();
      }
      events.push({
        title: `${movie.name} @ ${cinema}`,
        start: movie.startTime,
        end: endDateString,
      });
    }
  }

  console.log(events);

  let calendarEl: HTMLElement = document.getElementById('calendar')!;
  let calendar = new Calendar(calendarEl, {
    plugins: [timeGridPlugin],
    initialView: 'timeGridWeek',
    headerToolbar: {
      left: 'prev,next',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek,timeGridDay', // user can switch between the two
    },
    displayEventEnd: true,
    displayEventTime: true,
    eventOverlap: true,
    eventDisplay: 'block',
    events: events,
  });
  calendar.render();
});
