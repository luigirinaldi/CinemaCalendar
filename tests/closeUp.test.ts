import test from 'node:test';
import assert from 'node:assert/strict';
import { scraper } from '../scripts/cinemas/closeUpCinema';
import { CinemaShowingsSchema } from '../scripts/types';
import { chromium } from 'playwright-chromium';

const base = 'https://www.closeupfilmcentre.com';
test('Close-Up reports a blocked calendar instead of returning an empty programme', async (t) => {
    t.mock.method(chromium, 'launch', async () => {
        throw new Error('Calendar also blocked in browser');
    });
    t.mock.method(
        globalThis,
        'fetch',
        async () => new Response('', { status: 403 })
    );
    await assert.rejects(scraper(), /Calendar access denied \(HTTP 403\)/);
});

function listing(
    shows: { title: string | null; film_url: string; show_time?: string }[]
) {
    return `<script>var shows ='${JSON.stringify(
        shows.map((show) => ({
            show_time: '2026-11-15 18:00:00',
            blink: 'https://www.ticketsource.com/close-up-cinema/t-test',
            ...show,
        }))
    )}';</script>`;
}

test('Close-Up falls back to a browser for a blocked calendar and closes it', async (t) => {
    let closed = false;
    t.mock.method(globalThis, 'fetch', async (input: string | URL) =>
        String(input).endsWith('/search_film_programmes/')
            ? new Response('', { status: 403 })
            : new Response('<title>CLOSE-UP | Test film</title>')
    );
    const browser = {
        newPage: async () => ({
            goto: async () => {},
            content: async () =>
                listing([{ title: 'Test film', film_url: '/test' }]),
        }),
        close: async () => {
            closed = true;
        },
    };
    t.mock.method(chromium, 'launch', async () => browser);
    const result = CinemaShowingsSchema.parse(await scraper());
    assert.equal(result[0].showings[0].film.title, 'Test film');
    assert.equal(closed, true);
});

test('Close-Up recovers missing/partial titles and merges screenings using decoded detail metadata', async (t) => {
    const requested: string[] = [];
    t.mock.method(globalThis, 'fetch', async (input: string | URL) => {
        const url = String(input);
        requested.push(url);
        if (url.endsWith('/search_film_programmes/'))
            return new Response(
                listing([
                    { title: null, film_url: '/house' },
                    {
                        title: 'Stalker',
                        film_url: '/stalker',
                        show_time: '2026-07-06 20:15:00',
                    },
                    {
                        title: 'alker',
                        film_url: '/stalker',
                        show_time: '2026-11-27 20:15:00',
                    },
                    { title: 'Moi-m&Atilde;&ordf;me', film_url: '/moi' },
                ])
            );
        const paragraphs: Record<string, string> = {
            '/house': `<strong>The Filmmaker's House<br /></strong>Marc Isaacs, 2021, 75 min`,
            '/stalker':
                '<strong><a>Stalker</a><br /></strong><a>Andrei Tarkovsky</a>, 1979, 163 min',
            '/moi': '<strong>Moi-m&ecirc;me<br /></strong>Mojo Lorwin, 2026, 80 min',
        };
        return new Response(
            `<div id="film_program_support"><p><img src="/download_file/view_inline/123/" /></p><p>${paragraphs[new URL(url).pathname]}</p></div>`
        );
    });
    const [cinema] = CinemaShowingsSchema.parse(await scraper());
    assert.equal(cinema.showings.length, 3);
    const house = cinema.showings[0];
    assert.equal(house.film.title, "The Filmmaker's House");
    assert.equal(house.film.director, 'Marc Isaacs');
    assert.equal(house.film.year, 2021);
    assert.equal(house.film.duration, 75);
    assert.equal(house.film.coverUrl, `${base}/download_file/view_inline/123/`);
    assert.equal(
        house.showings[0].bookingUrl,
        'https://www.ticketsource.com/close-up-cinema/t-test'
    );
    const stalker = cinema.showings[1];
    assert.equal(stalker.film.title, 'Stalker');
    assert.equal(stalker.showings.length, 2);
    assert.equal(
        stalker.showings[0].startTime,
        '2026-07-06T20:15:00.000+01:00'
    );
    assert.equal(
        stalker.showings[1].startTime,
        '2026-11-27T20:15:00.000+00:00'
    );
    assert.equal(
        requested.filter((url) => url === `${base}/stalker`).length,
        1
    );
    assert.equal(cinema.showings[2].film.title, 'Moi-même');
});

test('Close-Up preserves distinct programme sessions and uses the page title when metadata is absent', async (t) => {
    t.mock.method(globalThis, 'fetch', async (input: string | URL) => {
        const url = String(input);
        if (url.endsWith('/search_film_programmes/'))
            return new Response(
                listing([
                    {
                        title: 'Experimental Film Section',
                        film_url: '/festival',
                    },
                    {
                        title: 'Innovative Short Film Section',
                        film_url: '/festival',
                    },
                    { title: null, film_url: '/jenny' },
                ])
            );
        return new Response(
            url.endsWith('/festival')
                ? '<title>CLOSE-UP | Festival</title><div id="film_program_support"><p><strong>One</strong>Director One, 2026, 5 min</p><p><strong>Two</strong>Director Two, 2026, 8 min</p></div>'
                : '<title>CLOSE-UP | Experimental Cinema: Jenny Baines &amp; guests</title><div id="film_program_support"><p>Programme introduction</p></div>'
        );
    });
    const [cinema] = CinemaShowingsSchema.parse(await scraper());
    assert.deepEqual(
        cinema.showings.map((f) => f.film.title),
        [
            'Experimental Film Section',
            'Innovative Short Film Section',
            'Experimental Cinema: Jenny Baines & guests',
        ]
    );
    assert.ok(cinema.showings.every((f) => f.film.duration === undefined));
});

test('Close-Up retains titled listings on detail failure and skips only unrecoverable titles', async (t) => {
    t.mock.method(console, 'error', () => {});
    t.mock.method(console, 'warn', () => {});
    t.mock.method(globalThis, 'fetch', async (input: string | URL) => {
        if (String(input).endsWith('/search_film_programmes/'))
            return new Response(
                listing([
                    { title: 'Available &amp; titled', film_url: '/missing' },
                    { title: null, film_url: '/missing' },
                ])
            );
        return new Response('', { status: 404 });
    });
    const [cinema] = CinemaShowingsSchema.parse(await scraper());
    assert.equal(cinema.showings.length, 1);
    assert.equal(cinema.showings[0].film.title, 'Available & titled');
});
