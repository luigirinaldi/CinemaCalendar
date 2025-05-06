// import { Calendar } from '@fullcalendar/core';
import { Calendar, createPlugin } from '@fullcalendar/core';
import timeGridPlugin from '@fullcalendar/timegrid';
import type { CinemaDB, FilmShowingDB } from './types';
import dayGridPlugin from '@fullcalendar/daygrid';
import listPlugin from '@fullcalendar/list';
import './style.css';

import { createDbWorker } from 'sql.js-httpvfs';
import { ViewProps } from '@fullcalendar/core/internal';
import { childNodes } from 'happy-dom/lib/PropertySymbol.js';

document.addEventListener('DOMContentLoaded', main);



function addDropdownLogic(cinemas : CinemaDB[], cityCallback) {
  const cinemasByLocation = cinemas.reduce((acc, cinema) => {
    acc[cinema.location].push(cinema);
    return acc;
  }, Object.fromEntries(cinemas.map(cinema => [cinema.location, [] as CinemaDB[]])) )
  console.log(cinemasByLocation)
  const dropdownDiv = document.getElementById("dropdown-div");
  const dropdownButt = document.getElementById("dropdown-button");
  // Toggle showing when clicked
  dropdownButt?.addEventListener("click", function () {
      dropdownDiv?.classList.toggle("show");
  });
  
  Object.entries(cinemasByLocation).forEach(([location, cinemas]) => {
    const element = document.createElement('a');
    element.textContent = `${location} (${cinemas.length} cinemas)`;
    
    dropdownDiv?.insertAdjacentElement('beforeend', element)
    element.addEventListener('click', () => {
      dropdownButt!.textContent = location;
      cityCallback(location, cinemas);
      // un toggle showing after the city is clicked
      dropdownDiv?.classList.toggle("show");
    });
  })
  // // untoggle when the dropdown button loses focus (blur)
  document.addEventListener('click', (event) => {
    if (
      !dropdownDiv?.contains(event.target as Node) &&
      !dropdownButt?.contains(event.target as Node)
    ) {
      dropdownDiv?.classList.remove('show');
    }
  });
}

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

// Function to setup the sql workers and instantiate everything
async function connect_sql() {
  // sadly there's no good way to package workers and wasm directly so you need a way to get these two URLs from your bundler.
  // This is the webpack5 way to create a asset bundle of the worker and wasm:
  const workerUrl = new URL(
    'sql.js-httpvfs/dist/sqlite.worker.js',
    import.meta.url
  );
  const wasmUrl = new URL('sql.js-httpvfs/dist/sql-wasm.wasm', import.meta.url);

  let maxBytesToRead = 10 * 1024 * 1024;
  const worker = await createDbWorker(
    // the config is either the url to the create_db script, or a inline configuration:
    [
      {
        from: 'inline',
        config: {
          serverMode: 'full', // file is just a plain old full sqlite database
          requestChunkSize: 4096, // the page size of the  sqlite database (by default 4096)
          url: import.meta.env.BASE_URL + 'data/my.db', // url to the database (relative or full)
        },
      },
    ],
    workerUrl.toString(),
    wasmUrl.toString(),
    maxBytesToRead // optional, defaults to Infinity
  );
  // worker.db is a now SQL.js instance except that all functions return Promises.
  return worker;
}

type CinemaCheckboxState = {
  checked: boolean;
  colour: string;
};

