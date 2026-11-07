import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DateTime } from 'luxon';
import {
    brusselsTime,
    parseAventureProgramme,
    parseCinematekProgramme,
    parseNovaProgramme,
    parseRitcsProgramme,
    parseVendomeProgramme,
    parsePalaceFilm,
    palaceFilmLinks,
    vendomeDate,
} from '../scripts/providers/bruxelles';
import {
    parseCineBoutiqueProgramme,
    loadCineBoutiqueProgramme,
} from '../scripts/providers/cineBoutique';
import {
    parseUgcBelgiumProgramme,
    ugcPublishedDates,
    loadUgcBelgiumProgramme,
} from '../scripts/providers/ugcBelgium';
import { parseFlageyProgramme } from '../scripts/providers/flagey';
import { createProgrammeScraper } from '../scripts/programmeScraper';
import { BRUXELLES, bruxellesCinema } from '../scripts/venues/bruxelles';
import { CinemaShowingsSchema, type FilmShowings } from '../scripts/types';
import { cityZone } from '../src/lib/dates';
import { cinemaMapQuery } from '../src/lib/mapData';

const fixture = (name: string) =>
    readFile(new URL(`./fixtures/bruxelles/${name}`, import.meta.url), 'utf8');
const reference = DateTime.fromISO('2026-11-07', { zone: 'Europe/Brussels' });
const booking = 'https://bruxellescinemagaleries.cine.boutique';

test('captured official Bruxelles programmes parse and satisfy the shared scraper contract', async () => {
    const parsers: [
        keyof typeof BRUXELLES,
        string,
        (html: string) => FilmShowings[],
        number,
    ][] = [
        ['aventure', 'aventure.html', parseAventureProgramme, 3],
        ['cinematek', 'cinematek.html', parseCinematekProgramme, 5],
        ['nova', 'nova.html', parseNovaProgramme, 2],
        ['ritcs', 'ritcs.html', parseRitcsProgramme, 2],
        [
            'vendome',
            'vendome.html',
            (html) => parseVendomeProgramme(html, reference),
            1,
        ],
        [
            'palace',
            'palace.html',
            (html) =>
                parsePalaceFilm(
                    html,
                    'https://www.cinema-palace.be/films/wild-horse-nine/'
                ),
            9,
        ],
        [
            'ugcBrouckere',
            'ugc.html',
            (html) => parseUgcBelgiumProgramme(html, '2'),
            2,
        ],
        ['flagey', 'flagey.html', parseFlageyProgramme, 2],
    ];
    for (const [key, file, parser, count] of parsers) {
        const scraper = createProgrammeScraper({
            cinema: bruxellesCinema(key),
            load: () => fixture(file),
            parse: parser,
        });
        const [result] = CinemaShowingsSchema.parse(await scraper());
        assert.equal(
            result.showings.flatMap((film) => film.showings).length,
            count,
            key
        );
        assert.equal(result.cinema.location, 'Bruxelles');
        assert.ok(
            result.showings.every(
                (film) =>
                    film.film.title &&
                    film.showings.every((s) => s.bookingUrl?.startsWith('http'))
            )
        );
    }
});

test('Aventure carries explicit day headings through subsequent rows and decodes titles', async () => {
    const films = parseAventureProgramme(await fixture('aventure.html'));
    assert.equal(films[0].film.title, "Ken Russell's The Devils");
    assert.equal(films[0].showings[0].startTime, '2026-11-07T16:00:00.000Z');
    assert.equal(films[1].showings[0].startTime, '2026-11-07T16:00:00.000Z');
    assert.equal(films[1].showings[0].theatre, 'Salle 3');
    assert.throws(
        () =>
            parseAventureProgramme(
                '<table id="movieTable"><tr><td>19:00</td><td><a href="/catalogue/movie/?id">Film</a></td><td>Salle 1</td></tr></table>'
            ),
        /no date/
    );
});

