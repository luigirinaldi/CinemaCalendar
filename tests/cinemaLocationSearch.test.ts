import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createCinemaGeocoder,
    parseLocationResults,
} from '../scripts/builder/geocoding';

const feature = (name = 'Rex Cinema', lng = 11.876, lat = 45.406) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lng, lat] },
    properties: {
        name,
        street: 'Via Example',
        housenumber: '10',
        postcode: '35100',
        city: 'Padova',
        country: 'Italia',
    },
});
const body = { type: 'FeatureCollection', features: [feature()] };

test('location results preserve GeoJSON longitude/latitude order, readable addresses and city', () => {
    const results = parseLocationResults({
        features: [
            feature(),
            feature(),
            feature('Invalid', 190),
            {
                ...feature(),
                geometry: { type: 'Point', coordinates: ['11', '45'] },
            },
            {
                geometry: { type: 'Point', coordinates: [11, 45] },
                properties: {},
            },
        ],
    });
    assert.deepEqual(results, [
        {
            id: '45.406,11.876',
            label: 'Rex Cinema, Via Example 10, 35100 Padova, Italia',
            city: 'Padova',
            lat: '45.406',
            lng: '11.876',
        },
    ]);
    assert.equal(
        parseLocationResults({
            features: Array.from({ length: 10 }, (_, i) =>
                feature(`Venue ${i}`, 11 + i)
            ),
        }).length,
        5
    );
    assert.throws(() => parseLocationResults({ error: 'unavailable' }));
});

test('location queries are encoded, cached, serialized and throttled across callers', async () => {
    let clock = 0;
    const waits: number[] = [];
    const requests: string[] = [];
    let active = 0;
    const search = createCinemaGeocoder({
        now: () => clock,
        sleep: async (ms) => {
            waits.push(ms);
            clock += ms;
        },
        fetch: async (url) => {
            assert.equal(active++, 0);
            requests.push(url);
            await Promise.resolve();
            active--;
            return Response.json(body);
        },
    });
    const [first, cached, second] = await Promise.all([
        search(' Rex & Co,   Padova '),
        search('rex & co, padova'),
        search('Other cinema, Padova'),
    ]);
    assert.deepEqual(first, cached);
    assert.deepEqual(first, second);
    assert.equal(requests.length, 2);
    assert.equal(new URL(requests[0]).hostname, 'photon.komoot.io');
    assert.equal(
        new URL(requests[0]).searchParams.get('q'),
        'Rex & Co, Padova'
    );
    assert.equal(new URL(requests[0]).searchParams.get('limit'), '5');
    assert.deepEqual(waits, [1000]);
    clock += 24 * 60 * 60 * 1000 + 1;
    await search('Rex & Co, Padova');
    assert.equal(requests.length, 3);
});

test('geocoding rejects invalid input before requests and recovers after provider failures', async () => {
    let requests = 0;
    const search = createCinemaGeocoder({
        sleep: async () => {},
        fetch: async () => {
            requests++;
            return requests === 1
                ? new Response('', { status: 429 })
                : Response.json(body);
        },
    });
    for (const query of [undefined, 123, '  ', 'a', 'x'.repeat(251)])
        assert.throws(() => search(query));
    assert.equal(requests, 0);
    await assert.rejects(() => search('Rex Padova'), /rate limited/);
    assert.equal((await search('Rex Padova'))[0].lat, '45.406');
    assert.equal(requests, 2);
    assert.throws(
        () => createCinemaGeocoder({ endpoint: 'http://127.0.0.1/api/' }),
        /Private network/
    );
});

test('empty search results are cached and a configurable Photon endpoint is used', async () => {
    const requests: string[] = [];
    const search = createCinemaGeocoder({
        endpoint: 'https://geocoder.example/api/',
        fetch: async (url) => {
            requests.push(url);
            return Response.json({ features: [] });
        },
    });
    assert.deepEqual(await search('Unknown cinema'), []);
    assert.deepEqual(await search('Unknown cinema'), []);
    assert.equal(requests.length, 1);
    assert.equal(new URL(requests[0]).hostname, 'geocoder.example');
});
