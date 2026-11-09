import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DateTime } from 'luxon';
import { CinemaShowingsSchema } from '../scripts/types';
import {
    loadPiccoloProgramme,
    parsePiccoloProgramme,
    parsePiccoloFilm,
    piccoloScreeningDate,
} from '../scripts/providers/piccoloTeatro';
import type { fetchPage } from '../scripts/http';

const reference = DateTime.fromISO('2026-11-09T12:00:00', {
    zone: 'Europe/Rome',
});
const fixture = (name: string) =>
    readFileSync(
        new URL(`./fixtures/piccolo/${name}`, import.meta.url),
        'utf8'
    );
const posts = JSON.parse(fixture('posts.json'));
const anne = posts.find((post: { id: number }) => post.id === 24723);
const header = (text: string) =>
    `<article class="post-${anne.id} category-cinema"><header><h1 class="entry-title">Il tempo di Anne</h1><div class="data-evento"><p>${text}</p></div></header></article>`;

test('captured Piccolo API metadata and HTML dates yield 10 films and 13 real screenings', () => {
    const films = parsePiccoloProgramme({
        category: 2,
        reference: reference.toISO()!,
        entries: posts.map((post: { id: number }) => ({
            post,
            html: fixture(`${post.id}.html`),
        })),
    });
    assert.equal(films.length, 10);
    assert.equal(
        films.reduce((count, film) => count + film.showings.length, 0),
        13
    );
    const film = films.find((film) => film.film.title === 'Il tempo di Anne')!;
    assert.deepEqual(
        film.showings.map((showing) => showing.startTime),
        ['2026-11-07T17:45:00.000Z', '2026-11-08T20:15:00.000Z']
    );
    assert.equal(
        film.film.url,
        'https://www.piccolo-padova.it/il-tempo-di-anne/'
    );
    assert.match(film.film.coverUrl!, /tempo-anne\.jpg$/);
    assert.ok(
        film.showings.every(
            (showing) =>
                showing.bookingUrl ===
                'https://www.liveticket.it/piccoloteatropadova'
        )
    );
    assert.equal(
        films.find((film) => film.film.title === 'Un po’ di luce')?.showings[0]
            .startTime,
        '2026-11-18T20:00:00.000Z'
    );
    assert.equal(
        CinemaShowingsSchema.safeParse([
            {
                cinema: {
                    name: 'Piccolo Teatro Padova',
                    location: 'Padova',
                    defaultLanguage: 'it-IT',
                },
                showings: films,
            },
        ]).success,
        true
    );
});

test('Piccolo reads separate Italian dates/times once, tolerates dash/colon typography, and never uses API publication time', () => {
    const film = parsePiccoloFilm(
        anne,
        header(
            'venerdì 6 novembre – ore 21.15<br>venerdì 6 novembre – ore 21.15<br> sabato 7 novembre alle 18:45'
        ),
        reference
    );
    assert.deepEqual(
        film.showings.map((showing) => showing.startTime),
        ['2026-11-06T20:15:00.000Z', '2026-11-07T17:45:00.000Z']
    );
    assert.equal(
        film.showings.some((showing) => showing.startTime.includes('09:27')),
        false
    );
    const html = header('sabato 7 novembre ore 18.45').replace(
        '</article>',
        '<a href="https://www.liveticket.it/evento.aspx?Id=123">Biglietti</a></article>'
    );
    assert.equal(
        parsePiccoloFilm(anne, html, reference).showings[0].bookingUrl,
        'https://www.liveticket.it/evento.aspx?Id=123'
    );
});

test('Piccolo resolves year rollover only with a matching weekday and rejects stale posts, invalid dates and DST ambiguity', () => {
    const nearYearEnd = DateTime.fromISO('2026-12-31T12:00:00', {
        zone: 'Europe/Rome',
    });
    assert.equal(
        parsePiccoloFilm(
            anne,
            header('venerdì 1 gennaio ore 00.30'),
            nearYearEnd
        ).showings[0].startTime,
        '2026-12-31T23:30:00.000Z'
    );
    assert.throws(
        () =>
            parsePiccoloFilm(
                anne,
                header('giovedì 1 gennaio ore 00.30'),
                nearYearEnd
            ),
        /inconsistent/
    );
    assert.throws(
        () =>
            parsePiccoloFilm(
                {
                    ...anne,
                    date: '2020-11-01T09:00:00',
                    modified: '2020-11-01T09:00:00',
                },
                header('sabato 7 novembre ore 18.45'),
                reference
            ),
        /stale post/
    );
    assert.throws(
        () => piccoloScreeningDate(30, 2, 'lunedi', 20, 0, reference),
        /inconsistent/
    );
    assert.throws(
        () =>
            piccoloScreeningDate(
                29,
                3,
                'domenica',
                2,
                30,
                DateTime.fromISO('2026-03-29', { zone: 'Europe/Rome' }),
                2026
            ),
        /inconsistent/
    );
    assert.throws(
        () => piccoloScreeningDate(25, 10, 'domenica', 2, 30, reference, 2026),
        /inconsistent/
    );
});

