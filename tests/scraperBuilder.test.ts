import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {
    emptyConfig,
    ScraperConfigSchema,
    type ScraperConfig,
} from '../shared/scraperConfig';
import {
    parseConfiguredProgramme,
    runConfiguredScraper,
    valueAt,
} from '../scripts/configuredScraper';
import { generateFiles } from '../scripts/builder/generate';
import {
    sanitizedHtml,
    jsonPaths,
    inspectWebsite,
} from '../scripts/builder/discovery';
import { launchScraperBrowser } from '../scripts/scraperBrowser';
import { chromium, type Browser } from 'playwright-chromium';
import {
    publicAddress,
    publicFetch,
    publicUrl,
} from '../scripts/builder/network';
import { sameCinema } from '../scripts/builder/checks';
import {
    beginLogin,
    finishLogin,
    createScraperPullRequest,
    type BuilderSession,
    type GitHubSettings,
} from '../scripts/builder/github';
import { scraperFilename, suggestJsonMapping } from '../src/builder/mapping';

const field = (path: string, attribute = '') => ({ path, attribute });
function config(): ScraperConfig {
    return {
        ...emptyConfig('https://cinema.example/'),
        filename: 'sampleCinema.ts',
        cinema: {
            name: 'Sample Cinema',
            location: 'London',
            website: 'https://cinema.example/',
            defaultLanguage: 'en-GB',
            coordinates: { lat: '51.5', lng: '-0.1' },
        },
        url: 'https://cinema.example/api',
        timezone: 'Europe/London',
        items: 'films',
        title: field('title'),
        filmUrl: field('url'),
        showings: 'sessions',
        start: field('start'),
        booking: field('booking'),
    };
}
const programme = {
    films: [
        {
            title: 'A & B',
            url: '/film/a',
            sessions: [
                { start: '2099-07-01T20:00:00', booking: '/book/1' },
                { start: '2099-07-01T20:00:00', booking: '/book/1' },
            ],
        },
    ],
};

test('fast discovery reads explicit API links without launching a browser or fetching private URLs', async (t) => {
    let launches = 0;
    t.mock.method(chromium, 'launch', async () => {
        launches++;
        throw new Error('must not launch');
    });
    const requests: string[] = [];
    const result = await inspectWebsite('https://cinema.example/programme', {
        fetch: async (url) => {
            requests.push(url);
            return url.endsWith('/api/films')
                ? Response.json(programme)
                : new Response(
                      '<article><h2>Film</h2></article><link type="application/json" href="/api/films"><script>fetch("http://127.0.0.1/private");fetch("/api/films")</script>'
                  );
        },
    });
    assert.deepEqual(requests, [
        'https://cinema.example/programme',
        'https://cinema.example/api/films',
        'https://cinema.example/wp-json/',
    ]);
    assert.equal(result.rendered, false);
    assert.equal(result.candidates.length, 1);
    assert.match(result.html, /Film/);
    assert.doesNotMatch(result.html, /<script/);
    assert.equal(launches, 0);
});

test('fast inspection accepts a direct JSON URL and bounds API hint requests', async () => {
    const direct = await inspectWebsite('https://cinema.example/api', {
        fetch: async () => Response.json(programme),
    });
    assert.equal(direct.candidates[0].url, 'https://cinema.example/api');
    assert.equal(direct.html, '');
    const requests: string[] = [];
    await inspectWebsite('https://cinema.example/', {
        fetch: async (url) => {
            requests.push(url);
            return new Response(
                url.endsWith('/')
                    ? Array.from(
                          { length: 20 },
                          (_, i) => `<a href="/${i}.json">API</a>`
                      ).join('')
                    : 'not JSON'
            );
        },
    });
    assert.equal(requests.length, 7);
});

