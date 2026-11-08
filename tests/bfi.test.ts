import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-extra';
import {
    parseBfiFilmLinks,
    parseBfiShowings,
    parseBfiInlineContext,
    parseBfiFilmInfo,
    isBfiEmptyProgramme,
    scraper,
} from '../scripts/cinemas/bfiSouthbank';

const filmUrl = 'https://whatson.bfi.org.uk/Online/article/film';
const index = `<div class="Rich-text">
    <a href="article/film">Film &amp; title</a>
    <a href="/Online/article/film#details">Film &amp; title</a>
    <a href="https://example.org/Online/article/wrong">Other venue</a>
    <a href="mailto:cinema@example.org">Email</a>
    <a href="article/second">Second film</a>
</div>`;

const emptyContext = {
    searchLabels: { no_results_message: 'No matching films or events' },
    loginLabels: {},
    contextId: '',
    articleId: 'public-film-id',
    articleSearchId: '',
    salesType: 'P',
    sToken: 'public-session-token',
};
const emptyFilm =
    '<h1 class="Page__heading">24 Hour Party People</h1><div class="Booking"><div name="avWidget" id="avWidget_public-film-id_1"><script>registerWidget("SearchWebWidget2");</script><div></div></div></div>';

test('BFI recognizes its verified no-session response without treating changed schemas as empty', () => {
    assert.equal(isBfiEmptyProgramme(emptyContext, emptyFilm), true);
    assert.equal(
        isBfiEmptyProgramme(
            emptyContext,
            emptyFilm.replace('class="Booking"', 'class="event-page"')
        ),
        true
    );
    assert.equal(
        isBfiEmptyProgramme(
            emptyContext,
            emptyFilm.replace('SearchWebWidget2', 'CalendarWidget')
        ),
        false
    );
    assert.equal(
        isBfiEmptyProgramme(
            { ...emptyContext, articleId: 'another-article' },
            emptyFilm
        ),
        false
    );
    assert.equal(
        isBfiEmptyProgramme({ ...emptyContext, searchResults: [] }, emptyFilm),
        false
    );
    assert.equal(
        isBfiEmptyProgramme(
            { ...emptyContext, changedResultsField: [] },
            emptyFilm
        ),
        false
    );
    assert.equal(
        isBfiEmptyProgramme(emptyContext, '<title>Just a moment...</title>'),
        false
    );
    assert.equal(
        isBfiEmptyProgramme(
            emptyContext,
            emptyFilm.replace(
                '<div></div>',
                '<div><button>18:00</button></div>'
            )
        ),
        false
    );
    assert.equal(isBfiEmptyProgramme({}, emptyFilm), false);
});

test('BFI continues past an off-sale film and returns subsequent films with sessions', async (t) => {
    let pages = 0;
    let closed = false;
    t.mock.method(console, 'log', () => {});
    t.mock.method(console, 'warn', () => {});
    t.mock.method(chromium, 'launch', async () => ({
        newContext: async () => ({
            newPage: async () => {
                const number = pages++;
                return {
                    goto: async () => ({ status: () => 200 }),
                    waitForFunction: async () => {},
                    content: async () =>
                        number === 0
                            ? index
                            : number === 1
                              ? emptyFilm
                              : '<h1>Film</h1>',
                    evaluate: async () =>
                        number === 1
                            ? emptyContext
                            : {
                                  searchNames: ['start_date'],
                                  searchResults: [['2026-11-07T18:00:00']],
                              },
                    close: async () => {},
                };
            },
        }),
        close: async () => {
            closed = true;
        },
    }));
    const [result] = await scraper();
    assert.equal(pages, 3);
    assert.equal(result.showings.length, 1);
    assert.equal(result.showings[0].film.title, 'Second film');
    assert.equal(closed, true);
});

test('BFI reads optional metadata without waiting for absent headings or artwork', () => {
    assert.deepEqual(
        parseBfiFilmInfo(`<li class="Film-info__information__wrapper"><p class="Film-info__information__heading">Director</p><p class="Film-info__information__value">Michael Winterbottom</p></li>
        <li class="Film-info__information__wrapper"><p class="Film-info__information__value">UK 2002. 117min</p></li>
        <img class="Media__image" src="/images/film.jpg">`),
        {
            director: 'Michael Winterbottom',
            country: 'UK',
            year: 2002,
            duration: 117,
            coverUrl: 'https://whatson.bfi.org.uk/images/film.jpg',
        }
    );
    assert.deepEqual(parseBfiFilmInfo('<h1>Film</h1>'), {});
});

