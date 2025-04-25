import fs from 'fs';
import type { FilmShowing } from '../src/types';

async function getMovieInfo(cinema:number = 1012) : Promise<Array<FilmShowing>> {
  // TODO - extend to every the space cinema
  // get a microservicesToken from the main page
  let response = await fetch('https://www.thespacecinema.it');
  const regex:RegExpMatchArray|undefined|null = response.headers.get('set-cookie')?.match(/(?<=microservicesToken\=)[^;]+/);
  const microservicesToken:string = regex ? regex[0] : '';

  response = await fetch(`https://www.thespacecinema.it/api/microservice/showings/cinemas/${cinema}/films`, {
    headers: {
      'Authorization': 'Bearer ' + microservicesToken,
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'application/json'
    }
  });

  console.log("The request to thespacecinema API gave response code: ", response.status);
  if (response.status !== 200) {
    return []; // This returns an empty list of movies so the getData script won't be stopped in case of an error
  }
  const data = await response.json();
  
  return data.result.flatMap(film => film.showingGroups.flatMap(day => day.sessions.map(show => ({
    name: film.filmTitle,
    tmdbId: film.filmId,
    startTime: show.startTime,
    endTime: show.endTime,
    duration: film.runningTime
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
