import test from 'node:test';
import assert from 'node:assert/strict';
import { readCalendarUrl, calendarSearch } from '../src/lib/calendarUrl';
import { groupByMovie } from '../src/utils/grouping';
import type { FilmTable, ShowingsTable } from '../src/api';

test('main range URLs use dev custom-date semantics and survive URL updates', () => {
    const state = readCalendarUrl(
        '?city=london&dateRange=range&start=2026-07-01&end=2026-07-02&groupBy=table&showMode=full&tableSort=director-desc',
        '2026-11-03'
    );
    assert.equal(state.filters.dateRange, 'custom');
    assert.equal(state.filters.customEndDate, '2026-07-02');
    const encoded = calendarSearch(
        '',
        state.filters,
        state.city,
        state.groupBy,
        state.showMode,
        state.tableSort
    );
    assert.deepEqual(readCalendarUrl(`?${encoded}`, '2026-11-03'), state);
});

test('dev week and custom URL state retain dev defaults', () => {
    const state = readCalendarUrl(
        '?dateRange=thisWeek&groupBy=invalid',
        '2026-11-03'
    );
    assert.equal(state.filters.dateRange, 'thisWeek');
    assert.equal(state.groupBy, 'movie');
    assert.equal(
        readCalendarUrl('', '2026-11-03').filters.currentDate,
        '2026-11-03'
    );
});

test('the table view uses dev film identity instead of merging conflicting TMDB IDs', () => {
    const film = (id: number, tmdb_id: number | null): FilmTable => ({
        id,
        tmdb_id,
        title: 'Same title',
        director: null,
        duration: null,
        release_year: null,
        cinema_id: 1,
        country: null,
        cover_url: null,
        created_at: '',
        language: null,
        local_id: null,
        url: null,
    });
    const films = new Map(
        [
            film(1, 10),
            film(2, 20),
            film(3, null),
            film(4, null),
            film(5, 10),
        ].map((value) => [value.id, value])
    );
    const rows: ShowingsTable[] = [...films.values()].map((value) => ({
        id: value.id,
        film_id: value.id,
        cinema_id: 1,
        start_time: '2026-07-01T20:00:00Z',
        booking_url: null,
    }));
    const before = structuredClone(rows);
    const groups = groupByMovie(rows, (id) => films.get(id));
    assert.equal(groups.length, 4);
    assert.deepEqual(
        groups.find(([key]) => key === 'tmdb:10')?.[1].map((row) => row.id),
        [1, 5]
    );
    assert.deepEqual(rows, before);
});
