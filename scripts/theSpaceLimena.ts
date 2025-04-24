import fs from 'fs';
import type { FilmShowing } from '../src/types';

async function getMovieInfo(cinema:number = 1012) : Promise<Array<FilmShowing>> {
  const theSpaceResponse = await fetch("https://www.thespacecinema.it"); //https://www.thespacecinema.it/cinema/limena/al-cinema
  const response = await fetch(
    `https://www.thespacecinema.it/api/microservice/showings/cinemas/${cinema}/films`
  );
  
  /*
  fetch("https://www.thespacecinema.it/api/microservice/showings/films", {
    "headers": {
      "accept": "application/json",
      "accept-language": "en-US,en;q=0.9,it;q=0.8",
      "content-type": "application/json",
      "if-modified-since": "Thu, 24 Apr 2025 19:13:56 GMT",
      "priority": "u=1, i",
      "sec-ch-ua": "\"Google Chrome\";v=\"135\", \"Not-A.Brand\";v=\"8\", \"Chromium\";v=\"135\"",
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": "\"Windows\"",
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "cookie": "_cfuvid=mv2NddZ8zaAOlOjA1kGQ_WXT2Kzw5mPZo40DpFY3VqQ-1745518366623-0.0.1.1-604800000; __cflb=02DiuE2nAGMFu3TxDimEkxSkFKsPnnKB5yKXjMwYaWWGL; microservicesToken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIyMmM3NDFiNS1mN2YzLTQxOTUtOTdjNi01MmY0M2VhYjQwNzgiLCJDb3VudHJ5IjoiSVQiLCJBdXRoIjoiMyIsIlNob3dpbmciOiIzIiwiQm9va2luZyI6IjMiLCJQYXltZW50IjoiMyIsIlBhcnRuZXIiOiIwIiwiTG95YWx0eSI6IjMiLCJDYW1wYWlnblRyYWNraW5nQ29kZSI6IiIsIkNsaWVudE5hbWUiOiIiLCJuYmYiOjE3NDU1MjA3NzMsImV4cCI6MTc0NTU2Mzk3MywiaXNzIjoiUHJvZCJ9.ook-FEUCtoRammAGFzPDDsTSatpjO-5yWJhGHdSlWjE; microservicesRefreshToken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIyMmM3NDFiNS1mN2YzLTQxOTUtOTdjNi01MmY0M2VhYjQwNzgiLCJDb3VudHJ5IjoiSVQiLCJJc0Fub255bW91cyI6IlRydWUiLCJuYmYiOjE3NDU1MjA3NzMsImV4cCI6MTc0NTYwNDc3MywiaXNzIjoiQXV0aFByb2QifQ.SUUDjxY7t8NB7OlZeFqry_xBvIiqcibW-C5FFWl3n3M; accessTokenExpirationTime=2025-04-25T06%3A52%3A53Z; refreshTokenExpirationTime=2025-04-25T18%3A12%3A53Z; vuecinemas-it#lang=it-IT; ASP.NET_SessionId=p3ptbvalcg1xzd5ck0uyqtye; SC_ANALYTICS_GLOBAL_COOKIE=09acc03551644fa7a5dec673e329aa9f|False; hasLayout=true; cinemaId=1012; cinemaName=limena; analyticsCinemaName=Limena; cinemaCurrency=EUR; isSecondaryMarket=false; at_check=true; OptanonConsent=isGpcEnabled=0&datestamp=Thu+Apr+24+2025+21%3A31%3A51+GMT%2B0200+(Ora+legale+dell%E2%80%99Europa+centrale)&version=6.30.0&isIABGlobal=false&hosts=&genVendors=&consentId=8d44e200-fe55-4a4b-af18-377726d8dd16&interactionCount=1&landingPath=https%3A%2F%2Fwww.thespacecinema.it%2Fcinema%2Flimena%2Fal-cinema&groups=C0001%3A1%2CC0002%3A0%2CC0003%3A0%2CC0004%3A0%2CC0005%3A0",
      "Referer": "https://www.thespacecinema.it/cinema/limena/al-cinema",
      "Referrer-Policy": "strict-origin-when-cross-origin"
    },
    "body": null,
    "method": "GET"
  });
  */

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
