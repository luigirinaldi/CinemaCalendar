import { parse } from 'node-html-parser';

export type Film = { slug: string; title: string; year: number | null };

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

function parseFilms(html: string): Film[] {
    const root = parse(html);
    return root
        .querySelectorAll('[data-item-slug]')
        .map((el) => {
            const slug = el.getAttribute('data-item-slug')!;
            const rawName = (el.getAttribute('data-item-name') ?? slug).trim();
            const yearMatch = /\((\d{4})\)$/.exec(rawName);
            const year = yearMatch ? parseInt(yearMatch[1]) : null;
            const title = yearMatch
                ? rawName.slice(0, rawName.lastIndexOf(' (')).trim()
                : rawName;
            return { slug, title, year };
        })
        .filter((f) => Boolean(f.slug));
}

function parseNextPageUrl(html: string): string | null {
    const root = parse(html);
    return root.querySelector('a.next')?.getAttribute('href') ?? null;
}

export async function scrapeLetterboxdUrl(url: string): Promise<Film[]> {
    const base = 'https://letterboxd.com';
    const films: Film[] = [];

    let pageUrl: string | null = url.startsWith('http') ? url : `${base}${url}`;

    while (pageUrl) {
        console.error(`Fetching ${pageUrl}...`);
        const html = await fetchPage(pageUrl);
        const pageFilms = parseFilms(html);
        films.push(...pageFilms);
        console.error(`  → ${pageFilms.length} films (total: ${films.length})`);

        const nextHref = parseNextPageUrl(html);
        pageUrl = nextHref ? `${base}${nextHref}` : null;

        if (pageUrl) await new Promise((r) => setTimeout(r, 500));
    }

    // Deduplicate by slug
    const seen = new Set<string>();
    return films.filter((f) => !seen.has(f.slug) && seen.add(f.slug));
}

export async function scrapeWatchlist(username: string): Promise<Film[]> {
    return scrapeLetterboxdUrl(`https://letterboxd.com/${username}/watchlist/`);
}

// CLI entrypoint: npx tsx scripts/letterboxd_list.ts <username|url>
if (import.meta.url === `file://${process.argv[1]}`) {
    const arg = process.argv[2];
    if (!arg) {
        console.error(
            'Usage: npx tsx scripts/letterboxd_list.ts <letterboxd-username|list-url>'
        );
        process.exit(1);
    }

    try {
        const films =
            arg.startsWith('http') || arg.startsWith('/')
                ? await scrapeLetterboxdUrl(arg)
                : await scrapeWatchlist(arg);

        console.log(`\nFound ${films.length} films:`);
        films.forEach((f) => console.log(`${f.title}${f.year ? ` (${f.year})` : ''} — ${f.slug}`));
    } catch (e: unknown) {
        console.error('Error:', e instanceof Error ? e.message : e);
        process.exit(1);
    }
}
