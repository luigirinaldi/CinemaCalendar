// Types
export interface Movie {
    id: number;
    title: string;
    duration: number;
    release_date?: string;
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
