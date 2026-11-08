import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser } from 'playwright-chromium';
import { inspectWebsite } from '../scripts/builder/discovery';
import {
    inspectWordPress,
    wordpressCollectionRoutes,
} from '../scripts/builder/wordpress';

const origin = 'https://cinema.example';
const route = (methods = ['GET'], args: Record<string, unknown> = {}) => ({
    endpoints: [{ methods, args }],
});
const index = {
    namespaces: ['wp/v2', 'tribe/events/v1'],
    routes: {
        '/wp/v2/films': route(),
        '/tribe/events/v1/events': route(),
        '/tribe/events/v1/events/(?P<id>[\\d]+)': route(),
        '/wp/v2/settings': route(),
        '/wp/v2/users': route(),
        '/cinema/v1/events': route(['POST']),
        '/private/v1/screenings': route(['GET'], { token: { required: true } }),
        '/plugin/v1/events/reset': route(),
    },
};
const programme = [
    { title: 'Film', sessions: [{ start: '2099-07-01T20:00:00Z' }] },
];

test('homepage inspection probes /wp-json/ and public plugin collections without advertising the index as a programme', async () => {
    const requests: string[] = [];
    const result = await inspectWebsite(`${origin}/programme/`, {
        fetch: async (url) => {
            requests.push(url);
            if (url === `${origin}/wp-json/`) return Response.json(index);
            if (url.includes('/wp-json/')) return Response.json(programme);
            return new Response('<h1>Cinema programme</h1>');
        },
    });
    assert.deepEqual(requests, [
        `${origin}/programme/`,
        `${origin}/wp-json/`,
        `${origin}/wp-json/wp/v2/films`,
        `${origin}/wp-json/tribe/events/v1/events`,
    ]);
    assert.equal(result.candidates.length, 2);
    assert.ok(
        result.candidates.every(
            (candidate) => candidate.url !== `${origin}/wp-json/`
        )
    );
    assert.ok(
        result.warnings.some(
            (warning) =>
                warning.includes('tribe/events/v1') &&
                warning.includes('not a complete list')
        )
    );
});

test('advertised and directly pasted WordPress indexes are reused rather than fetched twice', async () => {
    for (const direct of [false, true]) {
        const requests: string[] = [];
        const result = await inspectWebsite(
            direct ? `${origin}/wp-json/` : `${origin}/`,
            {
                fetch: async (url) => {
                    requests.push(url);
                    if (url === `${origin}/wp-json/`)
                        return Response.json(index);
                    if (url.includes('/wp-json/'))
                        return Response.json(programme);
                    return new Response(
                        '<link type="application/json" href="/wp-json/">'
                    );
                },
            }
        );
        assert.equal(
            requests.filter((url) => url === `${origin}/wp-json/`).length,
            1
        );
        assert.equal(result.candidates.length, 2);
    }
});

test('WordPress probes are bounded and authorization failures are reported without becoming programme candidates', async () => {
    const requests: string[] = [];
    const many = {
        namespaces: ['cinema/v1'],
        routes: Object.fromEntries(
            Array.from({ length: 20 }, (_, i) => [
                `/cinema/v1/screenings-${i}`,
                route(),
            ])
        ),
    };
    const result = await inspectWordPress(`${origin}/`, async (url) => {
        requests.push(url);
        if (url === `${origin}/wp-json/`) return Response.json(many);
        return new Response('', { status: 403 });
    });
    assert.equal(requests.length, 6);
    assert.deepEqual(result.responses, []);
    assert.ok(
        result.warnings.some((warning) =>
            warning.includes('checking at most five')
        )
    );
    assert.equal(
        result.warnings.filter((warning) => warning.includes('403')).length,
        5
    );
});

