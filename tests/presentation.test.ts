import test from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { Window } from 'happy-dom';
import { ScreeningResults } from '../src/components/ScreeningResults';
import TableView from '../src/components/TableView';
import { filmWithPoster, type Screening } from '../src/api';
import { movieYearsForScreenings } from '../src/hooks/useScreeningFilters';
import { CalendarFilters } from '../src/components/CalendarFilters';
import FilmPosterCard from '../src/components/FilmPosterCard';
import { readCalendarUrl } from '../src/lib/calendarUrl';
import { todayIn } from '../src/lib/dates';

function row(id: number, filmId = 1, tmdbId: number | null = 10): Screening {
    return {
        id,
        film_id: filmId,
        cinema_id: 1,
        start_time: '2026-11-03T23:30:00Z',
        booking_url: `https://cinema.test/book/${id}`,
        cinema: {
            id: 1,
            name: 'Test cinema',
            location: 'London',
            coordinates: null,
            created_at: '',
            default_lang: 'en-GB',
            last_updated: '',
            website: null,
        },
        film: {
            id: filmId,
            title: 'Scraped title',
            director: 'Test Director',
            duration: 100,
            release_year: 2001,
            tmdb_id: tmdbId,
            cinema_id: 1,
            country: null,
            cover_url: 'https://cinema.test/poster.jpg',
            created_at: '',
            language: null,
            local_id: null,
            url: null,
            tmdb_films:
                tmdbId == null
                    ? null
                    : {
                          id: tmdbId,
                          title: 'Canonical title',
                          release_date: '2000-01-01',
                          poster_path: '/poster.jpg',
                          letterboxd_slug: 'test-film',
                          adult: false,
                          backdrop_path: null,
                          created_at: '',
                          genre_ids: [],
                          original_language: 'en',
                          original_title: 'Original title',
                          overview: '',
                          popularity: 0,
                          video: false,
                          vote_average: 0,
                          vote_count: 0,
                          letterboxd_avg_rating: null,
                          letterboxd_num_ratings: null,
                          letterboxd_ratings: null,
                      },
        },
    };
}

test('year counts share view identity across repeated screenings, venues, remakes and unknown films', () => {
    const acrossVenues = row(3, 2);
    acrossVenues.cinema_id = 2;
    const unknown = row(5, 4, null);
    const unknownAgain = row(6, 5, null);
    unknown.film!.director = null;
    unknownAgain.film!.director = null;
    const noYear = row(7, 6, null);
    noYear.film!.release_year = null;
    const rows = [
        row(1),
        row(2),
        acrossVenues,
        row(4, 3, 20),
        unknown,
        unknownAgain,
        noYear,
    ];
    const before = structuredClone(rows);
    assert.deepEqual(movieYearsForScreenings(rows), [2000, 2000, 2001, 2001]);
    assert.deepEqual(rows, before);
});

test('settings put grouping and film filters before the date controls', () => {
    const html = renderToStaticMarkup(
        createElement(CalendarFilters, {
            filters: {
                dateRange: 'custom',
                currentDate: '2026-11-03',
                customStartDate: '2026-11-03',
                customEndDate: '2026-11-04',
            },
            onChange: () => {},
            groupBy: 'movie',
            onGroupChange: () => {},
            zone: 'Europe/London',
            children: createElement('div', null, 'Letterboxd / Year filter'),
        })
    );
    assert.ok(
        html.indexOf('Group By') < html.indexOf('Letterboxd / Year filter')
    );
    assert.ok(
        html.indexOf('Letterboxd / Year filter') < html.indexOf('Date Range')
    );
    assert.ok(html.indexOf('Date Range') < html.indexOf('Start Date'));
});

test('film cards show readable metadata and a TMDB link even without embedded metadata', () => {
    const film = row(1).film!;
    film.tmdb_films = null;
    film.duration = null;
    const html = renderToStaticMarkup(
        createElement(FilmPosterCard, {
            movie: filmWithPoster(film),
            children: 'Screenings',
        })
    );
    assert.match(html, /Directed by/);
    assert.match(html, /Test Director/);
    assert.match(html, /2001/);
    assert.match(html, /href="https:\/\/www.themoviedb.org\/movie\/10"/);
    assert.doesNotMatch(html, /undefined|null min/);
    assert.match(html, /href="https:\/\/letterboxd.com\/tmdb\/10\/"/);
});

test('cards and table use saved Letterboxd slugs, fall back to TMDB IDs and omit unknown films', () => {
    for (const state of [
        'slug',
        'no-slug',
        'no-metadata',
        'unknown',
    ] as const) {
        const screening = row(1, 1, state === 'unknown' ? null : 10);
        const film = screening.film!;
        if (state === 'no-slug') film.tmdb_films!.letterboxd_slug = null;
        if (state === 'no-metadata') film.tmdb_films = null;
        const movie = filmWithPoster(film);
        const card = renderToStaticMarkup(
            createElement(FilmPosterCard, { movie, children: 'Screenings' })
        );
        const table = renderToStaticMarkup(
            createElement(TableView, {
                screenings: [screening],
                getMovie: () => movie,
                getCinema: () => screening.cinema,
                zone: 'Europe/London',
                showTimes: true,
                singleDay: true,
                showMode: 'full',
                onShowModeChange: () => {},
                tableSort: null,
                onTableSortChange: () => {},
            })
        );
        for (const html of [card, table]) {
            if (state === 'unknown')
                assert.doesNotMatch(html, /title="View on Letterboxd"/);
            else
                assert.ok(
                    html.includes(
                        `href="https://letterboxd.com/${state === 'slug' ? 'film/test-film' : 'tmdb/10'}/"`
                    )
                );
        }
    }
});

