import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-extra';
import {
    parseBfiFilmLinks,
    parseBfiShowings,
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
