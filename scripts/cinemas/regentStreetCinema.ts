import type {
    ScraperFunction,
    CinemaShowing,
    Film,
    Showing,
    FilmShowings,
} from '../types';

export const scraper: ScraperFunction = async () => {
    const body = {
        variables: {
            date: null,
            ids: [],
            movieId: null,
            movieIds: [],
            titleClassId: null,
            titleClassIds: [],
            siteIds: null,
            anyShowingBadgeIds: null,
            everyShowingBadgeIds: [null],
            resultVersion: null,
        },
        query: `
          query (
            $date: String,
            $ids: [ID],
            $movieId: ID,
            $movieIds: [ID],
            $titleClassId: ID,
            $titleClassIds: [ID],
            $siteIds: [ID],
            $everyShowingBadgeIds: [ID],
            $anyShowingBadgeIds: [ID],
            $resultVersion: String
          ) {
            showingsForDate(
              date: $date
              ids: $ids
              movieId: $movieId
              movieIds: $movieIds
              titleClassId: $titleClassId
              titleClassIds: $titleClassIds
              siteIds: $siteIds
              everyShowingBadgeIds: $everyShowingBadgeIds
              anyShowingBadgeIds: $anyShowingBadgeIds
              resultVersion: $resultVersion
            ) {
              data {
                id
                time
                showingId
                screenId
                movie {
                  id
                  name
                  urlSlug
                  posterImage
                  synopsis
                  starring
                  directedBy
                  producedBy
                  duration
                  genre
                  allGenres
                  rating
                  ratingReason
                  trailerYoutubeId
                  releaseDate
                  __typename
                }
                seatsRemaining
                seatsRemainingByTicketTypeId
                seatsRemainingWithoutSocialDistancing
                seatChart {
                  id
                  name
                  displayOrder
                  seatCount
                  seatChart
                  __typename
                }
                __typename
              }
              count
              resultVersion
              __typename
            }
          }`,
    };

    const headers = {
        Host: 'www.regentstreetcinema.com',
        'User-Agent':
            'Mozilla/5.0 (X11; Linux x86_64; rv:137.0) Gecko/20100101 Firefox/137.0',
        Accept: '*/*',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        Referer: 'https://www.regentstreetcinema.com/now-playing/',
        'content-type': 'application/json',
        'is-electron-mode': 'false',
        'site-id': '85',
        'circuit-id': '19',
        'client-type': 'consumer',
        Origin: 'https://www.regentstreetcinema.com',
        'Sec-GPC': '1',
    };

    const response = await fetch('https://www.regentstreetcinema.com/graphql', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: headers,
    });

    // 👇️ const result: CreateUserResponse
    const result = await response.json();

    // // Save raw result to file for inspection
    // try {
    //     await import('fs').then(fs => {
    //         fs.writeFileSync('regentStreetCinema_raw.json', JSON.stringify(result, null, 2));
    //     });
    //     console.log('Saved raw result to regentStreetCinema_raw.json');
    // } catch (err) {
    //     console.warn('Failed to save raw result:', err);
    // }

    // result payload has a dynamic shape; keep typing loose here
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const movie_data: any = result?.data?.showingsForDate?.data ?? {};

    const filmsMap = new Map<string, { film: Film; showings: Showing[] }>();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entries = Object.values(movie_data) as any[];
    for (const item of entries) {
        const movie = item.movie ?? item['movie'];
        if (!movie) continue;

        const key = movie.id ?? movie.tmdbId ?? movie.name;

        const filmUrl = movie.urlSlug
            ? `https://www.regentstreetcinema.com/film/${movie.urlSlug}`
            : `https://www.regentstreetcinema.com/checkout/showing/${item.id}`;

        if (!filmsMap.has(key)) {
            const film: Film = {
                title: movie.name || 'Unknown',
                url: filmUrl,
                director: movie.directedBy || undefined,
                duration:
                    typeof movie.duration === 'number'
                        ? movie.duration
                        : undefined,
                language: undefined,
                year: movie.releaseDate
                    ? parseInt(String(movie.releaseDate).slice(0, 4))
                    : undefined,
                country: undefined,
                coverUrl: movie.posterImage
                    ? `https://indy-systems.imgix.net/${movie.posterImage}?fit=crop&w=400&h=600&fm=jpeg&auto=format,compress&cs=origin`
                    : undefined,
                // Store all extra metadata in rawMeta
                rawMeta: {
                    genre: movie.genre,
                    allGenres: movie.allGenres,
                    rating: movie.rating,
                    ratingReason: movie.ratingReason,
                    synopsis: movie.synopsis,
                    starring: movie.starring,
                    producedBy: movie.producedBy,
                    color: movie.color,
                    trailerYoutubeId: movie.trailerYoutubeId,
                },
            } as Film;
            filmsMap.set(String(key), { film, showings: [] });
        }

        const entry = filmsMap.get(String(key))!;

        const start = item.time || item.showing?.time || null;
        const startISO = start ? new Date(start).toISOString() : null;

        // Extra metadata to be used later if cinema screen parsing is
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const rawMeta = {
            screenId: item.screenId,
            seatsRemaining: item.seatsRemaining,
            seatsRemainingByTicketTypeId: item.seatsRemainingByTicketTypeId,
            seatsRemainingWithoutSocialDistancing:
                item.seatsRemainingWithoutSocialDistancing,
            seatChart: {
                id: item.seatChart?.id,
                name: item.seatChart?.name,
                displayOrder: item.seatChart?.displayOrder,
                seatCount: item.seatChart?.seatCount,
            },
        };
        const showing: Showing = {
            startTime: startISO || new Date().toISOString(),
            bookingUrl: `https://www.regentstreetcinema.com/checkout/showing/${item.id}`,
            theatre: item.seatChart?.name || 'Unknown Screen',
        };

        entry.showings.push(showing);
    }

    const filmShowingsArray: FilmShowings[] = Array.from(filmsMap.values()).map(
        ({ film, showings }) => ({ film, showings })
    );

    const resultOut: CinemaShowing = {
        cinema: { name: 'RegentStreetCinema', location: 'London' },
        showings: filmShowingsArray,
    };

    return [resultOut];
};
