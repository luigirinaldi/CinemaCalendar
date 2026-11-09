import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DateTime } from 'luxon';
import { emptyConfig, type ScraperConfig } from '../shared/scraperConfig';
import { parseScreeningTime } from '../shared/scraperValues';
import {
    captureConfiguredDetails,
    parseConfiguredProgramme,
    readHybridCapture,
    runConfiguredScraper,
} from '../scripts/configuredScraper';
import { generateFiles } from '../scripts/builder/generate';
import { suggestJsonMapping } from '../src/builder/mapping';

const fixture = (name: string) =>
    readFileSync(
        new URL(`./fixtures/piccolo/${name}`, import.meta.url),
        'utf8'
    );
const posts = JSON.parse(fixture('posts.json'));
const reference = DateTime.fromISO('2026-11-09T12:00:00Z');
const config: ScraperConfig = {
    ...emptyConfig(
        'https://www.piccolo-padova.it/wp-json/wp/v2/posts?categories=2'
    ),
    ...suggestJsonMapping(posts),
    filename: 'piccoloHelperCinema.ts',
    cinema: {
        name: 'Piccolo helper example',
        location: 'Padova',
        website: 'https://www.piccolo-padova.it/',
        defaultLanguage: 'it-IT',
        coordinates: { lat: '45.3827253', lng: '11.8520657' },
    },
    timezone: 'Europe/Rome',
    details: { root: 'article', freshnessPath: 'modified', maxFilms: 20 },
    showings: 'header .data-evento p',
    start: { path: '$self', attribute: '' },
    date: { path: '', attribute: '' },
    booking: { path: '', attribute: '' },
    dateFormat: "cccc d MMMM 'ore' HH.mm",
    dateLocale: 'it-IT',
    yearPolicy: 'nearby-weekday',
    splitScreeningLines: true,
};
const detailFetch = async (url: string) => {
    const post = posts.find((post: { link: string }) => post.link === url);
    assert.ok(post, `Unexpected detail request: ${url}`);
    return new Response(fixture(`${post.id}.html`));
};

test('the generic helper maps Piccolo metadata, follows film HTML and reads every yearless screening line', async () => {
    assert.equal(config.title.path, 'title.rendered');
    assert.equal(config.title.htmlText, true);
    assert.equal(config.poster.path, 'rttpg_featured_image_url.full.0');
    const captured = await captureConfiguredDetails(
        config,
        JSON.stringify(posts),
        detailFetch,
        reference
    );
    const films = parseConfiguredProgramme(config, captured)[0].showings;
    assert.equal(films.length, 10);
    assert.equal(
        films.reduce((count, film) => count + film.showings.length, 0),
        13
    );
    assert.equal(
        films.find((film) => film.film.title === 'Un po’ di luce')?.showings[0]
            .startTime,
        '2026-11-18T20:00:00.000Z'
    );
    assert.deepEqual(
        films
            .find((film) => film.film.title === 'Il tempo di Anne')
            ?.showings.map((showing) => showing.startTime),
        ['2026-11-07T17:45:00.000Z', '2026-11-08T20:15:00.000Z']
    );
    assert.equal(
        readHybridCapture(captured).reference,
        reference.toUTC().toISO()
    );
});

test('hybrid fixtures preserve linked pages and freeze the inference reference for reproducible generated tests', async () => {
    const captured = await captureConfiguredDetails(
        config,
        JSON.stringify(posts),
        detailFetch,
        reference
    );
    const generated = generateFiles(config, captured);
    const fixtureString = generated.test.match(
        /const fixture = (.*);\nconst expected =/
    )?.[1];
    assert.ok(fixtureString);
    const stored = readHybridCapture(JSON.parse(fixtureString));
    assert.equal((stored.programme as unknown[]).length, 3);
    assert.equal(Object.keys(stored.pages).length, 3);
    assert.equal(stored.reference, '2026-11-09T12:00:00.000Z');
    assert.equal(
        parseConfiguredProgramme(config, JSON.parse(fixtureString))[0].showings
            .length,
        3
    );
    assert.ok(generated.scraper.includes('"details"'));
});

test('hybrid capture rejects stale metadata, cross-origin links, missing containers and detail bounds before partial output', async () => {
    const body = JSON.stringify(posts);
    await assert.rejects(
        captureConfiguredDetails(
            { ...config, details: { ...config.details!, maxFilms: 1 } },
            body,
            detailFetch,
            reference
        ),
        /limit reached/
    );
    await assert.rejects(
        captureConfiguredDetails(
            config,
            JSON.stringify([{ ...posts[0], modified: '2020-01-01T10:00:00' }]),
            detailFetch,
            reference
        ),
        /stale/
    );
    await assert.rejects(
        captureConfiguredDetails(
            config,
            JSON.stringify([{ ...posts[0], link: 'http://127.0.0.1/private' }]),
            detailFetch,
            reference
        ),
        /origin/
    );
    await assert.rejects(
        captureConfiguredDetails(
            config,
            body,
            async () => new Response('<h1>Maintenance</h1>'),
            reference
        ),
        /exactly one/
    );
    await assert.rejects(
        captureConfiguredDetails(
            config,
            body,
            async () => new Response('Forbidden', { status: 403 }),
            reference
        ),
        /HTTP 403/
    );
});

test('nearby-year interpretation is opt-in, requires a weekday and rejects duplicate date/time mappings', () => {
    assert.equal(
        parseScreeningTime(
            'venerdì 6 novembre ore 21.15',
            '',
            config,
            reference
        ),
        '2026-11-06T20:15:00.000Z'
    );
    assert.throws(
        () =>
            parseScreeningTime(
                'venerdì 6 novembre ore 21.15',
                '',
                { ...config, yearPolicy: 'explicit' },
                reference
            ),
        /full screening/
    );
    assert.throws(
        () =>
            parseScreeningTime(
                '6 novembre ore 21.15',
                '',
                { ...config, dateFormat: "d MMMM 'ore' HH.mm" },
                reference
            ),
        /requires a format/
    );
    assert.throws(
        () => parseScreeningTime('same text', 'same text', config, reference),
        /same text is mapped/
    );
    assert.equal(
        parseScreeningTime(
            'venerdì 1 gennaio ore 00.30',
            '',
            config,
            DateTime.fromISO('2026-12-31T12:00:00Z')
        ),
        '2026-12-31T23:30:00.000Z'
    );
});

test('the normal configured runner fetches detail pages and applies its detail limit across API pagination', async () => {
    const sample = [posts[0]];
    const full = await runConfiguredScraper(config, {
        reference,
        fetch: async (url) =>
            url.includes('/wp-json/')
                ? Response.json(sample)
                : detailFetch(url),
    });
    assert.equal(
        full[0].showings[0].film.title,
        'Minotaur – Nel labirinto del potere'
    );
    const limited = {
        ...config,
        details: { ...config.details!, maxFilms: 1 },
        pagination: { parameter: 'page', maxPages: 3, totalPagesPath: '' },
    };
    await assert.rejects(
        runConfiguredScraper(limited, {
            reference,
            fetch: async (url) =>
                url.includes('/wp-json/')
                    ? Response.json(
                          [
                              {
                                  ...posts[
                                      Number(
                                          new URL(url).searchParams.get('page')
                                      ) - 1
                                  ],
                                  modified: reference.toISO(),
                              },
                          ],
                          { headers: { 'x-wp-totalpages': '2' } }
                      )
                    : detailFetch(url),
        }),
        /across API pages/
    );
});