test('Piccolo refuses changed/missing schedules and partial time matches instead of inventing sessions', () => {
    for (const text of [
        'venerdì 6 novembre',
        'venerdì 6 novembre ore 21.15 e 22.30',
        'tutti i venerdì ore 21.15',
        'venerdì 6 novembre ore 24.00',
        'sabato 6 novembre ore 21.15',
    ])
        assert.throws(
            () => parsePiccoloFilm(anne, header(text), reference),
            /Piccolo Teatro/,
            text
        );
    assert.throws(
        () => parsePiccoloFilm(anne, '<h1>Maintenance</h1>', reference),
        /missing or changed/
    );
    assert.throws(
        () =>
            parsePiccoloFilm(
                anne,
                header('sabato 7 novembre ore 18.45').replace(
                    'post-24723',
                    'post-999'
                ),
                reference
            ),
        /missing or changed/
    );
    assert.throws(
        () =>
            parsePiccoloFilm(
                anne,
                header('sabato 7 novembre ore 18.45').replace(
                    'Il tempo di Anne',
                    'A different film'
                ),
                reference
            ),
        /missing or changed/
    );
});

test('Piccolo follows all API pages, discovers the Cinema category, excludes theatre posts and bounds detail concurrency', async () => {
    const requests: string[] = [];
    let active = 0;
    let peak = 0;
    const get: typeof fetchPage = async (input) => {
        const url = new URL(input);
        requests.push(url.href);
        if (url.pathname.endsWith('/categories'))
            return Response.json([
                { id: 77, slug: 'cinema' },
                { id: 3, slug: 'teatro' },
            ]);
        if (url.pathname.endsWith('/posts')) {
            assert.equal(url.searchParams.get('categories'), '77');
            const first = Number(url.searchParams.get('page')) === 1;
            const rows = first
                ? posts
                      .slice(0, 3)
                      .map((post: object) => ({ ...post, categories: [77] }))
                : [{ ...anne, categories: [3] }];
            return Response.json(rows, {
                headers: { 'x-wp-totalpages': '2', 'x-wp-total': '4' },
            });
        }
        active++;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active--;
        const post = posts.find(
            (post: { link: string }) => post.link === url.href
        );
        return new Response(fixture(`${post.id}.html`));
    };
    const source = await loadPiccoloProgramme({ fetch: get, reference });
    assert.equal(source.category, 77);
    assert.equal(source.entries.length, 3);
    assert.equal(parsePiccoloProgramme(source).length, 3);
    assert.equal(
        requests.some((url) => url === anne.link),
        false,
        'a theatre-classified post is not fetched'
    );
    assert.ok(peak <= 2);
    assert.equal(peak, 2);
});

test('Piccolo fails closed on missing pagination, partial totals and a failed detail page; explicit empty API is valid', async () => {
    const category = () => Response.json([{ id: 2, slug: 'cinema' }]);
    const missingPages: typeof fetchPage = async (input) =>
        new URL(input).pathname.endsWith('/categories')
            ? category()
            : Response.json([anne]);
    await assert.rejects(
        loadPiccoloProgramme({ fetch: missingPages, reference }),
        /page count/
    );
    const partial: typeof fetchPage = async (input) =>
        new URL(input).pathname.endsWith('/categories')
            ? category()
            : Response.json([anne], {
                  headers: { 'x-wp-totalpages': '1', 'x-wp-total': '2' },
              });
    await assert.rejects(
        loadPiccoloProgramme({ fetch: partial, reference }),
        /complete film list/
    );
    const failed: typeof fetchPage = async (input) =>
        new URL(input).pathname.endsWith('/categories')
            ? category()
            : new URL(input).pathname.endsWith('/posts')
              ? Response.json([anne], { headers: { 'x-wp-totalpages': '1' } })
              : new Response('Access denied', { status: 403 });
    await assert.rejects(
        loadPiccoloProgramme({ fetch: failed, reference }),
        /24723 HTTP 403/
    );
    const empty: typeof fetchPage = async (input) =>
        new URL(input).pathname.endsWith('/categories')
            ? category()
            : Response.json([], {
                  headers: { 'x-wp-totalpages': '0', 'x-wp-total': '0' },
              });
    assert.deepEqual(
        parsePiccoloProgramme(
            await loadPiccoloProgramme({ fetch: empty, reference })
        ),
        []
    );
});