test('BFI index resolves relative and absolute links, deduplicates and rejects unrelated pages', () => {
    assert.deepEqual(parseBfiFilmLinks(index), [
        { url: filmUrl, title: 'Film & title' },
        {
            url: 'https://whatson.bfi.org.uk/Online/article/second',
            title: 'Second film',
        },
    ]);
    assert.throws(
        () => parseBfiFilmLinks('<title>Just a moment...</title>'),
        /no usable film links/
    );
});

test('BFI reads safe inline JSON without executing site scripts or truncating quoted brackets', () => {
    const data = {
        searchNames: ['title', 'start_date'],
        searchResults: [
            ['A title with ]; and "quotes"', '2026-11-07T18:00:00'],
        ],
    };
    assert.deepEqual(
        parseBfiInlineContext(
            `<script>const articleContext = ${JSON.stringify(data)};</script>`
        ),
        data
    );
    assert.deepEqual(
        parseBfiInlineContext(
            `<script>var articleContext = {}; articleContext.searchNames = ${JSON.stringify(data.searchNames)};</script><script>articleContext['searchResults'] = ${JSON.stringify(data.searchResults)};</script>`
        ),
        data
    );
    assert.equal(
        parseBfiInlineContext(
            '<script>articleContext = dangerousFunction();</script>'
        ),
        null
    );
    assert.equal(
        parseBfiInlineContext(
            '<script>articleContext={"searchNames":[],"searchResults":[]};articleContext.searchResults.push(getData());</script>'
        ),
        null
    );
    assert.throws(() =>
        parseBfiInlineContext(
            '<script>articleContext={"searchNames":"changed","searchResults":[]};</script>'
        )
    );
});

test('BFI recovers inline programme data when it is not exposed on window', async (t) => {
    let pages = 0;
    let closed = false;
    t.mock.method(console, 'log', () => {});
    t.mock.method(console, 'warn', () => {});
    t.mock.method(chromium, 'launch', async () => ({
        newContext: async (options: unknown) => {
            assert.equal(options, undefined); // Keep the real installed browser identity.
            return {
                newPage: async () => {
                    const isIndex = pages++ === 0;
                    return {
                        goto: async () => ({ status: () => 200 }),
                        waitForFunction: async () => {},
                        content: async () =>
                            isIndex
                                ? '<div class="Rich-text"><a href="article/film">Film</a></div>'
                                : '<h1>Film</h1><script>const articleContext={"searchNames":["start_date"],"searchResults":[["2026-11-07T18:00:00"]]};</script><script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script>',
                        evaluate: async () => null,
                        locator: () => ({
                            count: async () => 0,
                            first: () => ({ getAttribute: async () => null }),
                        }),
                        close: async () => {},
                    };
                },
            };
        },
        close: async () => {
            closed = true;
        },
    }));
    const [result] = await scraper();
    assert.equal(
        result.showings[0].showings[0].startTime,
        '2026-11-07T18:00:00.000+00:00'
    );
    assert.equal(closed, true);
});

test('BFI preserves an HTTP 200 diagnostic page without misreporting an access refusal', async (t) => {
    let pageCount = 0;
    let diagnostic = '';
    let closed = false;
    t.mock.method(console, 'log', () => {});
    t.mock.method(console, 'warn', (message: unknown) => {
        const match = String(message).match(
            /Saved failed page for diagnosis: (.*)$/
        );
        if (match) diagnostic = match[1];
    });
    t.mock.method(chromium, 'launch', async () => ({
        newContext: async () => ({
            newPage: async () => {
                const isIndex = pageCount++ === 0;
                return {
                    goto: async () => ({ status: () => 200 }),
                    waitForFunction: async () => {
                        if (!isIndex) throw new Error('Timeout');
                    },
                    content: async () =>
                        isIndex
                            ? '<div class="Rich-text"><a href="article/film">Film</a></div>'
                            : '<title>Buy tickets for Film | BFI</title><h1>Film</h1><script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script>',
                    close: async () => {},
                };
            },
        }),
        close: async () => {
            closed = true;
        },
    }));
    await assert.rejects(
        scraper(),
        (error: unknown) =>
            error instanceof Error &&
            !error.message.includes('access denied') &&
            error.message.includes('expected programme data')
    );
    assert.ok(diagnostic.endsWith('.html'));
    assert.match(await readFile(diagnostic, 'utf8'), /Buy tickets for Film/);
    const details = JSON.parse(
        await readFile(diagnostic.replace(/\.html$/, '.json'), 'utf8')
    );
    assert.equal(details.reason, 'programme');
    assert.equal(details.httpStatus, 200);
    assert.equal(closed, true);
});