test('Cinematek keeps double bills as a single programme and excludes other locations', async () => {
    const html = await fixture('cinematek.html');
    const films = parseCinematekProgramme(html);
    assert.ok(films.some((film) => film.film.title.includes(' + ')));
    assert.ok(
        films.every(
            (film) =>
                film.showings[0].theatre === 'Ledoux' ||
                film.showings[0].theatre === 'Plateau'
        )
    );
    assert.equal(
        parseCinematekProgramme(
            html.replace(/>\s*Ledoux\s*</g, '>Other venue<')
        ).length < films.length,
        true
    );
});

test('Nova uses full calendar headings, preserves programmes and excludes non-cinema activities', async () => {
    const html = await fixture('nova.html');
    const films = parseNovaProgramme(html);
    assert.equal(films[0].film.title, 'Bearcave');
    assert.equal(films[0].film.duration, 127);
    assert.equal(films[0].showings[0].startTime, '2026-10-29T18:00:00.000Z');
    assert.equal(films[1].film.duration, undefined); // A compilation must not inherit its first short's runtime.
    assert.equal(
        parseNovaProgramme(html.replace(/>\s*Film\s*</, '>Concert<')).length,
        1
    );
});

test('Palace uses screening datetime attributes, not publication or release dates', async () => {
    const films = parsePalaceFilm(
        await fixture('palace.html'),
        'https://www.cinema-palace.be/films/film/'
    );
    assert.equal(films[0].showings[0].startTime, '2026-11-07T20:20:00.000Z');
    assert.match(
        films[0].showings[0].bookingUrl!,
        /tickets\.cinema-palace\.be\/performance\//
    );
    assert.deepEqual(
        parsePalaceFilm(
            '<h1 class="m_article__title">Coming soon</h1>',
            'https://cinema.test/film'
        ),
        []
    );
    assert.deepEqual(
        palaceFilmLinks(
            '<div class="results_archive_films__wrapper"><article><h2 class="title"><a href="/films/one/">One</a></h2></article><article><h2 class="title"><a href="/nl/films/one/">One</a></h2></article></div>'
        ),
        ['https://www.cinema-palace.be/films/one/']
    );
});

test('Vendôme resolves year rollover only when the weekday matches and rejects stale dates', () => {
    const december = DateTime.fromISO('2026-12-29', {
        zone: 'Europe/Brussels',
    });
    assert.equal(vendomeDate('01 / 01', 'Vendredi', december), '2027-01-01');
    assert.equal(
        vendomeDate(
            '31 / 12',
            'Jeudi',
            DateTime.fromISO('2027-01-02', { zone: 'Europe/Brussels' })
        ),
        '2026-12-31'
    );
    assert.throws(
        () => vendomeDate('31 / 02', 'Jeudi', december),
        /ambiguous or stale/
    );
    assert.throws(
        () => vendomeDate('01 / 01', 'Lundi', december),
        /ambiguous or stale/
    );
});

test('Ciné Boutique joins by film ID, converts runtime seconds, and filters venue and school sessions', async () => {
    const source = JSON.parse(await fixture('cine-boutique.json'));
    const films = parseCineBoutiqueProgramme(
        source,
        'bruxellescinemagaleries',
        booking
    );
    assert.equal(films.length, 2);
    assert.equal(films[0].film.title, 'Pink Screens : Iván & Hadoum');
    assert.equal(films[0].showings[0].startTime, '2026-11-07T15:00:00.000Z');
    const media = source.movies.find(
        (m: { id: number }) => m.id === source.shows[0].mediaid.id
    );
    assert.equal(films[0].film.duration, media.duration / 60);
    source.shows.push(
        { ...source.shows[0], cinemaid: 'another-cinema' },
        { ...source.shows[0], school: true }
    );
    assert.equal(
        parseCineBoutiqueProgramme(source, 'bruxellescinemagaleries', booking)
            .length,
        2
    );
    assert.throws(
        () =>
            parseCineBoutiqueProgramme(
                { ...source, movies: [] },
                'bruxellescinemagaleries',
                booking
            ),
        /metadata missing/
    );
});

