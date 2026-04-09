import { parse } from 'node-html-parser';

const FETCH_HEADERS = {
    'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
    Accept: 'text/html,application/xhtml+xml',
    'Accept-Language': 'en-US,en;q=0.9',
};

async function fetchPage(url: string): Promise<string> {
    const res = await fetch(url, { headers: FETCH_HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
    return res.text();
}

function parseFilmSlugs(html: string): string[] {
    const root = parse(html);
    // Letterboxd uses data-item-slug on react-component divs for film entries
    return root
        .querySelectorAll('[data-item-slug]')
        .map((el) => el.getAttribute('data-item-slug')!)
        .filter(Boolean);
}

function parseNextPageUrl(html: string): string | null {
    const root = parse(html);
    return root.querySelector('a.next')?.getAttribute('href') ?? null;
}

export async function scrapeLetterboxdUrl(url: string): Promise<string[]> {
    const base = 'https://letterboxd.com';
    const slugs: string[] = [];

    let pageUrl: string | null = url.startsWith('http') ? url : `${base}${url}`;

    while (pageUrl) {
        console.error(`Fetching ${pageUrl}...`);
        const html = await fetchPage(pageUrl);
        const pageSlugs = parseFilmSlugs(html);
        slugs.push(...pageSlugs);
        console.error(`  → ${pageSlugs.length} films (total: ${slugs.length})`);

        const nextHref = parseNextPageUrl(html);
        pageUrl = nextHref ? `${base}${nextHref}` : null;

        if (pageUrl) await new Promise((r) => setTimeout(r, 500));
    }

    return [...new Set(slugs)];
}

export async function scrapeWatchlist(username: string): Promise<string[]> {
    return scrapeLetterboxdUrl(`https://letterboxd.com/${username}/watchlist/`);
}

// CLI entrypoint: npx tsx scripts/letterboxd_list.ts <username|url>
if (import.meta.url === `file://${process.argv[1]}`) {
    const arg = process.argv[2];
    if (!arg) {
        console.error(
            'Usage: npx tsx scripts/letterboxd_list.ts <letterboxd-username|list-url>'
        );
        console.error(
            'Examples:\n  npx tsx scripts/letterboxd_list.ts someuser\n  npx tsx scripts/letterboxd_list.ts https://letterboxd.com/bfi/list/sight-sound-greatest-films-of-all-time/'
        );
        process.exit(1);
    }

    try {
        const slugs =
            arg.startsWith('http') || arg.startsWith('/')
                ? await scrapeLetterboxdUrl(arg)
                : await scrapeWatchlist(arg);

        console.log(`\nFound ${slugs.length} films:`);
        slugs.forEach((s) => console.log(s));
    } catch (e: unknown) {
        console.error('Error:', e instanceof Error ? e.message : e);
        process.exit(1);
    }
}
