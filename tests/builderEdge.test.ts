import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createEdgeHandler,
    type EdgeOptions,
} from '../scripts/builder/edgeHandler';
import {
    createEdgeStore,
    hashToken,
    sessionCipher,
    type BuilderStore,
    type StoredValidation,
} from '../scripts/builder/edgeStore';
import { emptyConfig, type ScraperConfig } from '../shared/scraperConfig';
import type { BuilderSession } from '../scripts/builder/github';

const origin = 'https://cinema.example';
const settings = {
    clientId: 'client',
    clientSecret: 'secret',
    callbackUrl: `${origin}/?builderLogin=1`,
    owner: 'owner',
    repo: 'CinemaCalendar',
    base: 'dev',
};
const body = JSON.stringify({
    films: [
        { title: 'Future film', sessions: [{ start: '2099-11-05T20:30:00' }] },
    ],
});
const config: ScraperConfig = {
    ...emptyConfig('https://venue.example/api'),
    filename: 'futureCinema.ts',
    cinema: {
        name: 'Future Cinema',
        location: 'Roma',
        website: 'https://venue.example/',
        defaultLanguage: 'it-IT',
        coordinates: { lat: '41.9', lng: '12.5' },
    },
    timezone: 'Europe/Rome',
    items: 'films',
    title: { path: 'title', attribute: '' },
    showings: 'sessions',
    start: { path: 'start', attribute: '' },
};

function memoryStore() {
    const sessions = new Map<string, BuilderSession>();
    const validations = new Map<string, StoredValidation>();
    const locks = new Map<string, string>();
    const rates = new Map<string, number>();
    const store: BuilderStore = {
        async rate(key, limit) {
            const next = (rates.get(key) ?? 0) + 1;
            rates.set(key, next);
            if (next > limit) throw new Error('Rate limit reached');
        },
        async readSession(id) {
            const session = sessions.get(id);
            return session && session.expires > Date.now()
                ? structuredClone(session)
                : null;
        },
        async saveSession(id, session) {
            sessions.set(id, structuredClone(session));
        },
        async lockSession(id, lock) {
            if (locks.has(id)) return false;
            locks.set(id, lock);
            return true;
        },
        async unlockSession(id, lock) {
            if (locks.get(id) === lock) locks.delete(id);
        },
        async saveValidation(record) {
            validations.set(record.id, structuredClone(record));
        },
        async readValidation(id, session) {
            const record = validations.get(id);
            return record &&
                record.session_id === session &&
                Date.parse(record.expires_at) > Date.now()
                ? structuredClone(record)
                : null;
        },
        async claimValidation(id, session) {
            const record = validations.get(id);
            if (
                !record ||
                record.session_id !== session ||
                record.state !== 'ready'
            )
                return false;
            record.state = 'submitting';
            return true;
        },
        async finishValidation(id, state, submitted) {
            const record = validations.get(id)!;
            record.state = state;
            record.submitted = submitted;
        },
    };
    return { store, sessions, validations, locks };
}
function options(store: BuilderStore): EdgeOptions {
    return {
        store,
        settings,
        origins: [origin],
        supabaseUrl: 'https://project.example',
        publicKey: 'public',
        rateSalt: 'salt',
        programmeFetch: async () => new Response(body),
        github: async <T>(_token: string, route: string) => {
            if (route.endsWith('/git/ref/heads/dev'))
                return { object: { sha: 'base-sha' } } as T;
            if (route.includes('/git/trees/'))
                return {
                    tree: [
                        'scripts/configuredScraper.ts',
                        'scripts/embeddedAssignments.ts',
                        'shared/scraperConfig.ts',
                        'shared/scraperValues.ts',
                    ].map((path) => ({ path })),
                } as T;
            return { permissions: { push: true } } as T;
        },
    };
}
function request(
    route: string,
    token = '',
    data?: unknown,
    requestOrigin = origin
) {
    return new Request(
        `https://project.example/functions/v1/scraper-builder${route}`,
        {
            method: data === undefined ? 'GET' : 'POST',
            headers: {
                Origin: requestOrigin,
                'X-Builder-Session': token,
                'Content-Type': 'application/json',
            },
            body: data === undefined ? undefined : JSON.stringify(data),
        }
    );
}
async function bootstrap(
    context: ReturnType<typeof memoryStore>,
    authenticated = true
) {
    const response = await createEdgeHandler(options(context.store))(
        request('/session')
    );
    const result = await response.json();
    const token = result.sessionToken as string;
    const id = await hashToken(token);
    if (authenticated) {
        const session = context.sessions.get(id)!;
        session.token = 'github-token';
        session.login = 'writer';
    }
    return { token, id };
}

