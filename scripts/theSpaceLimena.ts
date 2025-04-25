import fs from 'fs';
import type { FilmShowing } from '../src/types';

async function getMovieInfo(cinema:number = 1012) : Promise<Array<FilmShowing>> {
  // TODO - extend to every the space cinema
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.goto('https://www.thespacecinema.it/cinema/limena/al-cinema', { waitUntil: 'networkidle0' });

  const cookies = await page.cookies();
  const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

  const res = await fetch('https://www.thespacecinema.it/api/microservice/showings/cinemas/1012/films', {
    headers: {
      'cookie': cookieHeader,
      'user-agent': 'Mozilla/5.0',
      'accept': 'application/json'
    }
  });

  await browser.close();

  console.log(res.status);
  const data = await res.json();
  
  return data.result.flatMap(film => film.showingGroups.flatMap(day => day.sessions.map(show => ({
    name: film.filmTitle,
    tmdbId: film.filmId,
    startTime: show.startTime,
    duration: show.duration
  }))));
}

export async function fetchUpcomingCalendar2() {
  let movies = await getMovieInfo();
  console.log(movies);

  fs.writeFile(
    './public/data/theSpaceLimena.json',
    JSON.stringify(movies),
    (err) => {
      if (err) {
        console.error('Error writing file: ', err);
        return;
      }
      console.log('JSON data has been successfully dumped to theSpace.json');
    }
  );
}
