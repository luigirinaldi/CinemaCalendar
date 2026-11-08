import { z } from 'zod';
import type { CinemaLocationResult } from '../../shared/cinemaLocation';
import { publicFetch, publicUrl } from './network';

const featureSchema = z.object({
    geometry: z.object({
        type: z.literal('Point'),
        coordinates: z.tuple([z.number(), z.number()]),
    }),
    properties: z.object({
        name: z.string().nullish(),
        street: z.string().nullish(),
        housenumber: z.string().nullish(),
        postcode: z.string().nullish(),
        city: z.string().nullish(),
        district: z.string().nullish(),
        state: z.string().nullish(),
        country: z.string().nullish(),
    }),
});

export function parseLocationResults(body: unknown): CinemaLocationResult[] {
    const { features } = z
        .object({ features: z.array(z.unknown()) })
        .parse(body);
    const results: CinemaLocationResult[] = [];
    for (const feature of features.slice(0, 20)) {
        const parsed = featureSchema.safeParse(feature);
        if (!parsed.success) continue;
        const [lng, lat] = parsed.data.geometry.coordinates;
        if (
            !Number.isFinite(lat) ||
            !Number.isFinite(lng) ||
            Math.abs(lat) > 85 ||
            Math.abs(lng) > 180
        )
            continue;
        const p = parsed.data.properties;
        const label = [
            ...new Set(
                [
                    p.name,
                    [p.street, p.housenumber].filter(Boolean).join(' '),
                    [p.postcode, p.city ?? p.district]
                        .filter(Boolean)
                        .join(' '),
                    p.state,
                    p.country,
                ].filter((part): part is string => !!part?.trim())
            ),
        ].join(', ');
        if (!label) continue;
        const id = `${lat},${lng}`;
        if (!results.some((result) => result.id === id))
            results.push({
                id,
                label,
                city: p.city ?? '',
                lat: String(lat),
                lng: String(lng),
            });
        if (results.length === 5) break;
    }
    return results;
}

/** Explicit searches only: bounded cache, serialized requests, at most one per second. */
export function createCinemaGeocoder(
    options: {
        endpoint?: string;
        fetch?: typeof publicFetch;
        now?: () => number;
        sleep?: (ms: number) => Promise<void>;
    } = {}
) {
    const endpoint = publicUrl(
        options.endpoint || 'https://photon.komoot.io/api/'
    );
    const fetch = options.fetch ?? publicFetch;
    const now = options.now ?? Date.now;
    const sleep =
        options.sleep ??
        ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    const cache = new Map<
        string,
        { expires: number; results: CinemaLocationResult[] }
    >();
    let queue = Promise.resolve();
    let nextRequest = 0;
    return (input: unknown): Promise<CinemaLocationResult[]> => {
        const query = z
            .string()
            .trim()
            .min(3, 'Enter a cinema name with its city, or an address')
            .max(250)
            .parse(input)
            .replace(/\s+/g, ' ');
        const key = query.toLocaleLowerCase();
        const task = queue.then(async () => {
            const cached = cache.get(key);
            if (cached && cached.expires > now()) return cached.results;
            const wait = nextRequest - now();
            if (wait > 0) await sleep(wait);
            nextRequest = now() + 1000;
            const url = new URL(endpoint);
            url.searchParams.set('q', query);
            url.searchParams.set('limit', '5');
            const response = await fetch(url.href);
            if (!response.ok)
                throw new Error(
                    response.status === 429
                        ? 'Location search is temporarily rate limited. Try again later or enter coordinates manually.'
                        : `Location search is unavailable (HTTP ${response.status}). You can enter coordinates manually.`
                );
            const results = parseLocationResults(await response.json());
            if (cache.size >= 200) cache.delete(cache.keys().next().value!);
            cache.set(key, { expires: now() + 24 * 60 * 60 * 1000, results });
            return results;
        });
        queue = task.then(
            () => {},
            () => {}
        );
        return task;
    };
}
