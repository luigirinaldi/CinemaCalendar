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


export interface TheSpaceAPIResponse {
    result:       Result[];
    responseCode: number;
    errorMessage: null;
}

export interface Result {
    showingGroups:              ShowingGroup[];
    filmId:                     string;
    certificate:                Certificate;
    secondaryCertificates:      Certificate[];
    filmUrl:                    string;
    filmAttributes:             Attribute[];
    posterImageSrc:             string;
    cast:                       string;
    releaseDate:                Date;
    runningTime:                number;
    isDurationUnknown:          boolean;
    synopsisShort:              string;
    filmTitle:                  string;
    hasSessions:                boolean;
    hasTrailer:                 boolean;
    embargoMessage:             string;
    embargoEndDate:             Date | null;
    embargoLevel:               null;
    priceMessage:               PriceMessage | null;
    alternativeCertificate:     Certificate;
    panelImageUrl:              string;
    filmStatus:                 number;
    trailers:                   any[];
    director:                   string;
    distributor:                string;
    movieXchangeCode:           string;
    crossCountryMovieXchangeId: string;
    originalTitle:              string; // almost always ""
    showingInCinemas:           string[];
    genres:                     string[];
    sessionAttributes:          any[];
}

export interface Certificate {
    name:        null | string;
    description: Description | null;
    src:         null | string;
}

export enum Description {
    Alcol = "Alcol",
    Armi = "Armi",
    Discriminazione = "Discriminazione",
    Empty = "",
    Sesso = "Sesso",
    Torpiloquio = "Torpiloquio",
    Violenza = "Violenza",
}

export interface Attribute {
    name:               Name;
    shortName:          Name;
    value:              Name;
    description:        string;
    attributeType:      AttributeType;
    color:              Color;
    borderGradient:     any[] | null;
    backgroundImageUrl: null;
    iconName:           null;
}

export enum AttributeType {
    Language = "Language",
    Movie = "Movie",
    Session = "Session",
    SessionSpecial = "Session_Special",
}

export enum Color {
    Empty = "",
    F7941E = "#f7941e",
}

export enum Name {
    BackOnTheBigScreen = "BACK ON THE BIG SCREEN",
    CanzoniInInglese = "CANZONI IN INGLESE",
    Cinemapark = "CINEMAPARK",
    DirettaLive = "DIRETTA LIVE",
    Empty = "",
    Epic = "EPIC",
    Extra = "EXTRA",
    Italiano = "ITALIANO",
    LinguaOriginale = "LINGUA ORIGINALE",
    ProiezioneLASER = "Proiezione LASER",
    ProiezioneLASER4K = "Proiezione LASER 4K",
    The2D = "2D",
    The3D = "3D",
}

export enum PriceMessage {
    The1InMenoSEAcquistiOnline = "1€ in meno se acquisti online",
}

export interface ShowingGroup {
    date:         Date;
    datePrefix:   DatePrefix;
    pricingTypes: any[];
    sessions:     Session[];
}

export enum DatePrefix {
    Domani = "Domani",
    Empty = "",
    Oggi = "Oggi",
}

export interface Session {
    sessionId:                   string;
    bookingUrl:                  string;
    formattedPrice:              string; // i.e. "12,09 €"
    isPriceVisible:              boolean;
    duration:                    number;
    startTime:                   Date;
    endTime:                     Date;
    showTimeWithTimeZone:        string; // Date?
    isSoldOut:                   boolean;
    color:                       null;
    isMidnightSession:           boolean;
    isBookingAvailable:          boolean;
    attributes:                  Attribute[];
    screenName:                  ScreenName;
    sessionPricingDisplayStatus: number;
    wheelchairSeatAvailability:  number;
}

export enum ScreenName {
    Sala1 = "Sala 1",
    Sala10 = "Sala 10",
    Sala11 = "Sala 11",
    Sala12 = "Sala 12",
    Sala13 = "Sala 13",
    Sala14 = "Sala 14",
    Sala2 = "Sala 2",
    Sala3 = "Sala 3",
    Sala4 = "Sala 4",
    Sala5 = "Sala 5",
    Sala6 = "Sala 6",
    Sala7 = "Sala 7",
    Sala8 = "Sala 8",
    Sala9 = "Sala 9",
}


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

    const data = await response.json() as TheSpaceAPIResponse;

    // Transform API response into FilmShowings format (group by film)
    const filmShowings: FilmShowings[] = data.result.map((film) => {
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
                        startTime: show.showTimeWithTimeZone,
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
