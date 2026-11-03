export type Film = { slug: string; title: string; year: number | null };

const FETCH_HEADERS = {
    'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
    Accept: 'text/html,application/xhtml+xml',
    'Accept-Language': 'en-US,en;q=0.9',
};

function extractFilms(html: string): Film[] {
    const slugs = [...html.matchAll(/data-item-slug="([^"]+)"/g)].map(
        (m) => m[1]
    );
    const names = [...html.matchAll(/data-item-name="([^"]+)"/g)].map(
        (m) => m[1]
    );

    return slugs.map((slug, i) => {
        const rawName = (names[i] ?? slug).trim();
        const yearMatch = /\((\d{4})\)$/.exec(rawName);
        const year = yearMatch ? parseInt(yearMatch[1]) : null;
        const title = yearMatch
            ? rawName.slice(0, rawName.lastIndexOf(' (')).trim()
            : rawName;
        return { slug, title, year };
    });
}

function extractNextPageUrl(html: string): string | null {
    const m = html.match(
        /class="next"[^>]*href="([^"]+)"|href="([^"]+)"[^>]*class="next"/
    );
    return m ? (m[1] ?? m[2] ?? null) : null;
}

export async function scrapeList(
    startUrl: string,
    maxPages = Infinity
): Promise<Film[]> {
    const base = 'https://letterboxd.com';
    const films: Film[] = [];
    let pageUrl: string | null = startUrl.startsWith('http')
        ? startUrl
        : `${base}${startUrl}`;
    let pages = 0;

    while (pageUrl && pages < maxPages) {
        const res = await fetch(pageUrl, { headers: FETCH_HEADERS });
        if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${pageUrl}`);
        const html = await res.text();

        films.push(...extractFilms(html));
        pages++;

        const nextHref = extractNextPageUrl(html);
        pageUrl = nextHref ? `${base}${nextHref}` : null;

        if (pageUrl) await new Promise((r) => setTimeout(r, 300));
    }

    const seen = new Set<string>();
    return films.filter((f) => f.slug && !seen.has(f.slug) && seen.add(f.slug));
}