test('hosted sessions persist between workers, enforce login, origin and expiry, and never expose provider tokens', async () => {
    const context = memoryStore();
    const { token, id } = await bootstrap(context, false);
    let handle = createEdgeHandler(options(context.store));
    assert.equal(
        (await handle(request('/discover', token, { url: config.url }))).status,
        401
    );
    assert.equal(
        (
            await handle(
                request(
                    '/session',
                    token,
                    undefined,
                    'https://untrusted.example'
                )
            )
        ).status,
        403
    );
    context.sessions.get(id)!.token = 'provider-secret';
    context.sessions.get(id)!.login = 'writer';
    handle = createEdgeHandler(options(context.store));
    const response = await handle(request('/session', token));
    const status = await response.json();
    assert.equal(status.login, 'writer');
    assert.equal(status.edge, true);
    assert.doesNotMatch(JSON.stringify(status), /provider-secret|sessionToken/);
    assert.equal(
        context.sessions.has(token),
        false,
        'only the hash identifies stored sessions'
    );
    context.sessions.get(id)!.expires = 1;
    assert.equal(
        (await handle(request('/preview', token, config))).status,
        401
    );
});

test('OAuth callback consumes state bound to the originating browser session and stores login across workers', async (t) => {
    const context = memoryStore();
    const { token, id } = await bootstrap(context, false);
    const handle = createEdgeHandler(options(context.store));
    const started = await (
        await handle(request('/auth/start', token, {}))
    ).json();
    const state = new URL(started.url).searchParams.get('state');
    assert.ok(state);
    assert.ok(new URL(started.url).searchParams.get('code_challenge'));
    let exchanged = false;
    t.mock.method(
        globalThis,
        'fetch',
        async (url: string | URL, init?: RequestInit) => {
            if (String(url).endsWith('/login/oauth/access_token')) {
                const input = JSON.parse(String(init?.body));
                assert.equal(input.state, undefined);
                assert.ok(input.code_verifier);
                assert.equal(input.redirect_uri, settings.callbackUrl);
                exchanged = true;
                return Response.json({ access_token: 'private-oauth-token' });
            }
            return Response.json(
                String(url).endsWith('/user')
                    ? { login: 'writer' }
                    : { permissions: { push: true } }
            );
        }
    );
    const other = await bootstrap(context, false);
    assert.equal(
        (
            await handle(
                request('/auth/complete', other.token, { code: 'code', state })
            )
        ).status,
        400
    );
    assert.equal(exchanged, false);
    assert.equal(
        (
            await handle(
                request('/auth/complete', token, { code: 'code', state })
            )
        ).status,
        200
    );
    assert.equal(context.sessions.get(id)!.token, 'private-oauth-token');
    assert.equal(
        (
            await handle(
                request('/auth/complete', token, { code: 'code', state })
            )
        ).status,
        400
    );
    const fresh = createEdgeHandler(options(context.store));
    assert.equal(
        (await (await fresh(request('/session', token))).json()).login,
        'writer'
    );
});

test('hosted previews accept incomplete cinema metadata, block rendering and release distributed locks on failure', async () => {
    const context = memoryStore();
    const { token, id } = await bootstrap(context);
    const handle = createEdgeHandler(options(context.store));
    const response = await handle(
        request('/preview', token, {
            ...config,
            cinema: { defaultLanguage: 'it-IT' },
        })
    );
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.screenings, 1);
    assert.equal(result.preview[0].times[0], '2099-11-05T19:30:00.000Z');
    assert.equal(
        (await handle(request('/preview', token, { ...config, render: true })))
            .status,
        400
    );
    assert.equal(context.locks.size, 0);
    context.locks.set(id, crypto.randomUUID());
    assert.equal(
        (await handle(request('/preview', token, config))).status,
        409
    );
    context.locks.clear();
    assert.equal(
        (
            await handle(
                request('/discover', token, { url: config.url, browser: true })
            )
        ).status,
        400
    );
    assert.equal(
        (
            await handle(
                request('/discover', token, { url: 'http://127.0.0.1/private' })
            )
        ).status,
        400
    );
    assert.equal(
        (
            await handle(
                request('/preview', token, {
                    ...config,
                    title: { path: 'x'.repeat(100001) },
                })
            )
        ).status,
        400
    );
});