test('Rex-style public API discovery accepts poster-heavy responses and keeps samples small', async () => {
    // Rex links this PHP endpoint from an inline fetch, and embeds base64 posters.
    const url = 'https://www.cinemarex.it/pages/rexJsonCompact.php';
    const start = Date.parse('2099-07-01T19:00:00Z');
    const payload = {
        titoli: Array.from({ length: 5 }, (_, i) => ({
            titolo: `Film ${i}`,
            autore: 'Director',
            locandina: 'a'.repeat(600000),
            eventi: [{ inizio: start, id_orario_evento: '42' }],
        })),
    };
    const body = JSON.stringify(payload);
    assert.ok(body.length > 2 * 1024 * 1024);
    const fetch = async (endpoint: string) =>
        endpoint === url
            ? Response.json(payload)
            : new Response(
                  `<script>(async function fetchPage(){const resp = await (await fetch("${url}")).json();})();</script>`
              );
    const discovery = await inspectWebsite('https://www.cinemarex.it/', {
        fetch,
    });
    assert.equal(discovery.candidates.length, 1);
    const candidate = discovery.candidates[0];
    assert.equal(candidate.url, url);
    assert.ok(candidate.paths.includes('titoli.eventi.inizio'));
    assert.ok(JSON.stringify(candidate.sample).length < 10000);
    assert.equal((candidate.sample as typeof payload).titoli.length, 3);
    assert.match(
        (candidate.sample as typeof payload).titoli[0].locandina,
        /sample shortened/
    );
    const suggested = suggestJsonMapping(candidate.sample);
    assert.equal(suggested.items, 'titoli');
    assert.deepEqual(suggested.title, field('titolo'));
    assert.deepEqual(suggested.director, field('autore'));
    assert.equal(suggested.showings, 'eventi');
    assert.deepEqual(suggested.start, field('inizio'));
    assert.equal(suggested.dateFormat, 'unix-ms');
    const direct = await inspectWebsite(url, { fetch });
    assert.equal(direct.candidates[0].url, url);
    const parsed = parseConfiguredProgramme(
        { ...config(), ...suggested, url },
        body
    );
    assert.equal(
        parsed[0].showings.length,
        5,
        'full programme extraction is never limited to the displayed sample'
    );
    assert.equal(
        parsed[0].showings[0].showings[0].startTime,
        '2099-07-01T19:00:00.000Z'
    );
});

test('API discovery reports failed hints rather than silently declaring no API', async () => {
    const discovery = await inspectWebsite('https://cinema.example/', {
        fetch: async (url) => {
            if (url.endsWith('/too-large.php'))
                throw new Error('Website response exceeds 16 MB');
            if (url.endsWith('/blocked.php'))
                return new Response('', { status: 403 });
            return new Response(
                '<script>fetch("/too-large.php");fetch("/blocked.php")</script>'
            );
        },
    });
    assert.equal(discovery.candidates.length, 0);
    assert.ok(
        discovery.warnings.some(
            (warning) =>
                warning.includes('too-large.php') && warning.includes('16 MB')
        )
    );
    assert.ok(
        discovery.warnings.some(
            (warning) =>
                warning.includes('blocked.php') && warning.includes('403')
        )
    );
});

test('browser discovery preserves captured APIs when rendered poster markup exceeds the HTML limit', async (t) => {
    let closed = false;
    const api = 'https://cinema.example/programme.php';
    const browser = {
        newContext: async () => ({
            routeWebSocket: async () => {},
            route: async (
                _pattern: string,
                handler: (route: unknown) => Promise<void>
            ) =>
                handler({
                    request: () => ({
                        url: () => api,
                        method: () => 'GET',
                        resourceType: () => 'fetch',
                    }),
                    fulfill: async () => {},
                    abort: async () => {},
                }),
            newPage: async () => ({
                goto: async () => ({ ok: () => true }),
                waitForLoadState: async () => {},
                content: async () =>
                    `<img src="data:image/jpeg;base64,${'a'.repeat(2100000)}">`,
                url: () => 'https://cinema.example/',
            }),
        }),
        close: async () => {
            closed = true;
        },
    } as unknown as Browser;
    t.mock.method(chromium, 'launch', async () => browser);
    // Some public PHP endpoints return JSON with a text/html content type.
    const discovery = await inspectWebsite('https://cinema.example/', {
        browser: true,
        fetch: async () =>
            new Response(JSON.stringify(programme), {
                headers: { 'content-type': 'text/html' },
            }),
    });
    assert.equal(discovery.candidates[0].url, api);
    assert.equal(discovery.html, '');
    assert.equal(discovery.raw, '');
    assert.ok(
        discovery.warnings.some((warning) => warning.includes('preview limit'))
    );
    assert.equal(closed, true);
});

