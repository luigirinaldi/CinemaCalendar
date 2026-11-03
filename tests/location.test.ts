import test from 'node:test';
import assert from 'node:assert/strict';
import type { Cinema } from '../src/api';
import {
    cinemaCoords,
    cinemasInArea,
    cityCenter,
    distanceKm,
    nearestCity,
    searchArea,
} from '../src/lib/location';
import { calendarSearch, readCalendarUrl } from '../src/lib/calendarUrl';
import { initialCalendarState } from '../src/lib/preferences';
import type { Filters } from '../src/types';

const cinema = (
    id: number,
    location: string,
    coordinates: Cinema['coordinates']
): Cinema => ({
    id,
    location,
    coordinates,
    name: `Cinema ${id}`,
    created_at: '',
    default_lang: 'it-IT',
    last_updated: '',
    website: null,
});
const filters: Filters = {
    dateRange: 'thisWeek',
    currentDate: '2026-11-03',
    customStartDate: '2026-11-03',
    customEndDate: '2026-11-03',
};

test('coordinates accept decimal and DMS data, rejecting missing and invalid points', () => {
    const bfi = cinemaCoords(
        cinema(1, 'London', {
            lat: '51° 30\' 18.36" N',
            lng: '0° 6\' 48.60" W',
        })
    )!;
    assert.ok(Math.abs(bfi.lat - 51.5051) < 0.00001);
    assert.ok(Math.abs(bfi.lng + 0.1135) < 0.00001);
    assert.deepEqual(
        cinemaCoords(cinema(2, 'Padova', { lat: '45.4', lng: 11.9 })),
        { lat: 45.4, lng: 11.9 }
    );
    for (const coordinates of [
        null,
        { lat: '', lng: 1 },
        { lat: 91, lng: 1 },
        { lat: '51 garbage', lng: 1 },
    ]) {
        assert.equal(cinemaCoords(cinema(1, '', coordinates)), null);
    }
});

test('radius includes cinemas across city boundaries and excludes distant or unmapped cinemas', () => {
    const rows = [
        cinema(1, 'New city', { lat: 45.4, lng: 11.9 }),
        cinema(2, 'Another city', { lat: 45.41, lng: 11.9 }),
        cinema(3, 'Far away', { lat: 51.5, lng: -0.1 }),
        cinema(4, 'New city', null),
    ];
    const area = searchArea(45.400001, 11.900001, 5)!;
    assert.deepEqual(area, { lat: 45.4, lng: 11.9, km: 5 });
    assert.deepEqual(
        cinemasInArea(rows, area).map((c) => c.id),
        [1, 2]
    );
    assert.equal(nearestCity(rows, area)?.city, 'New city');
    assert.deepEqual(cityCenter(rows, 'New city'), { lat: 45.4, lng: 11.9 });
    assert.equal(cityCenter(rows, 'Missing'), null);
    assert.equal(distanceKm(area, area), 0);
    assert.ok(distanceKm({ lat: 0, lng: 179.9 }, { lat: 0, lng: -179.9 }) < 23);
});

test('share URLs keep location and relevant dates, omitting defaults and display preferences', () => {
    assert.equal(
        calendarSearch(filters, 'London', null, filters.currentDate),
        'city=london'
    );
    const area = searchArea(51.5071, -0.1279, 25)!;
    const query = calendarSearch(filters, 'London', area, filters.currentDate);
    assert.equal(query, 'near=51.507,-0.128,25');
    assert.deepEqual(
        readCalendarUrl(`?${query}`, filters.currentDate).area,
        area
    );
    for (const dateRange of [
        'today',
        'thisWeek',
        'anytime',
        'custom',
    ] as const) {
        const value = {
            ...filters,
            dateRange,
            currentDate: '2026-11-10',
            customStartDate: '2026-11-05',
            customEndDate: '2026-11-07',
        };
        const restored = readCalendarUrl(
            calendarSearch(value, '', area, '2026-11-03'),
            '2026-11-03'
        );
        assert.equal(restored.filters.dateRange, dateRange);
        if (dateRange === 'today' || dateRange === 'thisWeek')
            assert.equal(restored.filters.currentDate, value.currentDate);
        if (dateRange === 'custom') {
            assert.equal(
                restored.filters.customStartDate,
                value.customStartDate
            );
            assert.equal(restored.filters.customEndDate, value.customEndDate);
        }
    }
    for (const near of [
        '91,0,25',
        '0,181,25',
        '0,0,0',
        '0,0,101',
        ',0,25',
        'x,1,25',
        '0,0',
    ]) {
        assert.equal(
            readCalendarUrl(`?near=${near}`, filters.currentDate).area,
            null
        );
    }
});

test('saved location and appearance restore, but explicit shared locations take precedence', () => {
    const saved = {
        city: 'Padova',
        area: searchArea(45.4, 11.9, 10),
        groupBy: 'table',
        showMode: 'full',
        tableSort: 'title-desc',
    };
    const storage = { getItem: () => JSON.stringify(saved) };
    const initial = initialCalendarState('', filters.currentDate, storage);
    assert.deepEqual(initial.area, saved.area);
    assert.equal(initial.groupBy, 'table');
    const shared = initialCalendarState(
        '?city=london',
        filters.currentDate,
        storage
    );
    assert.equal(shared.city, 'london');
    assert.equal(shared.area, null);
    assert.equal(shared.showMode, 'full');
    const legacy = initialCalendarState(
        '?city=london&dateRange=range&start=2026-11-03&end=2026-11-04&groupBy=cinema',
        filters.currentDate,
        storage
    );
    assert.equal(legacy.filters.dateRange, 'custom');
    assert.equal(legacy.groupBy, 'cinema');
    assert.equal(
        initialCalendarState('', filters.currentDate, {
            getItem() {
                throw new Error('blocked');
            },
        }).groupBy,
        'movie'
    );
    assert.equal(
        initialCalendarState('', filters.currentDate, {
            getItem: () => '{invalid',
        }).area,
        null
    );
});
