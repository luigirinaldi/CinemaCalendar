import fs from 'fs';
import type { FilmShowing } from '../src/types'

async function getMovieInfo(cinema:number = 1012) : Promise<Array<FilmShowing>> {
  const response = await fetch(
    `https://www.thespacecinema.it/api/microservice/showings/cinemas/${cinema}/films`
  );
  console.log(response.status);
  const filmss = await response.json();

  return filmss.result.flatMap(film => film.showingGroups.flatMap(day => day.sessions.map(show => ({
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