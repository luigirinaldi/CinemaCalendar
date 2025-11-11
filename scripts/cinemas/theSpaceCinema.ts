import { Film } from 'lucide-react';
import type { CinemaShowing } from '../types';

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
            'The request to thespacecinema API gave response code: ',
            response.status
        );
        return []; // This returns an empty list of movies so the getData script won't be stopped in case of an error
    }

    const data = await response.json();

    type TheSpaceShow = { startTime: any; endTime: any; };
    type TheSpaceDay = { sessions: TheSpaceShow[]; }
    type TheSpaceShowing = { showingGroups: TheSpaceDay[]; filmTitle: string; filmId: string; runningTime: any; };

    return [
        {
            cinema: 'TheSpaceCinemaLimena',
            location: 'Padova',
            showings: data.result.flatMap((film: TheSpaceShowing) =>
                film.showingGroups.flatMap((day: TheSpaceDay) =>
                    day.sessions.map((show: TheSpaceShow) => ({
                        name: film.filmTitle,
                        localId: film.filmId,
                        startTime: show.startTime,
                        endTime: show.endTime,
                        duration: film.runningTime,
                    }))
                )
            ),
        },
    ];
}
