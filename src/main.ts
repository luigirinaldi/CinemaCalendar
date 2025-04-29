import { Calendar } from '@fullcalendar/core';
import timeGridPlugin from '@fullcalendar/timegrid';
import type { FilmShowing } from './types';
import dayGridPlugin from '@fullcalendar/daygrid';
import listPlugin from '@fullcalendar/list';
import './style.css';

const DATA_PATH = import.meta.env.BASE_URL + '/data';

function getColourFromHashAndN(index: number, n: number): string {
  // The hue value will be between 0 and 360 (the colour wheel)
  const hueStep = 360 / n;  // Step size to equally space out n colours
  const hue = (index * hueStep) % 360;  // Ensure hue wraps around the colour wheel
  
  // Use the HSL format to directly create the colour
  return `hsl(${hue}, 100%, 50%)`;  // Saturation 100% and Lightness 50% for vivid colours
}

function cinemaCheckboxTemplate(cinemaName : string, colour: string) {
  const checkbox = document.createElement("label");
  checkbox.insertAdjacentHTML("afterbegin",`<input type="checkbox" checked="checked" style="accent-color: ${colour};">
      <span class="checkmark">${cinemaName}</span>`)
  return checkbox
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
  const cinemaData = await Promise.resolve(loadCinemaShowings());

  console.log(cinemaData, Object.keys(cinemaData).length);

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
    // events: events,
    height: 'parent'
  });
  calendar.render();

  Object.keys(cinemaData).forEach((cinema, i) => {
    const colour = getColourFromHashAndN(i, Object.keys(cinemaData).length);
    console.log(cinema, colour, i);

    
    const events = Object.entries(cinemaData[cinema]).map(([cinema, movie]) => {
      let endDateString: string | undefined = movie.endTime;
      if (!endDateString) {
        const endDate = new Date(movie.startTime);
        endDate.setUTCMinutes(endDate.getUTCMinutes() + movie.duration);
        endDateString = endDate.toISOString();
      }
      return {
        title: `${movie.name} @ ${cinema}`,
        start: movie.startTime,
        end: endDateString,
        color: colour,
      };
    })
    console.log(events);
    
    let cinemaEventSource = calendar.addEventSource(events);
    
    const cinemaCheckbox = cinemaCheckboxTemplate(cinema, colour);
    document.getElementById('button-container')?.insertAdjacentElement("beforeend", cinemaCheckbox);

    cinemaCheckbox.addEventListener('change', (_event) => {
      if (cinemaCheckbox.firstChild.checked) {
          cinemaEventSource = calendar.addEventSource(events);
        } else {
          cinemaEventSource.remove();
      }
  });
  })



});
