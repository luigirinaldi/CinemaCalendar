import test from 'node:test';
import assert from 'node:assert/strict';
import { readScriptAssignments } from '../scripts/embeddedAssignments';
import { embeddedJsonCandidates } from '../scripts/builder/discovery';
import {
    configuredJson,
    runConfiguredScraper,
} from '../scripts/configuredScraper';
import { generateFiles } from '../scripts/builder/generate';
import { emptyConfig, type ScraperConfig } from '../shared/scraperConfig';

test('static data assignments support JS literals, bracket globals and JSON.parse without evaluation', () => {
    const assignments = readScriptAssignments(`
        const programme = [{title: 'A \\'quoted\\' film } ]', sessions: [], score: -1, available: true, notes: null,},];
        window['data'] = { films: ["Second"], count: 2 };
        let parsed = JSON.parse('{"films":[{"title":"Third"}]}');
        var other = ({ films: [] });
        globalThis.fourth = { films: [] };
    `);
    assert.equal(assignments.size, 5);
    assert.equal(
        (assignments.get('programme') as { title: string }[])[0].title,
        "A 'quoted' film } ]"
    );
    assert.deepEqual(
        JSON.parse(JSON.stringify(assignments.get('window.data'))),
        { films: ['Second'], count: 2 }
    );
    assert.deepEqual(assignments.get('parsed'), {
        films: [{ title: 'Third' }],
    });
});

test('executable expressions, getters, spreads and malformed source cannot become static data', () => {
    const scripts = [
        'const data = fetch("/api");',
        'const data = { value: run() };',
        'const data = { get films() { throw new Error("executed"); } };',
        'const data = { ...other };',
        'const data = [ ...other ];',
        'const data = { [compute()]: [] };',
        'const data = { films: `${run()}` };',
        'const data = { score: -1e999 };',
        'const data = JSON.parse(payload);',
        'const data = { __proto__: { polluted: true } };',
        'const data = [{title: "incomplete"}',
        'function populate() { const data = { films: [] }; }',
        'if (ready) window.data = { films: [] };',
        '// window.fake = {"films": []};\n const text = "window.other = {}";',
    ];
    for (const script of scripts)
        assert.equal(readScriptAssignments(script).size, 0, script);
    assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test('later writes and mutations reject incomplete initial values, including aliases and dynamic indexes', () => {
    for (const tail of [
        'data.films.push({title: "Later"});',
        'data.films[0].title = "Changed";',
        'data[key] = [];',
        'delete data.films;',
        'data.count++;',
        'Object.assign(data, {films: []});',
        'populate({ programme: data });',
        'var data = build();',
        'window.data.films.push({});',
        'data = {}; data = {films: []};',
    ])
        assert.equal(
            readScriptAssignments(
                'var data = {films: [], count: 0};' + tail
            ).has('data'),
            false,
            tail
        );
    assert.equal(
        readScriptAssignments(
            'window.data = {films: []}; data.films.push({});'
        ).has('window.data'),
        false
    );
    assert.equal(
        readScriptAssignments(
            'window.data = {films: []}; window.data.count = 1;'
        ).has('window.data'),
        false
    );
});

test('discovery keeps multiple assignments in one script distinct and runtime fetches fresh literal data', async () => {
    const html = `<script id="programme">window.first = {films: []}; window.data = {films: [{title: 'A film', sessions: [{start: '2099-11-05T20:30:00'}]}]};</script>`;
    const candidates = embeddedJsonCandidates(
        html,
        'https://cinema.example/programme'
    );
    assert.equal(candidates.length, 2);
    assert.deepEqual(
        candidates.map((candidate) => candidate.embeddedAssignment),
        ['window.first', 'window.data']
    );
    const config: ScraperConfig = {
        ...emptyConfig('https://cinema.example/programme'),
        cinema: {
            name: 'Cinema',
            location: 'Roma',
            website: 'https://cinema.example/',
            defaultLanguage: 'it-IT',
            coordinates: { lat: '41.9', lng: '12.5' },
        },
        timezone: 'Europe/Rome',
        embeddedJson: 'script#programme',
        embeddedAssignment: 'window.data',
        items: 'films',
        title: { path: 'title', attribute: '' },
        showings: 'sessions',
        start: { path: 'start', attribute: '' },
    };
    assert.equal(
        (configuredJson(html, config) as { films: unknown[] }).films.length,
        1
    );
    const rows = await runConfiguredScraper(config, {
        fetch: async () => new Response(html.replace('A film', 'Updated film')),
    });
    assert.equal(rows[0].showings[0].film.title, 'Updated film');
    assert.equal(
        rows[0].showings[0].showings[0].startTime,
        '2099-11-05T19:30:00.000Z'
    );
    const files = generateFiles(config, html);
    assert.ok(files.scraper.includes('"embeddedAssignment": "window.data"'));
    assert.ok(files.test.includes('window.data'));
    assert.throws(
        () =>
            configuredJson(
                html.replace('window.data = {', 'window.changed = {'),
                config
            ),
        /missing, dynamic/
    );
    assert.throws(
        () =>
            configuredJson(
                html.replace(
                    '</script>',
                    'window.data.films.push({});</script>'
                ),
                config
            ),
        /modified later/
    );
});