test('Ciné Boutique discovers the current public application token from its booking page', async (t) => {
    const urls: string[] = [];
    t.mock.method(globalThis, 'fetch', async (input: string | URL) => {
        urls.push(String(input));
        if (String(input) === booking)
            return new Response(
                '<meta name="api_token" content="public-app-token"><script src="https://bruxellescinemagaleries.cineoffice.fr/vad/client/build/static/js/main.js"></script>'
            );
        return Response.json([]);
    });
    await loadCineBoutiqueProgramme(booking);
    assert.equal(urls.length, 3);
    assert.ok(
        urls
            .slice(1)
            .every(
                (url) =>
                    new URL(url).searchParams.get('api_token') ===
                    'public-app-token'
            )
    );
});

test('UGC uses per-session full dates and venue IDs, with direct showing booking links', async () => {
    const html = await fixture('ugc.html');
    const films = parseUgcBelgiumProgramme(html, '2');
    assert.equal(films.length, 2);
    assert.ok(
        films.every((film) =>
            film.showings[0].bookingUrl?.includes('reservationSeances.html?id=')
        )
    );
    assert.deepEqual(parseUgcBelgiumProgramme(html, '1'), []);
    assert.deepEqual(
        ugcPublishedDates('initCalendarDate([20261231,20270101,20261231])'),
        ['2026-12-31', '2027-01-01']
    );
    assert.throws(
        () => ugcPublishedDates('initCalendarDate([20260230])'),
        /Invalid/
    );
});

test('UGC follows every advertised day including advance bookings', async (t) => {
    const html = await fixture('ugc.html');
    const days: string[] = [];
    t.mock.method(globalThis, 'fetch', async (input: string | URL) => {
        const url = new URL(input);
        if (url.pathname.endsWith('/cinema.html'))
            return new Response('initCalendarDate([20261107,20270206])');
        assert.equal(url.searchParams.get('cinemaId'), '2');
        days.push(url.searchParams.get('date')!);
        return new Response(html);
    });
    await loadUgcBelgiumProgramme('2');
    assert.deepEqual(days.sort(), ['2026-11-07', '2027-02-06']);
});

test('Flagey keeps cinema sessions and ignores concerts even on a mixed agenda', async () => {
    const html = await fixture('flagey.html');
    const films = parseFlageyProgramme(html);
    assert.equal(films[0].showings[0].startTime, '2026-11-07T18:00:00.000Z');
    assert.equal(films[0].showings[0].theatre, 'Studio 5');
    assert.equal(
        parseFlageyProgramme(
            html +
                '<a data-production-type="concert" data-event-start="2026-11-07 20:00:00"></a>'
        ).length,
        films.length
    );
});

test('Bruxelles calendars reject maintenance HTML and invalid dates rather than producing empty programmes', () => {
    for (const parser of [
        parseAventureProgramme,
        parseRitcsProgramme,
        parseNovaProgramme,
        parseCinematekProgramme,
        parseVendomeProgramme,
        parseFlageyProgramme,
    ])
        assert.throws(() => parser('<html><h1>Maintenance</h1></html>'));
    assert.throws(() => brusselsTime('2026-02-30 20:00', 'yyyy-MM-dd HH:mm'));
    assert.equal(
        brusselsTime('2026-07-01 20:30', 'yyyy-MM-dd HH:mm'),
        '2026-07-01T18:30:00.000Z'
    );
});

test('all new Bruxelles venues have map coordinates and the correct local timezone', () => {
    const cinemas = Object.keys(BRUXELLES).map((key) =>
        bruxellesCinema(key as keyof typeof BRUXELLES)
    );
    assert.equal(cinemas.length, 10);
    assert.ok(
        cinemas.every(
            (c) =>
                Number(c.coordinates!.lat) > 50.8 &&
                Number(c.coordinates!.lat) < 50.9 &&
                Number(c.coordinates!.lng) > 4.3 &&
                Number(c.coordinates!.lng) < 4.4
        )
    );
    assert.equal(cityZone('Bruxelles'), 'Europe/Brussels');
    assert.equal(cityZone('Brussels'), 'Europe/Brussels');
    assert.ok(
        cinemaMapQuery(
            'Bruxelles',
            cinemas.map((cinema) => ({ coordinates: cinema.coordinates! }))
        )
    );
});
