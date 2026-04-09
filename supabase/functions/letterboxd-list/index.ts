import { scrapeList } from './scraper.ts';

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
