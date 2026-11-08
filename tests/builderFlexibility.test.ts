import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyConfig, type ScraperConfig } from '../shared/scraperConfig';
import { cleanField, parseScreeningTime } from '../shared/scraperValues';
import {
    embeddedJsonCandidates,
    inspectWebsite,
} from '../scripts/builder/discovery';
import {
    parseConfiguredProgramme,
    runConfiguredScraper,
} from '../scripts/configuredScraper';
import { generateFiles } from '../scripts/builder/generate';

const field = (path: string) => ({ path, attribute: '' });
function config(): ScraperConfig {
    return {
        ...emptyConfig('https://cinema.example/programme'),
        cinema: {
            name: 'Example cinema',
            location: 'Roma',
            website: 'https://cinema.example/',
            defaultLanguage: 'en-GB',
            coordinates: { lat: '41.9', lng: '12.5' },
        },
        timezone: 'Europe/Rome',
        mode: 'html',
        items: 'article',
        title: field('h2'),
        showings: 'li',
        start: {
            ...field('time'),
            after: 'Ore ',
            replacements: [{ find: '.', replace: ':' }],
        },
        date: { ...field('h3'), scope: 'ancestor', ancestor: 'section' },
        dateFormat: 'd MMMM yyyy HH:mm',
        dateLocale: 'it-IT',
    };
}
const html = `<main><section><h3>5 Novembre 2026</h3><article><h2>First film</h2><ul><li><time>Ore 20.30</time></li></ul></article></section><section><h3>6 Novembre 2026</h3><article><h2>Second film</h2><ul><li><time>Ore 18.00</time></li></ul></article></section></main>`;

test('manual mappings read localized dates from containing sections and clean nonstandard times', () => {
    const films = parseConfiguredProgramme(config(), html)[0].showings;
    assert.equal(films[0].showings[0].startTime, '2026-11-05T19:30:00.000Z');
    assert.equal(films[1].showings[0].startTime, '2026-11-06T17:00:00.000Z');
    const generated = generateFiles(config(), html);
    assert.ok(
        generated.test.includes('5 Novembre 2026'),
        'fixture retains date headings outside film cards'
    );
    assert.ok(generated.scraper.includes('"dateLocale": "it-IT"'));
});

test('date language is independent of film language; missing years/times and invalid dates fail', () => {
    assert.equal(
        parseScreeningTime('20:30', '5 Novembre 2026', config()),
        '2026-11-05T19:30:00.000Z'
    );
    for (const [value, day, dateFormat] of [
        ['20:30', '5 Novembre', 'd MMMM HH:mm'],
        ['', '5 Novembre 2026', 'd MMMM yyyy'],
        ['20:30', '31 Febbraio 2026', 'd MMMM yyyy HH:mm'],
    ])
        assert.throws(
            () => parseScreeningTime(value, day, { ...config(), dateFormat }),
            /Cannot parse/
        );
    assert.throws(
        () =>
            parseScreeningTime('2026-11-05', '', {
                ...config(),
                dateFormat: '',
            }),
        /Cannot parse/
    );
    assert.throws(
        () =>
            parseScreeningTime('2026 20:30', '', {
                ...config(),
                dateFormat: 'yyyy HH:mm',
            }),
        /Cannot parse/
    );
    assert.equal(
        parseScreeningTime('1793907000', '', {
            ...config(),
            dateFormat: 'unix-seconds',
        }),
        '2026-11-05T19:30:00.000Z'
    );
});

test('cleanup uses literal text, reports missing delimiters and preserves significant punctuation', () => {
    assert.equal(
        cleanField('  Date:\n5\u00a0Novembre 2026 (VO) ', {
            ...field(''),
            after: 'Date:',
            before: '(VO)',
        }),
        '5 Novembre 2026'
    );
    assert.equal(
        cleanField('A.B', {
            ...field(''),
            replacements: [{ find: '.', replace: ' & ' }],
        }),
        'A & B'
    );
    assert.throws(
        () => cleanField('changed page', { ...field(''), after: 'Date:' }),
        /does not contain/
    );
});

test('page and film scopes read JSON fields outside each screening row', () => {
    const mapping: ScraperConfig = {
        ...config(),
        mode: 'json',
        items: 'films',
        title: field('title'),
        showings: 'sessions',
        start: field('time'),
        date: { ...field('day'), scope: 'page' },
    };
    const body = JSON.stringify({
        day: '5 Novembre 2026',
        films: [
            {
                title: 'Film',
                day: '6 Novembre 2026',
                sessions: [{ time: '20:30' }],
            },
        ],
    });
    assert.equal(
        parseConfiguredProgramme(mapping, body)[0].showings[0].showings[0]
            .startTime,
        '2026-11-05T19:30:00.000Z'
    );
    assert.equal(
        parseConfiguredProgramme(
            { ...mapping, date: { ...field('day'), scope: 'film' } },
            body
        )[0].showings[0].showings[0].startTime,
        '2026-11-06T19:30:00.000Z'
    );
});

test('embedded JSON discovery supports JSON-LD, Next data and anonymous data scripts without executing assignments', async () => {
    const data = {
        films: [
            { title: 'Film', sessions: [{ start: '2026-11-05T20:30:00' }] },
        ],
    };
    const body = `<html><head><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script><script>window.secret = ${JSON.stringify(data)}</script></head><body><script type="application/ld+json">${JSON.stringify({ '@graph': data.films })}</script><script type="application/json">${JSON.stringify(data)}</script></body></html>`;
    const discovery = await inspectWebsite('https://cinema.example/programme', {
        fetch: async (url) =>
            new Response(url.endsWith('/wp-json/') ? '{}' : body),
    });
    assert.equal(discovery.candidates.length, 4);
    assert.equal(discovery.candidates[0].embeddedJson, 'script#__NEXT_DATA__');
    assert.doesNotMatch(discovery.html, /<script/);
    const candidates = embeddedJsonCandidates(
        body,
        'https://cinema.example/programme'
    );
    for (const candidate of candidates.filter(
        (candidate) =>
            !candidate.paths.includes('@graph') && !candidate.embeddedAssignment
    )) {
        const mapping: ScraperConfig = {
            ...config(),
            mode: 'json',
            embeddedJson: candidate.embeddedJson,
            items: 'films',
            title: field('title'),
            showings: 'sessions',
            start: field('start'),
            date: field(''),
            dateFormat: '',
        };
        assert.equal(
            parseConfiguredProgramme(mapping, body)[0].showings[0].showings[0]
                .startTime,
            '2026-11-05T19:30:00.000Z'
        );
        assert.ok(generateFiles(mapping, body).test.includes('__NEXT_DATA__'));
        const actual = await runConfiguredScraper(
            { ...mapping, render: true },
            {
                render: async () => body,
                fetch: async () => {
                    throw new Error('must use requested rendering');
                },
            }
        );
        assert.equal(actual[0].showings.length, 1);
        assert.throws(
            () =>
                parseConfiguredProgramme(
                    { ...mapping, embeddedJson: 'script' },
                    body
                ),
            /exactly one/
        );
        assert.throws(
            () =>
                parseConfiguredProgramme(
                    mapping,
                    body.replaceAll(JSON.stringify(data), 'not JSON')
                ),
            /JSON/
        );
    }
});
