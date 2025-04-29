import { Calendar } from '@fullcalendar/core';
import timeGridPlugin from '@fullcalendar/timegrid';
import type { FilmShowing } from './types';
import dayGridPlugin from '@fullcalendar/daygrid';
import listPlugin from '@fullcalendar/list';
import './style.css';

const DATA_PATH = import.meta.env.BASE_URL + '/data';

function getColorFromHashAndN(index: number, n: number): string {
  // The hue value will be between 0 and 360 (the color wheel)
  const hueStep = 360 / n;  // Step size to equally space out n colors
  const hue = (index * hueStep) % 360;  // Ensure hue wraps around the color wheel
  
  // Use the HSL format to directly create the color
  return `hsl(${hue}, 100%, 50%)`;  // Saturation 100% and Lightness 50% for vivid colors
}

export async function loadCinemaShowings(): Promise<
  Record<string, FilmShowing[]>
> {
  const result: Record<string, FilmShowing[]> = {};

  // disgusting
  const files: string[] = (await (
    await fetch(DATA_PATH + '/cinemas.json')
  ).json()) as string[];

  console.log('available cinemas:', files);

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

  console.log(cinemaData, Object.keys(cinemaData).length);

  let events = [];
  Object.keys(cinemaData).forEach((cinema, i) => {
    const color = getColorFromHashAndN(i, Object.keys(cinemaData).length);
    console.log(cinema, color, i);
    for (let [_mv, movie] of Object.entries(cinemaData[cinema])) {
      let endDateString: string | undefined = movie.endTime;
      if (!endDateString) {
        const endDate = new Date(movie.startTime);
        endDate.setUTCMinutes(endDate.getUTCMinutes() + movie.duration);
        endDateString = endDate.toISOString();
      }
      events.push({
        title: `${movie.name} @ ${cinema}`,
        start: movie.startTime,
        end: endDateString,
        color: color,
      });
    }
  })

  console.log(events);

  let calendarEl: HTMLElement = document.getElementById('calendar')!;
  let calendar = new Calendar(calendarEl, {
    plugins: [timeGridPlugin, dayGridPlugin, listPlugin],
    initialView: 'timeGridDay',
    headerToolbar: {
      left: 'prev,next',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek,timeGridDay,listMonth',
    },
    displayEventEnd: true,
    displayEventTime: true,
    eventOverlap: true,
    eventDisplay: 'block',
    events: events,
    height: 'parent'
  });
  calendar.render();
});
