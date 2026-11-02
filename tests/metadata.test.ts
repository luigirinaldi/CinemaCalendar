import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanTMDBTitle, getTMDB, TMDBMovieSchema } from '../scripts/metadata';

let previous: string | undefined;
beforeEach(() => {
    previous = process.env.TMDB_API_KEY;
    process.env.TMDB_API_KEY = 'test-token';
});
afterEach(() => {
    if (previous === undefined) delete process.env.TMDB_API_KEY;
    else process.env.TMDB_API_KEY = previous;
});

const movie = {
    adult: false,
    backdrop_path: null,
    genre_ids: [35],
    id: 123,
    original_language: 'en',
    original_title: 'A Very Harold & Kumar Christmas',
    overview: '',
    popularity: 1,
    poster_path: null,
    release_date: '2011-11-04',
    title: 'A Very Harold & Kumar Christmas',
    video: false,
    vote_average: 6,
    vote_count: 10,
    softcore: false,
};
const film = {
    id: 1,
    title: movie.title,
    release_year: 2011,
    director: null,
    duration: null,
    default_lang: 'en-GB',
};

test('TMDB strips new API fields and allows null images before database insertion', () => {
    const parsed = TMDBMovieSchema.parse(movie);
    assert.equal('softcore' in parsed, false);
    assert.equal(parsed.poster_path, null);
    assert.equal(parsed.id, 123);
});

test('TMDB cleans screening annotations while preserving film subtitles and double bills', () => {
    for (const [input, expected] of [
        ["Child's Play (1988)", "Child's Play"],
        ['Principessa Mononoke (RIED. 2026)', 'Principessa Mononoke'],
        ['Kids\u2019 Club: Shrek (25th Anniversary)', 'Shrek'],
        [
            'The Distinguished Citizen + Q&A with Oscar',
            'The Distinguished Citizen',
        ],
        [
            'Funeral Parade presents A Nightmare on Elm Street 2: Freddy\u2019s Revenge',
            "A Nightmare on Elm Street 2: Freddy's Revenge",
        ],
        ['Cat On A Hot Tin Roof + LIve Organ', 'Cat On A Hot Tin Roof'],
        ['Halloween (1978) + Halloween II (1981)', 'Halloween + Halloween II'],
        [
            'The Darjeeling Limited + Hotel Chevalier',
            'The Darjeeling Limited + Hotel Chevalier',
        ],
        ['A &amp; B', 'A & B'],
        ['Where is the Friend\u2019s House', "Where is the Friend's House"],
    ])
        assert.equal(cleanTMDBTitle(input), expected);
});

test('TMDB encodes ampersands as part of the query and omits unknown years', async (t) => {
    t.mock.method(globalThis, 'fetch', async (input: string | URL) => {
        const url = new URL(input);
        assert.equal(url.searchParams.get('query'), movie.title);
        assert.equal(url.searchParams.has('year'), false);
        assert.equal(url.searchParams.has(' Kumar Christmas'), false);
        return Response.json({ results: [movie] });
    });
    assert.equal((await getTMDB({ ...film, release_year: null }))?.id, 123);
});

test('TMDB retries a 429 then parses the successful result', async (t) => {
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async () =>
        ++calls === 1
            ? new Response('', { status: 429, headers: { 'retry-after': '0' } })
            : Response.json({ results: [movie] })
    );
    assert.equal((await getTMDB(film))?.id, 123);
    assert.equal(calls, 2);
});

test('TMDB reports HTTP errors instead of treating them as empty searches', async (t) => {
    t.mock.method(globalThis, 'fetch', async () =>
        Response.json({ status_message: 'Invalid key' }, { status: 401 })
    );
    await assert.rejects(getTMDB(film), /HTTP 401/);
});

test('TMDB rejects malformed success payloads and handles empty person results', async (t) => {
    t.mock.method(globalThis, 'fetch', async () =>
        Response.json({ status_message: 'Unexpected error' })
    );
    await assert.rejects(getTMDB(film), /results/);
    t.mock.method(globalThis, 'fetch', async () =>
        Response.json({ results: [] })
    );
    assert.equal(await getTMDB({ ...film, director: 'Unknown' }), null);
});

test('TMDB falls back without year and does not repeat empty requests three times', async (t) => {
    const urls: URL[] = [];
    t.mock.method(globalThis, 'fetch', async (input: string | URL) => {
        urls.push(new URL(input));
        return Response.json({ results: [] });
    });
    assert.equal(await getTMDB(film), null);
    assert.equal(urls.length, 2);
    assert.equal(urls[0].searchParams.get('year'), '2011');
    assert.equal(urls[1].searchParams.has('year'), false);
});

test('TMDB validates person and discover error payloads before accessing their results', async (t) => {
    for (const failedPath of ['/search/person', '/discover/movie']) {
        t.mock.method(globalThis, 'fetch', async (input: string | URL) => {
            const path = new URL(input).pathname.replace('/3', '');
            return Response.json(
                path === failedPath
                    ? {}
                    : { results: [{ id: 42, popularity: 1 }] }
            );
        });
        await assert.rejects(
            getTMDB({ ...film, director: 'A Director' }),
            /results/
        );
    }
});

test('TMDB discovery does not assign a component film to a double bill', async (t) => {
    t.mock.method(globalThis, 'fetch', async (input: string | URL) => {
        const path = new URL(input).pathname;
        return Response.json({
            results: path.endsWith('/person')
                ? [{ id: 42, popularity: 1 }]
                : path.endsWith('/discover/movie')
                  ? [movie]
                  : [],
        });
    });
    assert.equal(
        await getTMDB({
            ...film,
            title: `${movie.title} + Another Film`,
            director: 'A Director',
        }),
        null
    );
});