test('HTML scrapers use HTTP by default and preserve explicitly requested rendering', async () => {
    const html =
        '<article><h2>Film</h2><time datetime="2099-07-01T20:00:00">20:00</time></article>';
    const mapping = {
        ...config(),
        mode: 'html' as const,
        items: 'article',
        title: field('h2'),
        filmUrl: field(''),
        showings: '',
        start: field('time', 'datetime'),
        booking: field(''),
    };
    let renders = 0;
    let fetches = 0;
    const dependencies = {
        fetch: async () => {
            fetches++;
            return new Response(html);
        },
        render: async () => {
            renders++;
            return html;
        },
    };
    assert.equal(
        (await runConfiguredScraper(mapping, dependencies))[0].showings[0].film
            .title,
        'Film'
    );
    assert.equal(renders, 0);
    assert.equal(fetches, 1);
    await runConfiguredScraper({ ...mapping, render: true }, dependencies);
    assert.equal(renders, 1);
    assert.equal(fetches, 1);
    assert.equal(
        ScraperConfigSchema.parse({ ...mapping, render: undefined }).render,
        false
    );
});

test('missing Playwright download falls back to installed browsers, with actionable errors if none exist', async () => {
    const channels: (string | undefined)[] = [];
    const browser = {} as Browser;
    assert.equal(
        await launchScraperBrowser('', async (options) => {
            channels.push(options.channel);
            if (options.channel === 'chrome') return browser;
            throw new Error("Executable doesn't exist at missing/path");
        }),
        browser
    );
    assert.deepEqual(channels, [undefined, 'chrome']);
    await assert.rejects(
        () =>
            launchScraperBrowser('', async () => {
                throw new Error("Executable doesn't exist");
            }),
        /npx playwright install chromium/
    );
    const explicit: (string | undefined)[] = [];
    await launchScraperBrowser('msedge', async (options) => {
        explicit.push(options.channel);
        return browser;
    });
    assert.deepEqual(explicit, ['msedge']);
    await assert.rejects(
        () =>
            launchScraperBrowser('', async () => {
                throw new Error('Browser crashed');
            }),
        /^Error: Browser crashed$/
    );
});

test('configured API scraper preserves titles, booking links, timezone and deduplicated showings', () => {
    const rows = parseConfiguredProgramme(config(), JSON.stringify(programme));
    assert.equal(rows[0].showings[0].film.title, 'A & B');
    assert.equal(rows[0].showings[0].film.url, 'https://cinema.example/film/a');
    assert.deepEqual(rows[0].showings[0].showings, [
        {
            startTime: '2099-07-01T19:00:00.000Z',
            bookingUrl: 'https://cinema.example/book/1',
        },
    ]);
    assert.throws(
        () =>
            parseConfiguredProgramme(
                config(),
                JSON.stringify({
                    films: [{ ...programme.films[0], title: '' }],
                })
            ),
        /no title/
    );
    assert.throws(
        () =>
            parseConfiguredProgramme(
                config(),
                JSON.stringify({
                    films: [
                        {
                            ...programme.films[0],
                            sessions: [{ start: '20:00' }],
                        },
                    ],
                })
            ),
        /full screening date/
    );
});

test('HTML selection supports full datetime attributes and separate date/time mappings', () => {
    const html =
        '<article class="film"><h2>A &amp; B</h2><div class="session"><time datetime="2099-07-01T20:00:00+01:00">20:00</time><a href="/book/1">Book</a></div></article>';
    const mapping = {
        ...config(),
        mode: 'html' as const,
        items: 'article.film',
        title: field('h2'),
        filmUrl: field(''),
        showings: '.session',
        start: field('time', 'datetime'),
        booking: field('a', 'href'),
    };
    const rows = parseConfiguredProgramme(mapping, html)[0].showings;
    assert.equal(rows[0].film.title, 'A & B');
    assert.equal(rows[0].showings[0].startTime, '2099-07-01T19:00:00.000Z');
    const split = {
        ...mapping,
        start: field('time'),
        date: field('strong'),
        dateFormat: 'dd/MM/yyyy HH:mm',
    };
    assert.equal(
        parseConfiguredProgramme(
            split,
            html.replace('<time', '<strong>01/07/2099</strong><time')
        )[0].showings[0].showings[0].startTime,
        '2099-07-01T19:00:00.000Z'
    );
    assert.throws(
        () =>
            parseConfiguredProgramme(
                mapping,
                html.replace('/book/1', 'javascript:alert(1)')
            ),
        /HTTP or HTTPS/
    );
});

