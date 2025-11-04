// Types
export interface Movie {
    id: string;
    title: string;
    duration: number;
}

export interface Cinema {
    id: string;
    name: string;
    location: string;
}

export interface Screening {
    id: string;
    movieId: string;
    cinemaId: string;
    datetime: string;
    price: number;
}