async function main() {
    
  const sqlWorker = await connect_sql();
  
  const cinemaData = (await sqlWorker.db.query(
      'select id, name, location from cinemas'
  )) as CinemaDB[];
  
  // Add the logic for the dropdown list

  console.log(cinemaData, Object.keys(cinemaData).length);
    
  // make the global, mutable checkbox state variable
  let cinemaCheckBoxes: Record<string, CinemaCheckboxState> = {};

  addDropdownLogic(cinemaData, ((location, cinemas: CinemaDB[]) => {
    const cinemaSelector = document.getElementById('button-container');
    console.log(cinemaSelector?.childNodes)
    cinemaCheckBoxes = {};
    // this is for clearing the previous elements
    cinemaSelector?.replaceChildren();

    cinemas.forEach((cinema, i) => { 
      // get a unique colour for each cinema
      const colour = getColourFromHashAndN(i, Object.keys(cinemaData).length);
      console.log(cinema, colour, i);
      // create the html for the cinema checkbox
      const { label, checkbox } = cinemaCheckboxTemplate(cinema.name, colour);
      cinemaSelector?.insertAdjacentElement('beforeend', label);
  
      cinemaCheckBoxes[cinema.id] = {
        checked: true,
        colour: colour,
      };
  
      // modify the checkbox state when the checkbox state changes
      checkbox.addEventListener('change', (_event) => {
        cinemaCheckBoxes[cinema.id].checked = checkbox.checked;
        // call the refetch so that the event are updated to exclude/include the correct cinemas
        calendar.refetchEvents(); // (not sure how calendar can be referenced here since it hasn't been defined yet but ok)
      });
    });
    // refresh the calendar when a new city is selected
    calendar.refetchEvents();
  }));


  const CustomViewConfig = {
    content: (arg: ViewProps) => {
      // console.log(arg);
      const container = document.createElement('div');
      container.innerText = 'Loading...';

      const checkedCinemas = Object.entries(cinemaCheckBoxes)
        .filter(([_, { checked }]) => checked) // Keep only checked cinemas
        .map(([id]) => id);
      (
        sqlWorker.db.query(
          `
          select title, name as cinema_name, duration_minutes as duration, start_time, end_time, cinema_id, url
          from film_showings 
          join films on film_showings.film_id = films.id 
          join cinemas on film_showings.cinema_id = cinemas.id
          where start_time between ? and ? and cinema_id in (${checkedCinemas.map(() => '?').join(',')})
          order by start_time;`,
          [
            arg.dateProfile.currentRange.start.toISOString(),
            arg.dateProfile.currentRange.end.toISOString(),
            ...checkedCinemas,
          ]
        ) as Promise<FilmShowingDB[]>
      ).then((data) => {
        const grouped_data = data.reduce(
          (acc, row) => {
            acc[row.title] = acc[row.title] ? [...acc[row.title], row] : [row];
            return acc;
          },
          {} as Record<string, FilmShowingDB[]>
        );
        console.log(data);
        console.log(grouped_data);
        container.innerHTML = `<ul>${Object.entries(grouped_data)
          .map(
            ([title, filminfo]) =>`<li>
              <h3>${title}</h3>
              <div style="display: flex; flex-direction: row; gap: 10px; justify-content: flex-start; flex-wrap: wrap; ">
                  ${filminfo
                    .map(
                      (film) => 
                      {
                      const datetime = new Date(film.start_time);
                      const pad = (n : number) => String(n).padStart(2,'0');
                      return `
                          ${film.url === null ? '<div' : '<a'} href="${film.url}" style="border: 3px solid ${cinemaCheckBoxes[film.cinema_id].colour};border-radius: 10px;padding: 5px;">
                          <div style="font-size: 0.7em;">${film.cinema_name}</div>
                          <span>
                          <!-- ${pad(datetime.getDate())}/${pad(datetime.getMonth())} -->
                          ${pad(datetime.getHours())}:${pad(datetime.getMinutes())}
                          </span>
                          </${film.url === null ? 'div' : 'a'}>`
                          }
                    )
                    .join('')}
                    </div>
                    </li>`
                  )
          .join('')}</ul>`;
      });

      return { domNodes: [container] };
    },
  };

  const CustomViewPlugin = createPlugin({
    name: 'Movie',
    views: {
      movie: CustomViewConfig,
    },
  });

  let calendarEl: HTMLElement = document.getElementById('calendar')!;
  let calendar = new Calendar(calendarEl, {
    plugins: [timeGridPlugin, dayGridPlugin, listPlugin, CustomViewPlugin],
    initialView: 'movie',
    headerToolbar: {
      left: 'prev,today,next',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek,timeGridDay,listMonth movie',
    },
    buttonText: {
      today: 'Today',
      month: 'M',
      week: 'W',
      day: 'D',
      list: 'L',
      movie: 'Films'
    },
    displayEventEnd: true,
    displayEventTime: true,
    eventOverlap: true,
    eventDisplay: 'block',
    height: 'parent',
    events: async function (info, successCallback, failureCallback) {
      try {
        const checkedCinemas = Object.entries(cinemaCheckBoxes)
          .filter(([_, { checked }]) => checked) // Keep only checked cinemas
          .map(([id]) => id);
        // make a query to get the relevant film showings,
        // the dodgy stuff for the cinema id is there to pick out the cinemas which have checked boxes,
        // the dodginess comes from the fact that sqlite (?) doesn't have native array bindings (GPT's word so idk)
        const films = (await sqlWorker.db.query(
          `
          select title, name as cinema_name, duration_minutes as duration, start_time, end_time, cinema_id 
          from film_showings 
          join films on film_showings.film_id = films.id 
          join cinemas on film_showings.cinema_id = cinemas.id
          where start_time between ? and ? and cinema_id in (${checkedCinemas.map(() => '?').join(',')})`,
          [info.startStr, info.endStr, ...checkedCinemas]
        )) as FilmShowingDB[];
        successCallback(
          films.map((movie) => {
            let endDateString: string | undefined = movie.end_time;
            if (!endDateString) {
              const endDate = new Date(movie.start_time);
              endDate.setUTCMinutes(endDate.getUTCMinutes() + movie.duration);
              endDateString = endDate.toISOString();
            }
            return {
              title: `${movie.title} @ ${movie.cinema_name}`,
              start: movie.start_time,
              end: endDateString,
              color: cinemaCheckBoxes[movie.cinema_id].colour,
            };
          })
        );
      } catch (error) {
        let typed_e = error as Error;
        console.log('Something went wrong fetching events', error);
        failureCallback(typed_e);
      }
    },
  });
  calendar.render();
}
