import { corsHeaders } from 'jsr:@supabase/supabase-js@2/cors';
import { scrapeList } from './scraper.ts';

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
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
                { status: 400, headers: corsHeaders }
            );
        }

        const films = await scrapeList(url);
        return Response.json({ films }, { headers: corsHeaders });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        return Response.json({ error: message }, { status: 500, headers: corsHeaders });
    }
});