test('hosted validation persists trusted files, marks CI pending, and submits exactly one draft PR', async (t) => {
    const context = memoryStore();
    const { token } = await bootstrap(context);
    let prs = 0;
    t.mock.method(
        globalThis,
        'fetch',
        async (url: string | URL, init?: RequestInit) => {
            const path = String(url);
            if (path.includes('/rest/v1/new_cinemas')) return Response.json([]);
            if (path.endsWith('/pulls')) {
                const input = JSON.parse(String(init?.body));
                assert.equal(input.draft, true);
                assert.match(input.body, /pending GitHub Actions/);
                assert.doesNotMatch(input.body, /all unit tests.*passed/);
                prs++;
                return Response.json({
                    html_url: 'https://github.com/owner/CinemaCalendar/pull/1',
                });
            }
            if (path.endsWith('/git/ref/heads/dev'))
                return Response.json({ object: { sha: 'base-sha' } });
            if (path.endsWith('/git/commits/base-sha'))
                return Response.json({ tree: { sha: 'tree-sha' } });
            if (path.endsWith('/git/trees') || path.endsWith('/git/commits'))
                return Response.json({ sha: 'new-sha' });
            return Response.json({ permissions: { push: true } });
        }
    );
    const checked = await (
        await createEdgeHandler(options(context.store))(
            request('/validate', token, config)
        )
    ).json();
    assert.equal(checked.ok, true);
    assert.equal(checked.repositoryChecks, 'pending');
    assert.ok(checked.files.scraper);
    assert.equal(
        checked.checks.some((check: { name: string }) =>
            /Typecheck/.test(check.name)
        ),
        false
    );
    const other = await bootstrap(context);
    assert.equal(
        (
            await createEdgeHandler(options(context.store))(
                request('/pull-request', other.token, {
                    validationId: checked.id,
                })
            )
        ).status,
        400
    );
    const handle = createEdgeHandler(options(context.store));
    const result = await (
        await handle(
            request('/pull-request', token, { validationId: checked.id })
        )
    ).json();
    assert.equal(result.url, 'https://github.com/owner/CinemaCalendar/pull/1');
    const repeated = await (
        await createEdgeHandler(options(context.store))(
            request('/pull-request', token, { validationId: checked.id })
        )
    ).json();
    assert.deepEqual(result, repeated);
    assert.equal(prs, 1);
});

test('session encryption binds ciphertext to the hashed session ID and rejects tampering', async () => {
    const cipher = await sessionCipher('a'.repeat(64));
    const session = {
        csrf: '',
        token: 'secret-provider-token',
        expires: Date.now() + 10000,
    };
    const sealed = await cipher.seal(session, 'session-id');
    assert.doesNotMatch(sealed, /secret-provider-token/);
    assert.deepEqual(await cipher.open(sealed, 'session-id'), session);
    await assert.rejects(cipher.open(sealed, 'another-session'));
    await assert.rejects(
        cipher.open(sealed.slice(0, -4) + 'AAAA', 'session-id')
    );
});

test('REST storage locks, validation claims and cleanup quotas use server credentials and conditional writes', async () => {
    const calls: { url: string; method?: string; body?: unknown }[] = [];
    const store = createEdgeStore(
        'https://project.example',
        'server-secret',
        'b'.repeat(64),
        async (url, init) => {
            assert.equal(
                (init!.headers as Record<string, string>).apikey,
                'server-secret'
            );
            calls.push({
                url: String(url),
                method: init?.method,
                body: init?.body ? JSON.parse(String(init.body)) : undefined,
            });
            return Response.json(String(url).includes('/rpc/') ? true : [{}]);
        }
    );
    assert.equal(await store.lockSession('hash', 'lock'), true);
    assert.equal(await store.claimValidation('validation', 'hash'), true);
    await store.rate('requests:hash', 30, 60);
    assert.match(calls[0].url, /locked_until=lt/);
    assert.match(calls[1].url, /state=eq.ready.*expires_at=gt/);
    assert.deepEqual(calls[2].body, {
        bucket: 'requests:hash',
        max_calls: 30,
        window_seconds: 60,
    });
});

test('rotated encryption keys expire old sessions without blocking a fresh sign-in', async () => {
    const oldCipher = await sessionCipher('a'.repeat(64));
    const payload = await oldCipher.seal(
        { csrf: '', token: 'old-token', expires: Date.now() + 10000 },
        'id'
    );
    const store = createEdgeStore(
        'https://project.example',
        'server-secret',
        'b'.repeat(64),
        async () => Response.json([{ payload }])
    );
    assert.equal(await store.readSession('id'), null);
    assert.throws(
        () =>
            createEdgeStore(
                'https://project.example',
                'server-secret',
                'invalid-key'
            ),
        /64 hexadecimal/
    );
});
