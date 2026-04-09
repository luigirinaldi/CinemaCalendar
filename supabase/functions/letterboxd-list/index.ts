type Film = { slug: string; title: string; year: number | null };

const FETCH_HEADERS = {
    'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
    Accept: 'text/html,application/xhtml+xml',
    'Accept-Language': 'en-US,en;q=0.9',
};

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function extractFilms(html: string): Film[] {
    // data-item-name appears before data-item-slug on the same element; extract in parallel arrays
    const slugs = [...html.matchAll(/data-item-slug="([^"]+)"/g)].map((m) => m[1]);
    const names = [...html.matchAll(/data-item-name="([^"]+)"/g)].map((m) => m[1]);

    return slugs.map((slug, i) => {
        const rawName = (names[i] ?? slug).trim();
        const yearMatch = /\((\d{4})\)$/.exec(rawName);
        const year = yearMatch ? parseInt(yearMatch[1]) : null;
        const title = yearMatch ? rawName.slice(0, rawName.lastIndexOf(' (')).trim() : rawName;
        return { slug, title, year };
    });
}

function extractNextPageUrl(html: string): string | null {
    const m = html.match(/class="next"[^>]*href="([^"]+)"|href="([^"]+)"[^>]*class="next"/);
    return m ? (m[1] ?? m[2] ?? null) : null;
}

async function scrapeList(startUrl: string): Promise<Film[]> {
    const base = 'https://letterboxd.com';
    const films: Film[] = [];
    let pageUrl: string | null = startUrl.startsWith('http') ? startUrl : `${base}${startUrl}`;

    while (pageUrl) {
        const res = await fetch(pageUrl, { headers: FETCH_HEADERS });
        if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${pageUrl}`);
        const html = await res.text();

        films.push(...extractFilms(html));

        const nextHref = extractNextPageUrl(html);
        pageUrl = nextHref ? `${base}${nextHref}` : null;

        if (pageUrl) await new Promise((r) => setTimeout(r, 300));
    }

    // Deduplicate by slug
    const seen = new Set<string>();
    return films.filter((f) => f.slug && !seen.has(f.slug) && seen.add(f.slug));
}

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: CORS_HEADERS });
    }

    try {
        const { username, listUrl } = await req.json();

        let url: string;
        if (listUrl) {
            url = listUrl;
        } else if (username) {
            url = `https://letterboxd.com/${username}/watchlist/`;
        } else {
            return Response.json(
                { error: 'username or listUrl required' },
                { status: 400, headers: CORS_HEADERS }
            );
        }

        const films = await scrapeList(url);
        return Response.json({ films }, { headers: CORS_HEADERS });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        return Response.json({ error: message }, { status: 500, headers: CORS_HEADERS });
    }
});
