import { CinemaShowing, FilmShowing } from '../../src/types';
import { parse } from "node-html-parser";

// function that performs type restriction, so that the type coming out doesn't have any undefined things
function hasNoUndefined<T extends Record<string, any>>(obj: T): obj is { [K in keyof T]-?: Exclude<T[K], undefined> } {
  return Object.values(obj).every(value => value !== undefined);
}

export async function scraper(): Promise<CinemaShowing[]> {
  let body = {type: "72", period:"any", location:"onsite", "date-display":"", date:""}

  let headers = {}

  let response = await fetch('https://www.institut-francais.org.uk/whats-on/?type=72&period=any&location=onsite', {
    method: 'GET',
  });

  let html = await response.text();
  const root = parse(html);

  // 👇️ const result: CreateUserResponse
  console.log(response);
  console.log(root);

  // Select all article elements with a specific class
  const movies = root.querySelectorAll('article.card--film');

  const movie_info = movies.flatMap(movie => {
    const link = movie.querySelector('a');
    const metadata = movie.querySelector('div.card__information')?.querySelector('div.card__metadata');
    const info =  {
        href: link?.getAttribute('href'),
        title: link?.getAttribute('title'),
        tags: metadata?.querySelector('div.card__terms')?.querySelectorAll('div.tag').map(tag => tag.innerHTML),
        date_range: metadata?.querySelector('div.card__dates')?.innerText.trim()
    }
    if (hasNoUndefined(info)) {
      return [info];
    } else {
      console.warn("Failed to get some information for movie:", info, movie.toString());
      return [];
    }
  });

  console.log(movie_info)
  console.log(movie_info.length);
//   let movie_data: object = result['data']['showingsForDate']['data'];

//   let movie_info_out: Array<FilmShowing> = [];

//   for (let [_key, movie] of Object.entries(movie_data)) {
//     let movie_info: FilmShowing = {
//       name: movie['movie']['name'],
//       tmdbId: movie['movie']['tmdbId'],
//       startTime: movie['time'],
//       duration: movie['movie']['duration'],
//       url: 'https://www.regentstreetcinema.com/checkout/showing/' + movie['id'],
//     };
//     movie_info_out.push(movie_info);
//   }
//   return [
//     {
//       cinema: 'RegentStreetCinema',
//       location: 'London',
//       showings: movie_info_out,
//     },
//   ];
}

scraper();