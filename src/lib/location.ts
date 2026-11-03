import type { Cinema } from '../api';

export interface Coordinates {
    lat: number;
    lng: number;
}
export interface SearchArea extends Coordinates {
    km: number;
}

function coordinate(value: unknown): number {
    if (typeof value === 'number') return value;
    if (typeof value !== 'string' || !value.trim()) return NaN;
    if (/^[+-]?\d+(?:\.\d+)?$/.test(value.trim())) return Number(value);
    const dms = value.match(
        /^\s*(-?\s*\d+(?:\.\d+)?)°\s*(\d+(?:\.\d+)?)['′]\s*(\d+(?:\.\d+)?)["″]\s*([NSEW])\s*$/i
    );
    if (!dms) return NaN;
    const degrees = Number(dms[1].replace(/\s/g, ''));
    const minutes = Number(dms[2]);
    const seconds = Number(dms[3]);
    if (minutes >= 60 || seconds >= 60) return NaN;
    return (
        (Math.abs(degrees) + minutes / 60 + seconds / 3600) *
        (/[SW]/i.test(dms[4]) || degrees < 0 ? -1 : 1)
    );
}

export function cinemaCoords(
    cinema: Pick<Cinema, 'coordinates'>
): Coordinates | null {
    const value = cinema.coordinates;
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return null;
    const lat = coordinate(value.lat);
    const lng = coordinate(value.lng);
    return Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        Math.abs(lat) <= 90 &&
        Math.abs(lng) <= 180
        ? { lat, lng }
        : null;
}

export function searchArea(
    lat: number,
    lng: number,
    km: number
): SearchArea | null {
    if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        !Number.isFinite(km) ||
        Math.abs(lat) > 85 ||
        Math.abs(lng) > 180 ||
        km < 1 ||
        km > 100
    )
        return null;
    // About 100 m precision: sufficient for cinema searches and short links.
    return {
        lat: Number(lat.toFixed(3)),
        lng: Number(lng.toFixed(3)),
        km: Math.round(km),
    };
}

export function distanceKm(a: Coordinates, b: Coordinates) {
    const radians = (n: number) => (n * Math.PI) / 180;
    const dLat = radians(b.lat - a.lat);
    const dLng = radians(b.lng - a.lng);
    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(radians(a.lat)) *
            Math.cos(radians(b.lat)) *
            Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function cinemasInArea(cinemas: Cinema[], area: SearchArea) {
    return cinemas.filter((cinema) => {
        const point = cinemaCoords(cinema);
        return point != null && distanceKm(area, point) <= area.km;
    });
}

export function nearestCity(cinemas: Cinema[], point: Coordinates) {
    let nearest: { city: string; distance: number } | null = null;
    for (const cinema of cinemas) {
        const coords = cinemaCoords(cinema);
        if (!coords || !cinema.location) continue;
        const distance = distanceKm(point, coords);
        if (!nearest || distance < nearest.distance)
            nearest = { city: cinema.location, distance };
    }
    return nearest;
}

export function cityCenter(
    cinemas: Cinema[],
    city: string
): Coordinates | null {
    const points = cinemas
        .filter((c) => c.location === city)
        .flatMap((c) => {
            const point = cinemaCoords(c);
            return point ? [point] : [];
        });
    return points.length
        ? {
              lat: points.reduce((n, p) => n + p.lat, 0) / points.length,
              lng: points.reduce((n, p) => n + p.lng, 0) / points.length,
          }
        : null;
}
