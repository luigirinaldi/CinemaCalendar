import test from 'node:test';
import assert from 'node:assert/strict';
import {
    parseLightProgramme,
    loadLightProgramme,
} from '../scripts/providers/light';
import {
    parsePicturehouseProgramme,
    loadPicturehouseProgramme,
} from '../scripts/providers/picturehouse';
import {
    parseEverymanProgramme,
    loadEverymanProgramme,
} from '../scripts/providers/everyman';
import { createProgrammeScraper, plainText } from '../scripts/programmeScraper';

test('API title decoding preserves literal angle brackets', () => {
    assert.equal(
        plainText('Stray Kids <RUN IT> &amp; friends'),
        'Stray Kids <RUN IT> & friends'
    );
});

const website = 'https://cinema.test';
const light = (key = '20260701', time = '2030') => ({
    Schedule: [
        {
            ID: 1,
            Title: 'Film &amp; title',
            Url: '/film',
            Runtime: '2h 5m',
            Dates: [{ Key: key, Sessions: [{ Sort: time, Url: '' }] }],
        },
    ],
});
const lightBody = (value: unknown) =>
    `'use strict';\nvar __gfminiguidedata = ${JSON.stringify(value)};\nif(window.gfdx) window.gfdx("MINIGUIDEDATA");`;

test('Light decodes its data wrapper without execution, handles BST and runtime', () => {
    const [film] = parseLightProgramme(lightBody(light()), website);
    assert.equal(film.film.title, 'Film & title');
    assert.equal(film.film.duration, 125);
    assert.equal(film.showings[0].startTime, '2026-07-01T19:30:00.000Z');
    assert.equal(film.showings[0].bookingUrl, 'https://cinema.test/film');
    assert.equal(
        parseLightProgramme(lightBody(light('20270101', '0010')), website)[0]
            .showings[0].startTime,
        '2027-01-01T00:10:00.000Z'
    );
    assert.throws(
        () => parseLightProgramme(lightBody(light('20260230')), website),
        /Invalid Light/
    );
    assert.equal(
        parseLightProgramme(lightBody(light()) + '\nthrow new Error()', website)
            .length,
        1
    );
    assert.throws(() => parseLightProgramme(lightBody({}), website));
    assert.deepEqual(
        parseLightProgramme(lightBody({ Schedule: [] }), website),
        []
    );
});

test('Light discovers the current feed URL and fails when its source disappears', async (t) => {
    const urls: string[] = [];
    t.mock.method(globalThis, 'fetch', async (input: string | URL) => {
        urls.push(String(input));
        return new Response(
            urls.length === 1
                ? '<script src="/resource/services/miniguide/data.ashx?d=changed"></script>'
                : lightBody(light())
        );
    });
    assert.equal(await loadLightProgramme(website), lightBody(light()));
    assert.equal(
        urls[1],
        'https://cinema.test/resource/services/miniguide/data.ashx?d=changed'
    );
    t.mock.method(
        globalThis,
        'fetch',
        async () => new Response('<h1>Maintenance</h1>')
    );
    await assert.rejects(loadLightProgramme(website), /missing/);
});

const picturehouse = {
    response: 'success',
    movies: [
        {
            ScheduledFilmId: 'HO123',
            Title: 'Film',
            CinemaId: 'OTHER',
            RunTime: '95',
            show_times: [
                {
                    CinemaId: 'OTHER',
                    SessionId: 'wrong',
                    Showtime: '2026-07-01T20:30:00',
                },
                {
                    CinemaId: '002',
                    SessionId: 'right',
                    Showtime: '2026-07-01T20:30:00',
                    IsAllocatedSeating: false,
                    ScreenName: 'Screen 2',
                },
            ],
        },
    ],
};

test('Picturehouse filters individual sessions, uses London time and the right booking route', () => {
    const [film] = parsePicturehouseProgramme(picturehouse, '002', website);
    assert.equal(film.showings.length, 1);
    assert.equal(film.showings[0].startTime, '2026-07-01T19:30:00.000Z');
    assert.equal(
        film.showings[0].bookingUrl,
        'https://web.picturehouses.com/order/showtimes/002-right/tickets'
    );
    assert.equal(film.showings[0].theatre, 'Screen 2');
    assert.equal(film.film.duration, 95);
    assert.throws(() =>
        parsePicturehouseProgramme(
            { response: 'failure', movies: [] },
            '002',
            website
        )
    );
    assert.deepEqual(
        parsePicturehouseProgramme(
            { response: 'success', movies: [] },
            '002',
            website
        ),
        []
    );
});

