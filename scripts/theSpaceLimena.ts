import fs from 'fs';
import type { FilmShowing } from '../src/types';

async function getMovieInfo(cinema:number = 1012) : Promise<Array<FilmShowing>> {
  // TODO - change cinema in cookies
  const response = await fetch("https://www.thespacecinema.it/api/microservice/showings/cinemas/1012/films", {
    "headers": {
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "accept-language": "en-US,en;q=0.9,it;q=0.8",
      "cache-control": "no-cache",
      "pragma": "no-cache",
      "priority": "u=0, i",
      "sec-ch-ua": "\"Google Chrome\";v=\"135\", \"Not-A.Brand\";v=\"8\", \"Chromium\";v=\"135\"",
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": "\"Windows\"",
      "sec-fetch-dest": "document",
      "sec-fetch-mode": "navigate",
      "sec-fetch-site": "cross-site",
      "sec-fetch-user": "?1",
      "upgrade-insecure-requests": "1",
      "cookie": `__cflb=02DiuE2nAGMFu3TxDimEkxSkFKsPnnKB5yKXjMwYaWWGL; microservicesToken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIyMmM3NDFiNS1mN2YzLTQxOTUtOTdjNi01MmY0M2VhYjQwNzgiLCJDb3VudHJ5IjoiSVQiLCJBdXRoIjoiMyIsIlNob3dpbmciOiIzIiwiQm9va2luZyI6IjMiLCJQYXltZW50IjoiMyIsIlBhcnRuZXIiOiIwIiwiTG95YWx0eSI6IjMiLCJDYW1wYWlnblRyYWNraW5nQ29kZSI6IiIsIkNsaWVudE5hbWUiOiIiLCJuYmYiOjE3NDU1MjA3NzMsImV4cCI6MTc0NTU2Mzk3MywiaXNzIjoiUHJvZCJ9.ook-FEUCtoRammAGFzPDDsTSatpjO-5yWJhGHdSlWjE; microservicesRefreshToken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIyMmM3NDFiNS1mN2YzLTQxOTUtOTdjNi01MmY0M2VhYjQwNzgiLCJDb3VudHJ5IjoiSVQiLCJJc0Fub255bW91cyI6IlRydWUiLCJuYmYiOjE3NDU1MjA3NzMsImV4cCI6MTc0NTYwNDc3MywiaXNzIjoiQXV0aFByb2QifQ.SUUDjxY7t8NB7OlZeFqry_xBvIiqcibW-C5FFWl3n3M; accessTokenExpirationTime=2025-04-25T06%3A52%3A53Z; refreshTokenExpirationTime=2025-04-25T18%3A12%3A53Z; vuecinemas-it#lang=it-IT; ASP.NET_SessionId=p3ptbvalcg1xzd5ck0uyqtye; SC_ANALYTICS_GLOBAL_COOKIE=09acc03551644fa7a5dec673e329aa9f|False; cinemaId=${cinema}; cinemaName=limena; analyticsCinemaName=Limena; cinemaCurrency=EUR; isSecondaryMarket=false; at_check=true; hasLayout=true; _cfuvid=socYSwMh792WiqVFCOkFmcc6ubS5YjC2rE0fE52g26o-1745527619309-0.0.1.1-604800000`
    },
    "referrerPolicy": "strict-origin-when-cross-origin",
    "body": null,
    "method": "GET"
  });
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
