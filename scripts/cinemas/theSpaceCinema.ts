import type { CinemaShowing, FilmShowings } from '../types';

// Interface for the API response
interface SpaceFilm {
    filmTitle: string;
    filmId: string;
    runningTime?: number;
    showingGroups: Array<{
        sessions: Array<{
            startTime: string;
            endTime?: string;
        }>;
    }>;
}

const CINEMA_NAME = 'The Space Cinema';
const LOG_PREFIX = '[' + CINEMA_NAME + ']';

export async function scraper(cinema: number = 1012): Promise<CinemaShowing[]> {
    // TODO - extend to every the space cinema
    // get a microservicesToken from the main page
    let response = await fetch('https://www.thespacecinema.it');
    const regex: RegExpMatchArray | undefined | null = response.headers
        .get('set-cookie')
        ?.match(/(?<=microservicesToken\=)[^;]+/);
    const microservicesToken: string = regex ? regex[0] : '';

    response = await fetch(
        `https://www.thespacecinema.it/api/microservice/showings/cinemas/${cinema}/films`,
        {
            headers: {
                Authorization: 'Bearer ' + microservicesToken,
                'User-Agent': 'Mozilla/5.0',
                Accept: 'application/json',
            },
        }
    );

    if (response.status !== 200) {
        console.warn(
            `${LOG_PREFIX} The request to thespacecinema API gave response code: `,
            response.status
        );
        return []; // This returns an empty list of movies so the getData script won't be stopped in case of an error
    }

    const data = await response.json();

    // Transform API response into FilmShowings format (group by film)
    const filmShowings: FilmShowings[] = data.result.map((film: SpaceFilm) => ({
        film: {
            title: film.filmTitle,
            url: `https://www.thespacecinema.it/film/${film.filmId}`,
            duration: film.runningTime,
        },
        showings: film.showingGroups.flatMap((day) =>
            day.sessions.map((show) => ({
                startTime: show.startTime,
            }))
        ),
    }));

    return [
        {
            cinema: {
                name: 'The Space Cinema Limena',
                location: 'Padova',
            },
            showings: filmShowings,
        },
    ];
}
