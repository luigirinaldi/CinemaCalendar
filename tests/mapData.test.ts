import test from 'node:test';
import assert from 'node:assert/strict';
import { cinemaMapQuery } from '../src/lib/mapData';
import { cityZone, dateBounds } from '../src/lib/dates';

test('new cities including Cambridge get a map query covering all tracked venues', () => {
    const query = cinemaMapQuery('Cambridge', [
        { coordinates: { lat: '52.204', lng: '0.1218' } },
        { coordinates: { lat: '52.20288', lng: '0.1235' } },
        { coordinates: { lat: '52.1905', lng: '0.13714' } },
    ])!;
    assert.ok(query);
    assert.ok(!query.includes('area.city'));
    const bbox = query
        .match(/node\["amenity"="cinema"\]\(([^)]+)\)/)![1]
        .split(',')
        .map(Number);
    assert.ok(bbox[0] < 52.1905 && bbox[2] > 52.204);
    assert.ok(bbox[1] < 0.1218 && bbox[3] > 0.13714);
    assert.match(query, /way\["amenity"="cinema"\]/);
    assert.match(query, /relation\["amenity"="cinema"\]/);
});

test('Padova discovery also covers tracked cinemas beyond its administrative border', () => {
    const query = cinemaMapQuery('Padova', [
        { coordinates: { lat: '45.38365', lng: '11.8656' } },
        { coordinates: { lat: '45.46348', lng: '11.84804' } },
    ])!;
    assert.match(query, /area\(3600044836\)/);
    const boxes = [
        ...query.matchAll(/node\["amenity"="cinema"\]\(([^)]+)\)/g),
    ].map((match) => match[1]);
    assert.ok(boxes.includes('area.city'));
    const bounds = boxes
        .find((box) => box !== 'area.city')!
        .split(',')
        .map(Number);
    assert.ok(bounds[0] < 45.38365 && bounds[2] > 45.46348);
});

test('missing coordinates do not generate invalid Overpass queries', () => {
    assert.equal(cinemaMapQuery('New city', [{ coordinates: null }]), null);
    assert.equal(
        cinemaMapQuery('', [{ coordinates: { lat: 52, lng: 0 } }]),
        null
    );
    assert.ok(cinemaMapQuery('London', []));
});

test('Cambridge date filters use UK time across summer daylight saving', () => {
    assert.equal(cityZone('Cambridge'), 'Europe/London');
    const [start] = dateBounds(
        {
            dateRange: 'custom',
            currentDate: '2026-07-01',
            customStartDate: '2026-07-01',
            customEndDate: '2026-07-01',
        },
        cityZone('Cambridge')
    );
    assert.equal(Date.parse(start!), Date.parse('2026-06-30T23:00:00Z'));
});
