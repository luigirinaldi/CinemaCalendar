import type {
    CinemaShowing,
    FilmShowings,
    Film,
    Showing,
    Cinema,
} from '../types';

const CINEMA: Cinema = {
    name: 'The Space Cinema Limena',
    location: 'Padova',
    defaultLanguage: 'it-IT',
};

// Extended interfaces for additional fields
interface SpaceFilmData extends Film {
    genres?: string[];
    originalTitle?: string;
    cast?: string;
    description?: string;
}

interface SpaceShowingData extends Showing {
    language?: string;
    format?: string;
    _price?: number; // Stored for future use
}

// Interfaces for the API response
interface SpaceAttribute {
    name: string;
    value: string;
    attributeType: string;
}

interface SpaceSession {
    startTime: string;
    endTime?: string;
    bookingUrl?: string;
    screenName?: string;
    attributes: SpaceAttribute[];
    formattedPrice?: string;
    isPriceVisible?: boolean;
}

interface SpaceFilm {
    filmTitle: string;
    filmId: string;
    runningTime?: number;
    director?: string;
    posterImageSrc?: string;
    originalTitle?: string;
    cast?: string;
    synopsisShort?: string;
    genres?: string[];
    releaseDate?: string;
    showingGroups: Array<{
        sessions: SpaceSession[];
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
    const filmShowings: FilmShowings[] = data.result.map((film: SpaceFilm) => {
        // Extract year from release date if available
        const releaseYear = film.releaseDate
            ? new Date(film.releaseDate).getFullYear()
            : undefined;

        // Find a default language from the first showing that has one
        const defaultLanguage = film.showingGroups
            .flatMap((g) => g.sessions)
            .find((s) =>
                s.attributes?.some((a) => a.attributeType === 'Language')
            )
            ?.attributes.find((a) => a.attributeType === 'Language')?.value;

        const filmObj: SpaceFilmData = {
            title: film.filmTitle,
            url: `https://www.thespacecinema.it/film/${film.filmId}`,
            duration: film.runningTime,
            director: film.director,
            coverUrl: film.posterImageSrc,
            genres: film.genres,
            originalTitle: film.originalTitle,
            cast: film.cast,
            description: film.synopsisShort,
            year: releaseYear,
            language: defaultLanguage,
        };

        return {
            film: filmObj,
            showings: film.showingGroups.flatMap((day) =>
                day.sessions.map((show) => {
                    const showing: SpaceShowingData = {
                        startTime: show.startTime,
                        theatre: show.screenName,
                        bookingUrl: show.bookingUrl
                            ? `https://www.thespacecinema.it${show.bookingUrl}`
                            : undefined,
                    };

                    // Extract language and format from attributes if present
                    const languageAttr = show.attributes?.find(
                        (a) => a.attributeType === 'Language'
                    );
                    if (languageAttr) {
                        showing.language = languageAttr.value;
                    }

                    const formatAttr = show.attributes?.find(
                        (a) => a.attributeType === 'Session'
                    );
                    if (formatAttr) {
                        showing.format = formatAttr.value;
                    }

                    // Store price information if available (for future use)
                    if (show.formattedPrice && show.isPriceVisible) {
                        // Remove currency symbol and convert to number
                        const priceMatch =
                            show.formattedPrice.match(/(\d+)[,.](\d+)/);
                        if (priceMatch) {
                            const price = parseFloat(
                                `${priceMatch[1]}.${priceMatch[2]}`
                            );
                            // Store in an underscore-prefixed field to indicate it's for future use
                            showing._price = price;
                        }
                    }

                    return showing;
                })
            ),
        };
    });

    return [
        {
            cinema: CINEMA,
            showings: filmShowings,
        },
    ];
}