test('BFI uses published times with London DST and accepts explicitly empty search results', () => {
    const result = parseBfiShowings(
        {
            searchNames: ['name', 'start_date'],
            searchResults: [
                ['Film', '2026-07-01T20:30:00'],
                ['Film', '01/12/2026 18:15:00'],
                ['Film', '2026-07-01T20:30:00+02:00'],
            ],
        },
        filmUrl
    );
    assert.deepEqual(
        result.map((s) => Date.parse(s.startTime)),
        [
            Date.parse('2026-07-01T19:30:00Z'),
            Date.parse('2026-12-01T18:15:00Z'),
            Date.parse('2026-07-01T18:30:00Z'),
        ]
    );
    assert.deepEqual(
        parseBfiShowings({ searchNames: [], searchResults: [] }, filmUrl),
        []
    );
    for (const source of [
        null,
        {},
        { searchNames: ['other'], searchResults: [['missing']] },
        { searchNames: ['start_date'], searchResults: [['2026-07-01']] },
        { searchNames: ['start_date'], searchResults: [['bad date']] },
    ])
        assert.throws(() => parseBfiShowings(source, filmUrl));
});

test('BFI completes with busy tracking requests and waits for index and film data', async (t) => {
    let browserClosed = false;
    let readyCalls = 0;
    let pagesClosed = 0;
    t.mock.method(console, 'log', () => {});
    t.mock.method(console, 'warn', () => {});
    const browserPage = (isIndex: boolean) => ({
        goto: async (_url: string, options: { waitUntil: string }) => {
            if (options.waitUntil === 'networkidle')
                throw new Error('Tracking requests never go idle');
            assert.equal(options.waitUntil, 'domcontentloaded');
            return { status: () => 200 };
        },
        waitForFunction: async () => {
            readyCalls++;
        },
        content: async () => (isIndex ? index : '<html></html>'),
        evaluate: async () => ({
            searchNames: ['start_date'],
            searchResults: [['2026-11-06T18:00:00']],
        }),
        locator: () => ({
            count: async () => 0,
            first: () => ({ getAttribute: async () => '/cover.jpg' }),
        }),
        close: async () => {
            pagesClosed++;
        },
    });
    let pageCount = 0;
    t.mock.method(chromium, 'launch', async () => ({
        newContext: async () => ({
            newPage: async () => browserPage(pageCount++ === 0),
        }),
        close: async () => {
            browserClosed = true;
        },
    }));
    const [result] = await scraper();
    assert.equal(result.showings.length, 2);
    assert.equal(result.showings[0].showings.length, 1);
    assert.equal(readyCalls, 3);
    assert.equal(pagesClosed, 3);
    assert.equal(browserClosed, true);
});

test('BFI reports an access check and closes the browser instead of returning an empty programme', async (t) => {
    let closed = false;
    t.mock.method(chromium, 'launch', async () => ({
        newContext: async () => ({
            newPage: async () => ({
                goto: async () => ({ status: () => 403 }),
                waitForFunction: async () => {
                    throw new Error('timeout');
                },
                content: async () => '<title>Just a moment...</title>',
            }),
        }),
        close: async () => {
            closed = true;
        },
    }));
    await assert.rejects(scraper(), /Film index access denied \(HTTP 403\)/);
    assert.equal(closed, true);
});

test('BFI retries a timed-out film navigation and releases every page', async (t) => {
    let pages = 0;
    let pagesClosed = 0;
    let browserClosed = false;
    t.mock.method(console, 'log', () => {});
    t.mock.method(console, 'warn', () => {});
    t.mock.method(chromium, 'launch', async () => ({
        newContext: async () => ({
            newPage: async () => {
                const index = pages++;
                return {
                    goto: async () => {
                        if (index === 1)
                            throw new Error('Navigation timed out');
                        return { status: () => 200 };
                    },
                    waitForFunction: async () => {},
                    content: async () =>
                        index === 0
                            ? '<div class="Rich-text"><a href="article/film">Film</a></div>'
                            : '<html></html>',
                    evaluate: async () => ({
                        searchNames: ['start_date'],
                        searchResults: [['2026-11-06T18:00:00']],
                    }),
                    locator: () => ({
                        count: async () => 0,
                        first: () => ({ getAttribute: async () => null }),
                    }),
                    close: async () => {
                        pagesClosed++;
                    },
                };
            },
        }),
        close: async () => {
            browserClosed = true;
        },
    }));
    const [result] = await scraper();
    assert.equal(result.showings.length, 1);
    assert.equal(pages, 3);
    assert.equal(pagesClosed, 3);
    assert.equal(browserClosed, true);
});
