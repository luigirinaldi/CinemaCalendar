import test from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { cinemaDate, upcomingDate } from '../scripts/dates';
import { fetchPage, mapConcurrent } from '../scripts/http';
import { parseLuxEvents } from '../scripts/cinemas/luxCinema';
import { parsePortoEvents } from '../scripts/cinemas/fronteDelPortoCinema';
import { ShowingSchema } from '../scripts/types';

test('cinema timezone is independent of host; explicit offsets are respected', () => {
    assert.equal(
        cinemaDate('2026-07-01 20:30:00', 'Europe/Rome'),
        '2026-07-01T18:30:00.000Z'
    );
    assert.equal(
        cinemaDate('2026-07-01T20:30:00Z', 'Europe/Rome'),
        '2026-07-01T20:30:00.000Z'
    );
    assert.throws(() => cinemaDate('bad date', 'Europe/London'));
});
test('Prince Charles rollover and noon/midnight', () => {
    const now = DateTime.fromISO('2026-12-20', { zone: 'Europe/London' });
    assert.equal(
        upcomingDate('Friday 1 January', '12:00 am', now).toISO(),
        '2027-01-01T00:00:00.000+00:00'
    );
    assert.equal(upcomingDate('Sunday 20 December', '12:00 pm', now).hour, 12);
    assert.equal(
        upcomingDate('Saturday 19 December', '8:30 pm', now).year,
        2026
    );
});
test('Lux handles absent metadata/images and does not merge missing website keys', () => {
    const films = parseLuxEvents(
        [1, 2].map((id) => ({
            id,
            title: `Film ${id}`,
            website: '',
            url: `https://cinema.test/${id}`,
            start_date: '2026-07-01 20:00:00',
            image: false as const,
        }))
    );
    assert.equal(films.length, 2);
    assert.equal(films[0].showings[0].startTime, '2026-07-01T18:00:00.000Z');
    assert.equal(films[0].film.duration, undefined);
});
test('Fronte del Porto reads all ACF slots and correct booking URL; ignores non-cinema events', () => {
    const event = {
        id: 1,
        link: 'https://cinema.test/film',
        title: { rendered: 'Film &amp; title' },
        class_list: ['categoria_evento-cinema'],
        acf: {
            data_programmazione: '20261105',
            ora_programmazione: '18:30:00',
            data_programmazione_2: '20261108',
            ora_programmazione_2: '20:30:00',
            data_programmazione_3: null,
            link_prenotazione: {
                url: 'https://www.liveticket.it/frontedelporto',
            },
            caratteristica_evento: "Drammatico, Italia, 2026, 86'",
        },
    };
    const films = parsePortoEvents([
        event,
        { ...event, class_list: ['categoria_evento-teatro'] },
    ]);
    assert.equal(films.length, 1);
    assert.equal(films[0].showings.length, 2);
    assert.equal(films[0].film.title, 'Film & title');
    assert.equal(films[0].film.duration, 86);
    assert.equal(films[0].showings[0].startTime, '2026-11-05T17:30:00.000Z');
    assert.match(films[0].showings[0].bookingUrl!, /frontedelporto/);
});
test('schema rejects invalid and timezone-free screening times', () => {
    assert.equal(
        ShowingSchema.safeParse({ startTime: 'invalid' }).success,
        false
    );
    assert.equal(
        ShowingSchema.safeParse({ startTime: '2026-10-30T20:30:00' }).success,
        false
    );
    assert.equal(
        ShowingSchema.safeParse({ startTime: '2026-10-30T20:30:00+01:00' })
            .success,
        true
    );
});

