import { Calendar } from '@fullcalendar/core';
import timeGridPlugin from '@fullcalendar/timegrid';
import type { FilmShowing } from './types';
import dayGridPlugin from '@fullcalendar/daygrid';
import listPlugin from '@fullcalendar/list';
import './style.css';


import { createDbWorker } from "sql.js-httpvfs"

const DATA_PATH = import.meta.env.BASE_URL + '/data';

function getColourFromHashAndN(index: number, n: number): string {
  // The hue value will be between 0 and 360 (the colour wheel)
  const hueStep = 360 / n; // Step size to equally space out n colours
  const hue = (index * hueStep) % 360; // Ensure hue wraps around the colour wheel

  // Use the HSL format to directly create the colour
  return `hsl(${hue}, 100%, 50%)`; // Saturation 100% and Lightness 50% for vivid colours
}

function cinemaCheckboxTemplate(cinemaName: string, colour: string) {
  const label = document.createElement('label');

  // Create checkbox input
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = true;
  checkbox.style.accentColor = colour;

  // Create span for the label text
  const span = document.createElement('span');
  span.className = 'checkmark';
  span.textContent = cinemaName;

  // Append checkbox and span to the label
  label.appendChild(checkbox);
  label.appendChild(span);

  return { label, checkbox };
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

document.addEventListener('DOMContentLoaded', sql_test);

async function sql_test() {
  // sadly there's no good way to package workers and wasm directly so you need a way to get these two URLs from your bundler.
  // This is the webpack5 way to create a asset bundle of the worker and wasm:
  const workerUrl = new URL(
    "sql.js-httpvfs/dist/sqlite.worker.js",
    import.meta.url,
  );
  const wasmUrl = new URL(
    "sql.js-httpvfs/dist/sql-wasm.wasm",
    import.meta.url,
  );
  // the legacy webpack4 way is something like `import wasmUrl from "file-loader!sql.js-httpvfs/dist/sql-wasm.wasm"`.

  // the config is either the url to the create_db script, or a inline configuration:
  const config = {
    from: "inline",
    config: {
      serverMode: "full", // file is just a plain old full sqlite database
      requestChunkSize: 4096, // the page size of the  sqlite database (by default 4096)
      url: import.meta.env.BASE_URL + "data/my.db" // url to the database (relative or full)
    }
  };


  let maxBytesToRead = 10 * 1024 * 1024;
  const worker = await createDbWorker(
    [config],
    workerUrl.toString(),
    wasmUrl.toString(),
    maxBytesToRead // optional, defaults to Infinity
  );
  // you can also pass multiple config objects which can then be used as separate database schemas with `ATTACH virtualFilename as schemaname`, where virtualFilename is also set in the config object.


  // worker.db is a now SQL.js instance except that all functions return Promises.
  const result = await worker.db.exec(`select title, name, start_time from film_showings JOIN films ON film_showings.film_id = films.id
JOIN cinemas ON film_showings.cinema_id = cinemas.id`);
  document.body.textContent = JSON.stringify(result);
  // worker.worker.bytesRead is a Promise for the number of bytes read by the worker.
  console.log(await worker.worker.bytesRead);
  // if a request would cause it to exceed maxBytesToRead, that request will throw a SQLite disk I/O error.

  // you can reset bytesRead by assigning to it:
  // worker.worker.bytesRead = 0;
}


async function main() {
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
    height: 'parent',
  });
  calendar.render();

  Object.keys(cinemaData).forEach((cinema, i) => {
    const colour = getColourFromHashAndN(i, Object.keys(cinemaData).length);
    console.log(cinema, colour, i);

    const events = Object.entries(cinemaData[cinema]).map(([_, movie]) => {
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
    });
    console.log(events);

    let cinemaEventSource = calendar.addEventSource(events);

    const { label, checkbox } = cinemaCheckboxTemplate(cinema, colour);
    document
      .getElementById('button-container')
      ?.insertAdjacentElement('beforeend', label);

    checkbox.addEventListener('change', (_event) => {
      if (checkbox.checked) {
        cinemaEventSource = calendar.addEventSource(events);
      } else {
        cinemaEventSource.remove();
      }
    });
  });
}