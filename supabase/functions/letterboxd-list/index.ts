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

function extractSlugs(html: string): string[] {
    return [...html.matchAll(/data-item-slug="([^"]+)"/g)].map((m) => m[1]);
}

function extractNextPageUrl(html: string): string | null {
    // Letterboxd pagination: <a class="next" href="/user/watchlist/page/2/">
    const m = html.match(/class="next"[^>]*href="([^"]+)"|href="([^"]+)"[^>]*class="next"/);
    return m ? (m[1] ?? m[2] ?? null) : null;
}

async function scrapeList(startUrl: string): Promise<string[]> {
    const base = 'https://letterboxd.com';
    const slugs: string[] = [];
    let pageUrl: string | null = startUrl.startsWith('http') ? startUrl : `${base}${startUrl}`;

    while (pageUrl) {
        const res = await fetch(pageUrl, { headers: FETCH_HEADERS });
        if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${pageUrl}`);
        const html = await res.text();

        const pageSlugs = extractSlugs(html);
        slugs.push(...pageSlugs);

        const nextHref = extractNextPageUrl(html);
        pageUrl = nextHref ? `${base}${nextHref}` : null;

        if (pageUrl) await new Promise((r) => setTimeout(r, 300));
    }

    return [...new Set(slugs)];
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

        const slugs = await scrapeList(url);
        return Response.json({ slugs }, { headers: CORS_HEADERS });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        return Response.json({ error: message }, { status: 500, headers: CORS_HEADERS });
    }
});