test('pagination visits all pages and refuses to silently truncate a programme', async () => {
    const mapping = {
        ...config(),
        pagination: { parameter: 'page', maxPages: 2, totalPagesPath: '' },
    };
    const urls: string[] = [];
    await runConfiguredScraper(mapping, {
        fetch: async (url) => {
            urls.push(url);
            return new Response(JSON.stringify(programme), {
                headers: { 'x-wp-totalpages': '2' },
            });
        },
    });
    assert.deepEqual(
        urls.map((url) => new URL(url).searchParams.get('page')),
        ['1', '2']
    );
    await assert.rejects(
        () =>
            runConfiguredScraper(mapping, {
                fetch: async () => new Response(JSON.stringify(programme)),
            }),
        /Pagination limit/
    );
});

test('generated scraper and captured test are valid TypeScript with literal configuration', () => {
    const files = generateFiles(config(), JSON.stringify(programme));
    assert.equal(files.scraperPath, 'scripts/cinemas/sampleCinema.ts');
    for (const source of [files.scraper, files.test]) {
        const result = ts.transpileModule(source, {
            compilerOptions: {
                target: ts.ScriptTarget.ES2022,
                module: ts.ModuleKind.ESNext,
            },
            reportDiagnostics: true,
        });
        assert.equal(
            result.diagnostics?.filter(
                (item) => item.category === ts.DiagnosticCategory.Error
            ).length,
            0
        );
    }
    assert.match(files.test, /2099-07-01T19:00:00.000Z/);
    assert.match(files.test, /assert.deepEqual/);
    assert.equal(
        ScraperConfigSchema.safeParse({ ...config(), filename: '../escape.ts' })
            .success,
        false
    );
    assert.equal(
        ScraperConfigSchema.safeParse({ ...config(), items: '__proto__.films' })
            .success,
        false
    );
    assert.equal(valueAt({}, '__proto__.secret'), undefined);
    assert.equal(
        ScraperConfigSchema.safeParse({
            ...config(),
            cinema: { ...config().cinema, website: 'not a URL' },
        }).success,
        false
    );
});

test('public URL guard rejects private networks, credentials, alternate ports and unusual protocols', async () => {
    for (const ip of [
        '127.0.0.1',
        '10.1.2.3',
        '192.168.1.1',
        '169.254.169.254',
        '172.16.0.1',
        '100.64.0.1',
        '::1',
        '::ffff:127.0.0.1',
        'fc00::1',
    ])
        assert.equal(publicAddress(ip), false, ip);
    assert.equal(publicAddress('8.8.8.8'), true);
    for (const url of [
        'file:///etc/passwd',
        'https://localhost/a',
        'https://user:password@example.com',
        'http://127.0.0.1',
        'http://2130706433',
        'https://example.com:9999',
    ])
        assert.throws(() => publicUrl(url));
    await assert.rejects(
        () => publicFetch('http://127.0.0.1'),
        /Private network/
    );
});

test('selection snapshot strips executable content and external resource attributes', () => {
    const html = sanitizedHtml(
        '<script>alert(1)</script><iframe src="https://evil.example"></iframe><article onclick="alert(1)"><a href="/film">Title</a><img src="https://image.example/a.jpg" onerror="alert(1)"><time datetime="2099-01-01">Time</time></article>'
    );
    assert.doesNotMatch(html, /<script|<iframe|onclick|onerror|<img src=/);
    assert.match(html, /data-builder-href="\/film"/);
    assert.match(html, /datetime="2099-01-01"/);
    assert.ok(jsonPaths(programme).includes('films.sessions.start'));
});

test('duplicate checks and API suggestions use cinema identity and actual field names', () => {
    assert.equal(
        sameCinema(config(), {
            name: 'SAMPLE CINEMA',
            location: 'london',
            website: null,
        }),
        true
    );
    assert.equal(
        sameCinema(config(), {
            name: 'Different name',
            location: 'Elsewhere',
            website: 'https://www.cinema.example/',
        }),
        true
    );
    assert.equal(
        sameCinema(config(), {
            name: 'Another cinema',
            location: 'London',
            website: 'https://another.example/',
        }),
        false
    );
    assert.equal(scraperFilename('Cinéma 42'), 'cinema42Cinema.ts');
    assert.equal(suggestJsonMapping(programme).items, 'films');
    assert.deepEqual(suggestJsonMapping(programme).start, field('start'));
});