test('film views preserve details, cinema collapse and city-local calendar days; compact links match labels', async (t) => {
    const window = new Window({
        url: 'https://example.test/?city=london&groupBy=table&dateRange=custom&start=2026-11-01&end=2026-11-10&tableSort=title-asc',
    });
    const globals = {
        window,
        document: window.document,
        IS_REACT_ACT_ENVIRONMENT: true,
    };
    const restoreGlobals: (() => void)[] = [];
    for (const [name, value] of Object.entries(globals)) {
        const original = Object.getOwnPropertyDescriptor(globalThis, name);
        Object.defineProperty(globalThis, name, { configurable: true, value });
        restoreGlobals.push(() => {
            if (original) Object.defineProperty(globalThis, name, original);
            else Reflect.deleteProperty(globalThis, name);
        });
    }
    const previousZone = process.env.TZ;
    process.env.TZ = 'Europe/Rome';
    t.after(() => {
        if (previousZone == null) delete process.env.TZ;
        else process.env.TZ = previousZone;
    });
    const container = window.document.createElement('div');
    window.document.body.append(container);
    const root = createRoot(container as unknown as HTMLElement);
    t.after(async () => {
        try {
            await act(() => root.unmount());
            await window.happyDOM.close();
        } finally {
            restoreGlobals.forEach((restore) => restore());
        }
    });
    const rows = [row(1), { ...row(2), start_time: '2026-11-10T23:30:00Z' }];
    const before = structuredClone(rows);
    for (const groupBy of ['movie', 'cinema'] as const) {
        await act(() =>
            root.render(
                createElement(ScreeningResults, {
                    screenings: rows,
                    groupBy,
                    zone: 'Europe/London',
                })
            )
        );
        assert.equal(container.querySelectorAll('h3').length, 1);
        assert.equal(
            container.querySelector('h3')?.textContent,
            'Canonical title'
        );
        assert.match(container.textContent, /Test Director/);
        assert.match(container.textContent, /Directed by/);
        assert.equal(
            container
                .querySelector('a[title="View on TMDB"]')
                ?.textContent?.trim(),
            'TMDB'
        );
        assert.equal(
            container
                .querySelector('a[title="View on Letterboxd"]')
                ?.textContent?.trim(),
            'Letterboxd'
        );
        assert.ok(
            container.querySelector(
                'img[src="https://image.tmdb.org/t/p/w342/poster.jpg"]'
            )
        );
        assert.ok(
            container.querySelector(
                'a[href="https://www.themoviedb.org/movie/10"]'
            )
        );
        assert.ok(
            container.querySelector(
                'a[href="https://letterboxd.com/film/test-film/"]'
            )
        );
        assert.equal(
            container.querySelectorAll('a[title="Book tickets"]').length,
            2
        );
        assert.match(container.textContent, /Tue, 3 Nov/);
        assert.match(container.textContent, /Tue, 10 Nov/);
        assert.match(container.textContent, /23:30/);
        if (groupBy === 'cinema') {
            const toggle = container.querySelector('button')!;
            assert.equal(toggle.getAttribute('aria-expanded'), 'true');
            assert.match(toggle.textContent, /1 film/);
            await act(() => toggle.click());
            assert.equal(container.querySelectorAll('h3').length, 0);
            assert.ok(container.querySelector('button[aria-expanded="false"]'));
            await act(() => toggle.click());
            assert.equal(container.querySelectorAll('h3').length, 1);
        }
    }
    for (const zone of ['Europe/London', 'Europe/Rome']) {
        await act(() =>
            root.render(
                createElement(TableView, {
                    screenings: rows,
                    zone,
                    getMovie: () => filmWithPoster(rows[0].film!),
                    getCinema: () => rows[0].cinema,
                    showTimes: false,
                    singleDay: false,
                    showMode: 'compact',
                    onShowModeChange: () => {},
                    tableSort: null,
                    onTableSortChange: () => {},
                })
            )
        );
        const link = container.querySelector(
            'a[href*="when=today"], a[href*="on="]'
        )!;
        const url = new URL(link.getAttribute('href')!);
        assert.equal(
            readCalendarUrl(url.search, todayIn(zone)).filters.currentDate,
            zone === 'Europe/London' ? '2026-11-03' : '2026-11-04'
        );
        assert.match(
            link.textContent,
            zone === 'Europe/London' ? /3 Nov/ : /4 Nov/
        );
        assert.equal(url.searchParams.get('city'), 'london');
        assert.equal(url.searchParams.has('groupBy'), false);
        assert.equal(url.searchParams.has('tableSort'), false);
        assert.equal(url.searchParams.has('start'), false);
        assert.equal(url.searchParams.has('end'), false);
    }
    assert.deepEqual(rows, before);
});