test('Picturehouse requests all published dates using its read-only listings POST', async (t) => {
    t.mock.method(
        globalThis,
        'fetch',
        async (_input: unknown, init?: RequestInit) => {
            assert.equal(init?.method, 'POST');
            assert.equal(
                String(init?.body),
                'cinema_id=002&start_date=show_all_dates'
            );
            return Response.json(picturehouse);
        }
    );
    await loadPicturehouseProgramme('002');
});

test('date-only API fields cannot become invented midnight screenings', () => {
    const source = structuredClone(picturehouse);
    source.movies[0].show_times[1].Showtime = '2026-07-01';
    assert.throws(() => parsePicturehouseProgramme(source, '002', website));
    const everyman = structuredClone(everySource);
    everyman.schedule.G02AM.schedule['123']['2026-07-01'][0].startsAt =
        '2026-07-01';
    assert.throws(() => parseEverymanProgramme(everyman, 'G02AM', website));
});

const everySession = {
    id: 's1',
    startsAt: '2026-07-01T20:30:00',
    screen: { name: 'Screen 1' },
    data: {
        ticketing: [{ provider: 'default', urls: ['https://book.test/1'] }],
    },
};
const everySource = {
    schedule: {
        G02AM: { schedule: { '123': { '2026-07-01': [everySession] } } },
    },
    movies: [
        {
            id: '123',
            title: 'Film',
            runtime: 7200,
            direction: ['Director One', 'Director Two'],
        },
    ],
};

test('Everyman joins schedule to metadata, converts runtime seconds and preserves explicit offsets', () => {
    const [film] = parseEverymanProgramme(everySource, 'G02AM', website);
    assert.equal(film.film.duration, 120);
    assert.equal(film.film.director, 'Director One, Director Two');
    assert.equal(film.film.url, website);
    assert.equal(film.showings[0].startTime, '2026-07-01T19:30:00.000Z');
    assert.equal(film.showings[0].bookingUrl, 'https://book.test/1');
    const source = structuredClone(everySource);
    source.schedule.G02AM.schedule['123']['2026-07-01'][0].startsAt =
        '2026-07-01T20:30:00+02:00';
    assert.equal(
        parseEverymanProgramme(source, 'G02AM', website)[0].showings[0]
            .startTime,
        '2026-07-01T18:30:00.000Z'
    );
    assert.throws(
        () =>
            parseEverymanProgramme(
                { ...everySource, movies: [] },
                'G02AM',
                website
            ),
        /metadata missing/
    );
    assert.throws(
        () =>
            parseEverymanProgramme(
                { ...everySource, schedule: {} },
                'G02AM',
                website
            ),
        /missing theater/
    );
});

test('Everyman discovers advance booking dates instead of limiting to a week', async (t) => {
    const urls: URL[] = [];
    t.mock.method(globalThis, 'fetch', async (input: string | URL) => {
        const url = new URL(input);
        urls.push(url);
        if (url.pathname.endsWith('/scheduledMovies'))
            return Response.json({
                scheduledDays: { '123': ['2026-07-01', '2027-06-05'] },
            });
        if (url.pathname.endsWith('/schedule')) {
            assert.equal(url.searchParams.get('to'), '2027-06-06T03:00:00');
            return Response.json(everySource.schedule);
        }
        return Response.json(everySource.movies);
    });
    const source = await loadEverymanProgramme('G02AM');
    assert.equal(parseEverymanProgramme(source, 'G02AM', website).length, 1);
    assert.deepEqual(urls[2].searchParams.getAll('ids'), ['123']);
});

test('standard scraper merges duplicates, keeps different films sharing a URL, and propagates failures', async () => {
    const first = {
        film: { title: 'Film 1', url: website },
        showings: [
            { startTime: '2026-07-01T20:00:00Z', theatre: '1' },
            { startTime: '2026-07-01T20:00:00Z', theatre: '2' },
        ],
    };
    const cinema = {
        name: 'Test',
        location: 'Cambridge',
        defaultLanguage: 'en-GB',
    };
    const scraper = createProgrammeScraper({
        cinema,
        load: async () => [
            first,
            first,
            { ...first, film: { title: 'Film 2', url: website } },
        ],
        parse: (source) => source,
    });
    const [result] = await scraper();
    assert.equal(result.showings.length, 2);
    assert.equal(result.showings[0].showings.length, 2);
    assert.equal(first.showings.length, 2);
    await assert.rejects(
        createProgrammeScraper({
            cinema,
            load: async () => {
                throw new Error('offline');
            },
            parse: () => [],
        })(),
        /offline/
    );
});
