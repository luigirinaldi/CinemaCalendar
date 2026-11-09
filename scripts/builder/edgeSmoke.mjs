// Deno smoke check: no database, GitHub writes, or external requests.
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
// Simulate the hosted compatibility limitation even on newer standalone Deno.
http.request = https.request = () => {
    throw new Error('Node ClientRequest is unavailable in this smoke test');
};
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
    BUILDER_GITHUB_CLIENT_ID: 'fixture-client',
    BUILDER_GITHUB_CLIENT_SECRET: 'fixture-secret',
}))
    Deno.env.set(key, value);
const rows = new Map();
globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/login/oauth/access_token'))
        return Response.json({ access_token: 'fixture-token' });
    if (String(url).endsWith('/user'))
        return Response.json({ login: 'fixture-writer' });
    if (String(url).startsWith('https://api.github.com/'))
        return Response.json({ permissions: { push: true } });
    if (String(url).includes('/rpc/')) return Response.json(true);
    const id = new URL(url).searchParams.get('id')?.slice(3);
    if (init?.method === 'PATCH') {
        Object.assign(rows.get(id), JSON.parse(init.body));
        return Response.json([rows.get(id)]);
    }
    if (init?.method === 'POST') {
        const row = JSON.parse(init.body);
        rows.set(row.id, row);
        return Response.json([row]);
    }
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
const call = (route, data) =>
    handle(
        new Request(
            `https://project.example/functions/v1/scraper-builder${route}`,
            {
                method: 'POST',
                headers: {
                    Origin: 'https://cinema.example',
                    'X-Builder-Session': status.sessionToken,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
            }
        )
    );
const login = await (await call('/auth/start', {})).json();
assert.equal(
    (
        await call('/auth/complete', {
            code: 'fixture-code',
            state: new URL(login.url).searchParams.get('state'),
        })
    ).status,
    200
);
const pageBody = `<script id="programme">window.programme = {films: [{title: 'Fixture film', sessions: [{start: '2099-11-05T20:30:00'}]}]};</script>`;
let connections = 0;
let closed = 0;
Deno.resolveDns = async (_host, type) =>
    type === 'A' ? ['93.184.215.14'] : [];
Deno.connect = async ({ hostname }) => {
    assert.equal(hostname, '93.184.215.14');
    connections++;
    let bytes;
    let offset = 0;
    return {
        async read(buffer) {
            if (offset === bytes.length) return null;
            const size = Math.min(buffer.length, bytes.length - offset);
            buffer.set(bytes.subarray(offset, offset + size));
            offset += size;
            return size;
        },
        async write(buffer) {
            const request = new TextDecoder().decode(buffer);
            const body = request.startsWith('GET /api-films ')
                ? JSON.stringify([
                      {
                          title: { rendered: 'Hybrid film' },
                          link: 'https://venue.example/film/1',
                          modified: new Date().toISOString(),
                      },
                  ])
                : request.startsWith('GET /film/1 ')
                  ? `<article><p class="date">${new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Rome' }).format(new Date())} ore 21.15</p></article>`
                  : pageBody;
            bytes = new TextEncoder().encode(
                `HTTP/1.1 200 OK\r\nContent-Length: ${new TextEncoder().encode(body).length}\r\n\r\n${body}`
            );
            return buffer.length;
        },
        close() {
            closed++;
        },
    };
};
Deno.startTls = async (connection, options) => {
    assert.equal(options.hostname, 'venue.example');
    return connection;
};
const inspected = await call('/discover', {
    url: 'https://venue.example/programme',
});
const discovered = await inspected.json();
assert.equal(inspected.status, 200, JSON.stringify(discovered));
assert.equal(discovered.candidates[0].embeddedAssignment, 'window.programme');
assert.equal(discovered.candidates[0].sample.films[0].title, 'Fixture film');
const hybrid = await call('/preview', {
    url: 'https://venue.example/api-films',
    mode: 'json',
    items: '$',
    cinema: { website: 'https://venue.example/' },
    timezone: 'Europe/Rome',
    title: { path: 'title.rendered', htmlText: true },
    filmUrl: { path: 'link' },
    director: { path: '' },
    poster: { path: '' },
    booking: { path: '' },
    details: { root: 'article', freshnessPath: 'modified', maxFilms: 20 },
    showings: '.date',
    start: { path: '$self' },
    date: { path: '' },
    dateFormat: "cccc d MMMM 'ore' HH.mm",
    dateLocale: 'it-IT',
    yearPolicy: 'nearby-weekday',
    splitScreeningLines: true,
});
const hybridResult = await hybrid.json();
assert.equal(hybrid.status, 200, JSON.stringify(hybridResult));
assert.equal(hybridResult.films, 1);
assert.equal(hybridResult.screenings, 1);
assert.ok(connections > 0);
assert.equal(closed, connections);
console.log(
    'PASS: Edge bundle starts, restores sessions, completes mocked OAuth, discovers embedded data and previews hybrid API/HTML screenings using native sockets with Node HTTP disabled (' +
        Math.round(performance.now() - began) +
        ' ms)'
);
