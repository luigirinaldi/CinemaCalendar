import { readdir } from 'node:fs/promises';
import { CinemaShowingsSchema, type ScraperFunction } from './types';
import { collectCinemaStats } from './utils';
import { mapConcurrent } from './http';

async function main() {
    const filters = process.env.SCRAPER
        ? [process.env.SCRAPER]
        : process.argv.slice(2);
    const files = (await readdir(new URL('./cinemas/', import.meta.url)))
        .filter(
            (file) =>
                file.endsWith('.ts') &&
                (!filters.length ||
                    filters.some((filter) =>
                        file.toLowerCase().includes(filter.toLowerCase())
                    ))
        )
        .sort();
    if (!files.length) throw new Error('No matching scrapers');
    const rows = await mapConcurrent(
        files,
        async (file) => {
            try {
                const module = await import(`./cinemas/${file}`);
                if (typeof module.scraper !== 'function')
                    throw new Error('Missing scraper export');
                const result = CinemaShowingsSchema.parse(
                    await (module.scraper as ScraperFunction)()
                );
                if (!result.length) throw new Error('No cinema data returned');
                const stats = result.map(collectCinemaStats);
                const films = stats.reduce(
                    (n, value) => n + value.totalFilms,
                    0
                );
                const showings = stats.reduce(
                    (n, value) => n + value.totalShowings,
                    0
                );
                const future = result
                    .flatMap((c) => c.showings)
                    .flatMap((f) => f.showings)
                    .filter(
                        (s) => Date.parse(s.startTime) >= Date.now()
                    ).length;
                console.log(
                    `${file}: ${films} films, ${showings} showings (${future} upcoming)`
                );
                return {
                    scraper: file,
                    status: showings ? 'OK' : 'EMPTY',
                    films,
                    showings,
                    future,
                };
            } catch (error) {
                process.exitCode = 1;
                const message =
                    error instanceof Error ? error.message : String(error);
                console.error(`${file}: ${message}`);
                return { scraper: file, status: 'FAILED', error: message };
            }
        },
        3
    );
    console.table(rows);
    // Empty programmes can be legitimate, but strict CI can flag them explicitly.
    if (
        process.env.SCRAPER_REQUIRE_SHOWINGS === '1' &&
        rows.some(
            (row) =>
                row.status === 'EMPTY' || ('future' in row && row.future === 0)
        )
    )
        process.exitCode = 1;
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
