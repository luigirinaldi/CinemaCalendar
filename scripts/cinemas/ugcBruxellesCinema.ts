import { CinemaShowingsSchema } from '../types';
import { createProgrammeScraper } from '../programmeScraper';
import { loadUgcBelgiumProgramme } from '../providers/ugcBelgium';
import { bruxellesCinema } from '../venues/bruxelles';

export async function scraper() {
    const results = [];
    // Keep per-chain request fan-out bounded instead of loading both calendars at once.
    for (const [key, id] of [
        ['ugcBrouckere', '2'],
        ['ugcToison', '1'],
    ] as const) {
        results.push(
            ...(await createProgrammeScraper({
                cinema: bruxellesCinema(key),
                load: () => loadUgcBelgiumProgramme(id),
                parse: (films) => films,
            })())
        );
    }
    return CinemaShowingsSchema.parse(results);
}