const settings: GitHubSettings = {
    clientId: 'test-client',
    clientSecret: 'test-secret',
    callbackUrl: 'http://localhost:5173/builder-api/auth/callback',
    owner: 'owner',
    repo: 'repo',
    base: 'dev',
};
test('GitHub login uses session-bound state and S256 PKCE', () => {
    const session: BuilderSession = {
        csrf: 'test',
        expires: Date.now() + 10000,
    };
    const url = new URL(beginLogin(settings, session));
    assert.equal(url.searchParams.get('state'), session.oauth?.state);
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(url.searchParams.get('code_challenge')?.length, 43);
    assert.throws(
        () => beginLogin({ ...settings, clientSecret: '' }, session),
        /configure/
    );
});

test('GitHub submission refuses missing credentials and a changed base before making writes', async (t) => {
    const writes: string[] = [];
    t.mock.method(
        globalThis,
        'fetch',
        async (input: string | URL | Request, init?: RequestInit) => {
            if (init?.method !== 'GET') writes.push(String(input));
            return Response.json(
                String(input).includes('/git/ref/')
                    ? { object: { sha: 'changed' } }
                    : { permissions: { push: true } }
            );
        }
    );
    const files = generateFiles(config(), JSON.stringify(programme));
    await assert.rejects(
        () =>
            createScraperPullRequest(
                settings,
                { csrf: '', expires: Date.now() + 10000 },
                config(),
                files,
                'original'
            ),
        /Sign in/
    );
    await assert.rejects(
        () =>
            createScraperPullRequest(
                settings,
                { csrf: '', expires: Date.now() + 10000, token: 'test-token' },
                config(),
                files,
                'original'
            ),
        /base branch changed/
    );
    assert.deepEqual(writes, []);
});

test('GitHub OAuth rejects a mismatched state before exchanging credentials', async (t) => {
    let requests = 0;
    t.mock.method(globalThis, 'fetch', async () => {
        requests++;
        return Response.json({});
    });
    const session: BuilderSession = {
        csrf: 'test',
        expires: Date.now() + 10000,
    };
    beginLogin(settings, session);
    await assert.rejects(
        () =>
            finishLogin(
                settings,
                session,
                new URLSearchParams({ state: 'wrong', code: 'code' })
            ),
        /expired or was cancelled/
    );
    assert.equal(requests, 0);
    assert.equal(session.oauth, undefined);
});

test('validated GitHub submission creates only the scraper and fixture on a separate branch with a dev PR', async (t) => {
    const writes: { url: string; body: Record<string, unknown> }[] = [];
    t.mock.method(
        globalThis,
        'fetch',
        async (input: string | URL | Request, init?: RequestInit) => {
            const url = String(input);
            if (init?.method === 'POST') {
                writes.push({ url, body: JSON.parse(String(init.body)) });
                if (url.endsWith('/pulls'))
                    return Response.json({
                        html_url: 'https://github.com/owner/repo/pull/42',
                    });
                return Response.json({
                    sha: url.endsWith('/git/trees') ? 'new-tree' : 'new-commit',
                });
            }
            return Response.json(
                url.includes('/git/ref/')
                    ? { object: { sha: 'base-sha' } }
                    : url.includes('/git/commits/')
                      ? { tree: { sha: 'base-tree' } }
                      : { permissions: { push: true } }
            );
        }
    );
    const files = generateFiles(config(), JSON.stringify(programme));
    const result = await createScraperPullRequest(
        settings,
        { csrf: '', expires: Date.now() + 10000, token: 'test-token' },
        config(),
        files,
        'base-sha'
    );
    assert.deepEqual(
        writes.map((write) => write.url.split('/').at(-1)),
        ['trees', 'commits', 'refs', 'pulls']
    );
    assert.deepEqual(writes[0].body.tree, [
        {
            path: files.scraperPath,
            mode: '100644',
            type: 'blob',
            content: files.scraper,
        },
        {
            path: files.testPath,
            mode: '100644',
            type: 'blob',
            content: files.test,
        },
    ]);
    assert.deepEqual(writes[1].body.parents, ['base-sha']);
    assert.equal(writes[2].body.ref, `refs/heads/${result.branch}`);
    assert.match(result.branch, /^cinema\/sampleCinema-/);
    assert.equal(writes[3].body.base, 'dev');
    assert.equal(writes[3].body.head, result.branch);
});
