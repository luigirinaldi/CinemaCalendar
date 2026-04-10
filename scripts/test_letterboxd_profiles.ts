import { scrapeList } from '../supabase/functions/letterboxd-list/scraper.ts';

const PROFILES = [
    { username: 'dave', minFilms: 50 },
    { username: 'karsten', minFilms: 10 },
];

// Compatible with both npx tsx (process.argv) and deno run (Deno.args)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const args: string[] = (globalThis as any).Deno?.args ?? process.argv.slice(2);
const isFullMode = args.includes('--full');
const maxPages = isFullMode ? Infinity : 2;

console.log(`Mode: ${isFullMode ? 'full' : 'quick'} (maxPages=${isFullMode ? '∞' : maxPages})\n`);

let failed = false;

for (const { username, minFilms } of PROFILES) {
    console.log(`--- @${username} ---`);
    try {
        const films = await scrapeList(`https://letterboxd.com/${username}/watchlist/`, maxPages);

        const pass = (ok: boolean, msg: string) => {
            console.log(`  ${ok ? '✓' : '✗'} ${msg}`);
            if (!ok) failed = true;
        };

        pass(films.length >= minFilms, `${films.length} films >= ${minFilms} minimum`);
        pass(films.every((f) => f.slug.length > 0), 'every film has a non-empty slug');
        pass(films.every((f) => f.title.length > 0), 'every film has a non-empty title');
    } catch (e) {
        console.log(`  ✗ fetch failed: ${e instanceof Error ? e.message : e}`);
        failed = true;
    }
    console.log();
}

if (failed) {
    console.error('Some assertions failed.');
    process.exit(1);
} else {
    console.log('All assertions passed.');
}
