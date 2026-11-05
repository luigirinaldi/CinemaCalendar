import type { Cinema } from '../api';
import { cinemaCoords } from './location';

const CITY_AREA_IDS: Record<string, number> = {
    London: 3600065606,
    Padova: 3600044836,
};

/** Known administrative areas, or the area around tracked venues for any new city. */
export function cinemaMapQuery(
    city: string,
    cinemas: Pick<Cinema, 'coordinates'>[]
): string | null {
    if (!city) return null;
    const areaId = CITY_AREA_IDS[city];
    const points = cinemas.flatMap((cinema) => {
        const point = cinemaCoords(cinema);
        return point ? [point] : [];
    });
    if (!areaId && !points.length) return null;
    const bounds = points.length
        ? [
              Math.max(-90, Math.min(...points.map((p) => p.lat)) - 0.02),
              Math.max(-180, Math.min(...points.map((p) => p.lng)) - 0.03),
              Math.min(90, Math.max(...points.map((p) => p.lat)) + 0.02),
              Math.min(180, Math.max(...points.map((p) => p.lng)) + 0.03),
          ].join(',')
        : null;
    // Include venues beyond the administrative border, such as Limena near Padova.
    const regions = [areaId ? 'area.city' : null, bounds].filter(
        (region): region is string => region !== null
    );
    const selectors = regions
        .flatMap((region) =>
            ['node', 'way', 'relation'].map(
                (kind) => `${kind}["amenity"="cinema"](${region});`
            )
        )
        .join('');
    return `[out:json][timeout:25];${areaId ? `area(${areaId})->.city;` : ''}(${selectors});out center;`;
}