test('route selection rejects unsafe paths, regex IDs, write-only routes, required arguments and edit context', () => {
    const unsafe = {
        namespaces: ['plugin/v1'],
        routes: {
            '//elsewhere.example/events': route(),
            '/plugin/v1/../events': route(),
            '/plugin/v1/events?context=edit': route(),
            '/plugin/v1/events/(?P<id>\\d+)': route(),
            '/admin/v1/events': route(),
            '/plugin/v1/events-reset': route(['POST']),
            '/plugin/v1/events-delete': route(),
            '/plugin/v1/screenings': route(['GET'], {
                token: { required: true },
            }),
            '/plugin/v1/eventi': route(['GET'], {
                context: { default: 'edit' },
            }),
            '/plugin/v1/orari': route(['GET'], {
                limit: { required: true, default: 10 },
            }),
        },
    };
    assert.deepEqual(wordpressCollectionRoutes(unsafe, `${origin}/wp-json/`), [
        `${origin}/wp-json/plugin/v1/orari`,
    ]);
    assert.deepEqual(
        wordpressCollectionRoutes(
            {
                namespace: 'cinema/v1',
                routes: { '/cinema/v1/events': { methods: ['GET'] } },
            },
            `${origin}/blog/wp-json/cinema/v1/`
        ),
        [`${origin}/blog/wp-json/cinema/v1/events`]
    );
    assert.deepEqual(
        wordpressCollectionRoutes(
            { namespaces: [], routes: { '/cinema/v1/events': route() } },
            `${origin}/?rest_route=/`
        ),
        [`${origin}/?rest_route=%2Fcinema%2Fv1%2Fevents`]
    );
});

test('non-WordPress or unavailable indexes preserve HTML discovery and explain the result', async () => {
    for (const response of [
        new Response('', { status: 404 }),
        new Response('<html>Not WordPress</html>'),
    ]) {
        const result = await inspectWebsite(`${origin}/`, {
            fetch: async (url) =>
                url.endsWith('/wp-json/')
                    ? response
                    : new Response('<article>Programme</article>'),
        });
        assert.match(result.html, /Programme/);
        assert.equal(result.candidates.length, 0);
        assert.ok(
            result.warnings.some((warning) => warning.includes('/wp-json/'))
        );
    }
});

test('programme collections outrank related WordPress taxonomies before the probe limit', () => {
    const index = {
        namespaces: ['wp/v2'],
        routes: {
            ...Object.fromEntries(
                Array.from({ length: 10 }, (_, i) => [
                    `/wp/v2/category-${i}-evento`,
                    route(),
                ])
            ),
            '/wp/v2/evento': route(),
        },
    };
    assert.equal(
        wordpressCollectionRoutes(index, `${origin}/wp-json/`)[0],
        `${origin}/wp-json/wp/v2/evento`
    );
});

test('browser mode also discovers plugin routes that the page never requests', async (t) => {
    const requests: string[] = [];
    const browser = {
        newContext: async () => ({
            routeWebSocket: async () => {},
            route: async (
                _pattern: string,
                handler: (route: unknown) => Promise<void>
            ) =>
                handler({
                    request: () => ({
                        url: () => `${origin}/wp-json/`,
                        method: () => 'GET',
                        resourceType: () => 'fetch',
                    }),
                    fulfill: async () => {},
                    abort: async () => {},
                }),
            newPage: async () => ({
                goto: async () => ({ ok: () => true }),
                waitForLoadState: async () => {},
                content: async () => '<article>Programme</article>',
                url: () => `${origin}/`,
            }),
        }),
        close: async () => {},
    } as unknown as Browser;
    t.mock.method(chromium, 'launch', async () => browser);
    const result = await inspectWebsite(`${origin}/`, {
        browser: true,
        fetch: async (url) => {
            requests.push(url);
            return Response.json(url.endsWith('/wp-json/') ? index : programme);
        },
    });
    assert.equal(result.rendered, true);
    assert.equal(result.candidates.length, 2);
    assert.equal(
        requests.filter((url) => url === `${origin}/wp-json/`).length,
        1
    );
});