test('The Space uses the API offset timestamp instead of the unzoned display time', async (t) => {
    const { scraper } = await import('../scripts/cinemas/theSpaceCinema');
    t.mock.method(globalThis, 'fetch', async (input: string | URL) =>
        String(input).includes('/api/microservice/')
            ? new Response(
                  JSON.stringify({
                      result: [
                          {
                              filmTitle: 'Test film',
                              filmId: '123',
                              showingGroups: [
                                  {
                                      sessions: [
                                          {
                                              startTime: '2026-07-01T20:00:00',
                                              showTimeWithTimeZone:
                                                  '2026-07-01T21:00:00+02:00',
                                              attributes: [],
                                              bookingUrl: '/book/123',
                                          },
                                      ],
                                  },
                              ],
                          },
                      ],
                  })
              )
            : new Response('', {
                  headers: { 'set-cookie': 'microservicesToken=test;' },
              })
    );
    const result = await scraper();
    assert.equal(
        result[0].showings[0].showings[0].startTime,
        '2026-07-01T19:00:00.000Z'
    );
    assert.equal(
        result[0].showings[0].showings[0].bookingUrl,
        'https://www.thespacecinema.it/book/123'
    );
});
test('HTTP retries transient failures but fails immediately on 404', async (t) => {
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async () => {
        calls++;
        return calls === 1
            ? new Response('', { status: 503, headers: { 'Retry-After': '0' } })
            : new Response('ok');
    });
    assert.equal(await (await fetchPage('https://cinema.test/')).text(), 'ok');
    assert.equal(calls, 2);
    t.mock.restoreAll();
    calls = 0;
    t.mock.method(globalThis, 'fetch', async () => {
        calls++;
        return new Response('', { status: 404 });
    });
    await assert.rejects(fetchPage('https://cinema.test/'), /HTTP 404/);
    assert.equal(calls, 1);
});
test('detail page concurrency is bounded and results preserve ordering', async () => {
    let active = 0,
        peak = 0;
    const result = await mapConcurrent(
        [1, 2, 3, 4, 5],
        async (item) => {
            active++;
            peak = Math.max(peak, active);
            await new Promise((resolve) => setTimeout(resolve, 5));
            active--;
            return item * 2;
        },
        2
    );
    assert.deepEqual(result, [2, 4, 6, 8, 10]);
    assert.equal(peak, 2);
});

for (const classification of [
    { event_type: ['101'] },
    { slot_tag: 'Cinema' },
]) {
    test(`Riverside discovers its stream and booking links with ${Object.keys(classification)[0]}`, async (t) => {
        const { scraper } = await import(
            '../scripts/cinemas/riversideStudiosCinema'
        );
        const requested: string[] = [];
        t.mock.method(globalThis, 'fetch', async (input: string | URL) => {
            requested.push(String(input));
            if (requested.length === 1)
                return new Response(
                    "var _filter_streaming = {data_url: 'https://riversidestudios.co.uk/ajax/filter_stream/new-id/'};"
                );
            return new Response(
                JSON.stringify([
                    {
                        title: 'Test film',
                        url: 'https://riversidestudios.co.uk/whats-on/test/',
                        duration: '82 minutes',
                        ...classification,
                        performances: {
                            day: [
                                {
                                    timestamp: '1793559600',
                                    html: '<a href="https://riversidestudios.co.uk/seats/123/">Book</a>',
                                },
                            ],
                        },
                    },
                ])
            );
        });
        const result = await scraper();
        assert.match(requested[1], /filter_stream\/new-id\//);
        assert.equal(result[0].showings[0].film.duration, 82);
        assert.equal(
            result[0].showings[0].showings[0].bookingUrl,
            'https://riversidestudios.co.uk/seats/123/'
        );
    });
}

test('Fronte del Porto skips unpublished times without inventing showings', (t) => {
    t.mock.method(console, 'warn', () => {});
    const films = parsePortoEvents([
        {
            id: 1,
            link: 'https://example.org/film',
            title: { rendered: 'Film' },
            class_list: ['categoria_evento-cinema'],
            acf: {
                data_programmazione: '20270312',
                ora_programmazione: null,
                data_programmazione_2: '20270313',
                ora_programmazione_2: '20:00:00',
            },
        },
    ]);
    assert.equal(films[0].showings.length, 1);
    assert.equal(films[0].showings[0].startTime, '2027-03-13T19:00:00.000Z');
});
