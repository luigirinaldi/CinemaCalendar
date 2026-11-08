// Deno smoke check: no database, GitHub writes, or external requests.
import assert from 'node:assert/strict';
let handle;
Deno.serve = (handler) => {
    handle = handler;
    return {};
};
for (const [key, value] of Object.entries({
    SUPABASE_URL: 'https://project.example',
    SUPABASE_ANON_KEY: 'public',
    SUPABASE_SERVICE_ROLE_KEY: 'private',
    BUILDER_PAGE_URL: 'https://cinema.example/#/add-cinema',
    BUILDER_SESSION_KEY: 'a'.repeat(64),
}))
    Deno.env.set(key, value);
const rows = new Map();
globalThis.fetch = async (url, init) => {
    if (String(url).includes('/rpc/')) return Response.json(true);
    if (init?.method === 'POST') {
        const row = JSON.parse(init.body);
        rows.set(row.id, row);
        return Response.json([row]);
    }
    const id = new URL(url).searchParams.get('id')?.slice(3);
    return Response.json(rows.has(id) ? [rows.get(id)] : []);
};
const began = performance.now();
await import('../../supabase/functions/scraper-builder/index.js');
const response = await handle(
    new Request(
        'https://project.example/functions/v1/scraper-builder/session',
        { headers: { Origin: 'https://cinema.example' } }
    )
);
const status = await response.json();
assert.equal(response.status, 200);
assert.equal(status.edge, true);
assert.equal(status.sessionToken.length, 64);
const second = await handle(
    new Request(
        'https://project.example/functions/v1/scraper-builder/session',
        {
            headers: {
                Origin: 'https://cinema.example',
                'X-Builder-Session': status.sessionToken,
            },
        }
    )
);
assert.equal((await second.json()).sessionToken, undefined);
console.log(
    'PASS: generated Edge bundle starts in Deno and round-trips an encrypted session (' +
        Math.round(performance.now() - began) +
        ' ms)'
);
