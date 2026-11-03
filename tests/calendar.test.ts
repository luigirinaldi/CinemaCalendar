import test from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';
import { fetchScreenings, type Screening } from '../src/calendarApi';
import { dateBounds } from '../src/lib/dates';
import { byDay, byMovie } from '../src/lib/groupings';
import { fetchAllPages } from '../src/lib/pagination';
import type { Filters } from '../src/types';

const filters: Filters = {
    dateRange: 'custom',
    currentDate: '2026-10-24',
    customStartDate: '2026-10-24',
    customEndDate: '2026-10-25',
};
const row = (
    id: number,
    start_time: string,
    tmdb_id: number | null = null
): Screening => ({
    id,
    start_time,
    film_id: id,
    cinema_id: 1,
    booking_url: null,
    film: {
        id,
        title: 'Same title',
        duration: null,
        director: null,
        release_year: null,
        tmdb_id,
    },
    cinema: { id: 1, name: 'Cinema', location: 'London' },
});
test('custom end date includes the full day and late shows across DST', () => {
    const [start, end] = dateBounds(filters, 'Europe/London');
    assert.equal(start, '2026-10-24T00:00:00.000+01:00');
    assert.equal(end, '2026-10-26T04:00:00.000+00:00');
});
test('invalid custom dates fail before querying', () => {
    assert.throws(() =>
        dateBounds({ ...filters, customEndDate: '2026-10-23' }, 'Europe/Rome')
    );
    assert.throws(() =>
        dateBounds({ ...filters, customStartDate: '' }, 'Europe/Rome')
    );
});
test('future days start at midnight; today starts now', () => {
    const now = DateTime.fromISO('2026-10-23T15:30:00Z');
    assert.equal(
        dateBounds({ ...filters, dateRange: 'today' }, 'Europe/London', now)[0],
        '2026-10-24T00:00:00.000+01:00'
    );
    assert.equal(
        dateBounds(
            { ...filters, dateRange: 'today', currentDate: '2026-10-23' },
            'Europe/London',
            now
        )[0],
        '2026-10-23T16:30:00.000+01:00'
    );
});
test('calendar dates, not weekdays, define groups; inputs remain unchanged', () => {
    const rows = [
        row(1, '2026-11-09T10:00:00Z'),
        row(2, '2026-11-02T10:00:00Z'),
    ];
    assert.deepEqual(
        byDay(rows, 'Europe/London').map(([key]) => key),
        ['2026-11-02', '2026-11-09']
    );
    assert.equal(rows[0].id, 1);
    assert.equal(
        byDay([row(3, '2026-07-01T23:30:00Z')], 'Europe/Rome')[0][0],
        '2026-07-02'
    );
});
test('TMDB groups across cinemas, but different IDs and unknown remakes stay separate', () => {
    assert.equal(
        byMovie([
            row(1, '2026-11-01T10:00Z', 42),
            row(2, '2026-11-01T11:00Z', 42),
        ]).length,
        1
    );
    assert.equal(
        byMovie([
            row(1, '2026-11-01T10:00Z', 42),
            row(2, '2026-11-01T11:00Z', 43),
        ]).length,
        2
    );
    assert.equal(
        byMovie([row(1, '2026-11-01T10:00Z'), row(2, '2026-11-01T11:00Z')])
            .length,
        2
    );
});
test('pagination respects server caps and exact counts without an extra request', async () => {
    const starts: number[] = [];
    const result = await fetchAllPages(async (from) => {
        starts.push(from);
        return { data: [1, 2, 3, 4, 5].slice(from, from + 2), count: 5 };
    });
    assert.deepEqual(result, [1, 2, 3, 4, 5]);
    assert.deepEqual(starts, [0, 2, 4]);
});
test('real Supabase query embeds relations, filters on server, paginates and preserves objects', async () => {
    const requests: URL[] = [];
    const client = createClient<Database>(
        'https://example.supabase.co',
        'test-key',
        {
            auth: { persistSession: false, autoRefreshToken: false },
            global: {
                fetch: async (input) => {
                    const url = new URL(String(input));
                    requests.push(url);
                    const offset = Number(url.searchParams.get('offset') ?? 0);
                    return new Response(
                        JSON.stringify([
                            row(offset + 1, '2026-11-01T10:00:00Z'),
                        ]),
                        {
                            headers: {
                                'Content-Type': 'application/json',
                                'Content-Range': `${offset}-${offset}/2`,
                            },
                        }
                    );
                },
            },
        }
    );
    const result = await fetchScreenings(
        client,
        'London',
        '2026-11-01T00:00:00Z',
        '2026-11-02T04:00:00Z',
        new AbortController().signal
    );
    assert.equal(result.length, 2);
    assert.equal(result[0].film?.title, 'Same title');
    assert.equal(requests[0].searchParams.get('cinema.location'), 'eq.London');
    assert.match(
        requests[0].searchParams.get('select')!,
        /film:new_films!new_showings_film_id_fkey/
    );
    assert.match(requests[0].searchParams.get('select')!, /!inner/);
    assert.equal(requests[1].searchParams.get('offset'), '1');
    assert.deepEqual(requests[0].searchParams.getAll('start_time'), [
        'gte.2026-11-01T00:00:00Z',
        'lt.2026-11-02T04:00:00Z',
    ]);
});
test('empty city makes no API call; server errors propagate', async () => {
    let calls = 0;
    const client = createClient<Database>(
        'https://example.supabase.co',
        'test-key',
        {
            global: {
                fetch: async () => {
                    calls++;
                    return new Response(
                        JSON.stringify({ message: 'Access denied' }),
                        { status: 403 }
                    );
                },
            },
        }
    );
    assert.deepEqual(
        await fetchScreenings(
            client,
            '',
            null,
            null,
            new AbortController().signal
        ),
        []
    );
    assert.equal(calls, 0);
    await assert.rejects(
        fetchScreenings(
            client,
            'London',
            null,
            null,
            new AbortController().signal
        ),
        /Access denied/
    );
});
