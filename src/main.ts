import { Calendar } from '@fullcalendar/core';
import timeGridPlugin from '@fullcalendar/timegrid';
import type { CinemaDB, FilmShowing, FilmShowingDB } from './types';
import dayGridPlugin from '@fullcalendar/daygrid';
import listPlugin from '@fullcalendar/list';
import './style.css';


import { createDbWorker, WorkerHttpvfs } from "sql.js-httpvfs"
import { fail } from 'assert';

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

document.addEventListener('DOMContentLoaded', main);



// Function to setup the sql workers and instantiate everything
async function connect_sql() {
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
  return worker
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

type CinemaCheckboxState = {
  checked: boolean;
  colour: string;
};

async function main() {
  const sqlWorker = await connect_sql();
  
  const cinemaData = await sqlWorker.db.query('select id, name, location from cinemas') as CinemaDB[];

  console.log(cinemaData, Object.keys(cinemaData).length);
  
  // make the global, mutable checkbox state variable
  let cinemaCheckBoxes: Record<string, CinemaCheckboxState> = {};
  
  cinemaData.forEach((cinema, i) => {
    // get a unique colour for each cinema
    const colour = getColourFromHashAndN(i, Object.keys(cinemaData).length);
    console.log(cinema, colour, i);
    // create the html for the cinema checkbox
    const { label, checkbox } = cinemaCheckboxTemplate(cinema.name, colour);
    document
      .getElementById('button-container')
      ?.insertAdjacentElement('beforeend', label);

    cinemaCheckBoxes[cinema.id]  = {
      checked: true,
      colour: colour
    }

    // modify the checkbox state when the checkbox state changes
    checkbox.addEventListener('change', (_event) => {
      cinemaCheckBoxes[cinema.id].checked = checkbox.checked;
      // call the refetch so that the event are updated to exclude/include the correct cinemas
      calendar.refetchEvents() // (not sure how calendar can be referenced here since it hasn't been defined yet but ok)
    });
  })

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
    height: 'parent',
    events: async function (info, successCallback, failureCallback) {
      console.log(info, cinemaCheckBoxes)
      try {
        const films = await sqlWorker.db.query('select title, name as cinema_name, duration_minutes as duration, start_time, end_time, cinema_id from film_showings join films on film_showings.film_id = films.id join cinemas on film_showings.cinema_id = cinemas.id where start_time between ? and ?', [info.startStr, info.endStr]) as FilmShowingDB[];
        console.log(films)
        successCallback(films.map(movie => {
          let endDateString: string | undefined = movie.end_time;
          if (!endDateString) {
            const endDate = new Date(movie.start_time);
            endDate.setUTCMinutes(endDate.getUTCMinutes() + movie.duration);
            endDateString = endDate.toISOString();
          }
          return  {
            title:  `${movie.title} @ ${movie.cinema_name}`,
            start: movie.start_time,
            end: endDateString,
            color: cinemaCheckBoxes[movie.cinema_id].colour
          }
        }))
      }
      catch(error) {
        console.log("Something went wrong fetching events", error)
        failureCallback(error);
      }
    }
  });
  calendar.render();

  // Object.keys(cinemaData).forEach((cinema, i) => {
  //   const colour = getColourFromHashAndN(i, Object.keys(cinemaData).length);
  //   console.log(cinema, colour, i);

  //   const events = Object.entries(cinemaData[cinema]).map(([_, movie]) => {
  //     let endDateString: string | undefined = movie.endTime;
  //     if (!endDateString) {
  //       const endDate = new Date(movie.startTime);
  //       endDate.setUTCMinutes(endDate.getUTCMinutes() + movie.duration);
  //       endDateString = endDate.toISOString();
  //     }
  //     return {
  //       title: `${movie.name} @ ${cinema}`,
  //       start: movie.startTime,
  //       end: endDateString,
  //       color: colour,
  //     };
  //   });
  //   console.log(events);

  //   let cinemaEventSource = calendar.addEventSource(events);

  //   const { label, checkbox } = cinemaCheckboxTemplate(cinema, colour);
  //   document
  //     .getElementById('button-container')
  //     ?.insertAdjacentElement('beforeend', label);

  //   checkbox.addEventListener('change', (_event) => {
  //     if (checkbox.checked) {
  //       cinemaEventSource = calendar.addEventSource(events);
  //     } else {
  //       cinemaEventSource.remove();
  //     }
  //   });
  // });
}