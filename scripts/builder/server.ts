import {
    createServer,
    type IncomingMessage,
    type ServerResponse,
} from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import { loadEnv } from 'vite';
import {
    ScraperConfigSchema,
    type ValidationResult,
    type ScraperConfig,
} from '../../shared/scraperConfig';
import { inspectWebsite } from './discovery';
import { publicFetch, publicProgrammeFetch } from './network';
import { createCinemaGeocoder } from './geocoding';
import {
    parseConfiguredProgramme,
    runConfiguredScraper,
} from '../configuredScraper';
import { generateFiles } from './generate';
import { checkDuplicate, checkGeneratedFiles, command } from './checks';
import {
    beginLogin,
    finishLogin,
    createScraperPullRequest,
    type BuilderSession,
    type GitHubSettings,
} from './github';

const root = path.resolve(process.cwd());
const env = { ...loadEnv('development', root, ''), ...process.env };
const host = env.BUILDER_HOST ?? '127.0.0.1';
const port = Number(env.BUILDER_PORT ?? 8788);
const pageUrl = new URL(
    env.BUILDER_PAGE_URL ?? 'http://localhost:5173/CinemaCalendar/#/add-cinema'
);
const local = host === '127.0.0.1' || host === 'localhost';
const origins = new Set([pageUrl.origin]);
if (local && ['localhost', '127.0.0.1'].includes(pageUrl.hostname)) {
    const alternate = new URL(pageUrl);
    alternate.hostname =
        pageUrl.hostname === 'localhost' ? '127.0.0.1' : 'localhost';
    origins.add(alternate.origin);
}
const settings: GitHubSettings = {
    clientId: env.BUILDER_GITHUB_CLIENT_ID ?? '',
    clientSecret: env.BUILDER_GITHUB_CLIENT_SECRET ?? '',
    callbackUrl:
        env.BUILDER_GITHUB_CALLBACK_URL ??
        `${pageUrl.origin}/builder-api/auth/callback`,
    owner: env.BUILDER_GITHUB_OWNER ?? 'luigirinaldi',
    repo: env.BUILDER_GITHUB_REPO ?? 'CinemaCalendar',
    base: env.BUILDER_GITHUB_BASE ?? 'dev',
};
if (
    !local &&
    (!settings.clientId ||
        !settings.clientSecret ||
        pageUrl.protocol !== 'https:')
)
    throw new Error(
        'Hosted builder requires GitHub OAuth and an HTTPS frontend'
    );
if (
    !/^[\w.-]+$/.test(settings.owner) ||
    !/^[\w.-]+$/.test(settings.repo) ||
    !/^[\w./-]+$/.test(settings.base)
)
    throw new Error('Invalid GitHub repository settings');
const sessions = new Map<string, BuilderSession>();
const snapshots = new Map<
    BuilderSession,
    { url: string; browser: boolean; body: string; expires: number }
>();
const validations = new Map<
    string,
    {
        session: BuilderSession;
        config: ScraperConfig;
        result: ValidationResult;
        baseSha: string;
        cleanCheckout: boolean;
        expires: number;
        submitted?: { url: string; branch: string };
    }
>();
let busy = false;
const searchCinemaLocation = createCinemaGeocoder({
    endpoint: env.BUILDER_GEOCODER_URL,
});
const inspect = (url: string, browser = false) =>
    inspectWebsite(url, {
        browser,
        channel: env.BUILDER_BROWSER_CHANNEL || undefined,
    });

async function jsonBody(request: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
        size += chunk.length;
        if (size > 100000) throw new Error('Request exceeds 100 KB');
        chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString());
}
function json(response: ServerResponse, value: unknown, status = 200) {
    response.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
    });
    response.end(JSON.stringify(value));
}

export const server = createServer(async (request, response) => {
    try {
        const origin = request.headers.origin;
        if (origin && !origins.has(origin)) {
            json(response, { error: 'Frontend origin is not allowed' }, 403);
            return;
        }
        if (origin) {
            response.setHeader('Access-Control-Allow-Origin', origin);
            response.setHeader('Access-Control-Allow-Credentials', 'true');
            response.setHeader('Vary', 'Origin');
        }
        if (request.method === 'OPTIONS') {
            response.writeHead(204, {
                'Access-Control-Allow-Headers': 'Content-Type,X-Builder-CSRF',
                'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
            });
            response.end();
            return;
        }
        const url = new URL(request.url ?? '/', 'http://builder.local');
        const sessionId = request.headers.cookie?.match(
            /(?:^|;\s*)cinema_builder=([a-f0-9]{48})/
        )?.[1];
        let session = sessionId ? sessions.get(sessionId) : undefined;
        if (!session || session.expires < Date.now()) {
            if (sessions.size >= 256) {
                const oldest = sessions.keys().next().value;
                if (oldest) sessions.delete(oldest);
            }
            const id = randomBytes(24).toString('hex');
            session = {
                csrf: randomBytes(24).toString('hex'),
                expires: Date.now() + 4 * 60 * 60 * 1000,
            };
            sessions.set(id, session);
            response.setHeader(
                'Set-Cookie',
                `cinema_builder=${id}; HttpOnly; SameSite=Lax; Path=/builder-api; Max-Age=14400${!local ? '; Secure' : ''}`
            );
        }
        if (
            url.pathname === '/builder-api/auth/github' &&
            request.method === 'GET'
        ) {
            response.writeHead(302, {
                Location: beginLogin(settings, session),
            });
            response.end();
            return;
        }
        if (
            url.pathname === '/builder-api/auth/callback' &&
            request.method === 'GET'
        ) {
            const destination = new URL(pageUrl);
            try {
                await finishLogin(settings, session, url.searchParams);
            } catch {
                destination.searchParams.set(
                    'builderError',
                    'GitHub sign-in failed. Check repository access and OAuth settings.'
                );
            }
            response.writeHead(302, { Location: destination.href });
            response.end();
            return;
        }
        if (
            url.pathname === '/builder-api/session' &&
            request.method === 'GET'
        ) {
            json(response, {
                csrf: session.csrf,
                login: session.login ?? null,
                githubConfigured:
                    !!settings.clientId && !!settings.clientSecret,
                local,
                repository: `${settings.owner}/${settings.repo}`,
                base: settings.base,
            });
            return;
        }
        if (
            request.method !== 'POST' ||
            !origin ||
            request.headers['x-builder-csrf'] !== session.csrf
        ) {
            json(response, { error: 'Invalid builder request' }, 403);
            return;
        }
        if (url.pathname === '/builder-api/logout') {
            delete session.token;
            delete session.login;
            json(response, { ok: true });
            return;
        }
        if (!local && !session.token) {
            json(response, { error: 'Sign in with GitHub first' }, 401);
            return;
        }
        if (busy) {
            json(
                response,
                {
                    error: 'Another inspection or check is running. Try again shortly.',
                },
                409
            );
            return;
        }
        busy = true;
        try {
            const input = await jsonBody(request);
            if (url.pathname === '/builder-api/location-search') {
                const query = (input as { query?: unknown })?.query;
                json(response, { results: await searchCinemaLocation(query) });
                return;
            }
            if (url.pathname === '/builder-api/discover') {
                const parsed = input as { url?: unknown; browser?: unknown };
                if (typeof parsed.url !== 'string')
                    throw new Error('Enter a cinema programme URL');
                const { raw, ...result } = await inspect(
                    parsed.url,
                    parsed.browser === true
                );
                if (snapshots.size >= 32)
                    snapshots.delete(snapshots.keys().next().value!);
                snapshots.set(session, {
                    url: result.url,
                    browser: !!result.rendered,
                    body: raw,
                    expires: Date.now() + 15 * 60 * 1000,
                });
                json(response, result);
                return;
            }
            if (url.pathname === '/builder-api/preview') {
                const draft = input as ScraperConfig;
                const config = ScraperConfigSchema.parse({
                    ...draft,
                    filename: 'previewCinema.ts',
                    cinema: {
                        name: 'Preview cinema',
                        location: 'Preview',
                        website: draft.url,
                        defaultLanguage:
                            draft.cinema?.defaultLanguage || 'en-GB',
                        coordinates: { lat: '0', lng: '0' },
                    },
                });
                const snapshot = snapshots.get(session);
                let body: string;
                if (
                    snapshot &&
                    snapshot.url === config.url &&
                    snapshot.browser === config.render &&
                    snapshot.expires > Date.now() &&
                    snapshot.body
                )
                    body = snapshot.body;
                else if (config.render)
                    body = (await inspect(config.url, true)).raw;
                else {
                    const response = await publicProgrammeFetch(config.url);
                    if (!response.ok)
                        throw new Error(`Programme HTTP ${response.status}`);
                    body = await response.text();
                }
                const films = parseConfiguredProgramme(config, body)[0]
                    .showings;
                json(response, {
                    films: films.length,
                    screenings: films.reduce(
                        (total, film) => total + film.showings.length,
                        0
                    ),
                    preview: films
                        .slice(0, 10)
                        .map((film) => ({
                            title: film.film.title,
                            times: film.showings.map(
                                (showing) => showing.startTime
                            ),
                        })),
                });
                return;
            }
            if (url.pathname === '/builder-api/validate') {
                const config = ScraperConfigSchema.parse(input);
                const result: ValidationResult = {
                    id: randomUUID(),
                    ok: false,
                    checks: [],
                    preview: [],
                    files: null,
                };
                let baseSha = '';
                const cleanCheckout = !(
                    await command(root, 'git', ['status', '--porcelain'])
                ).trim();
                try {
                    await checkDuplicate(
                        config,
                        root,
                        env.VITE_SUPABASE_URL ?? '',
                        env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY ?? ''
                    );
                    result.checks.push({
                        name: 'Duplicate cinema and filename',
                        ok: true,
                        detail: 'Not found in the catalogue or existing scrapers.',
                    });
                    const inspection =
                        config.mode === 'html' || config.embeddedJson
                            ? await inspect(config.url, config.render)
                            : null;
                    const responseBody = inspection
                        ? inspection.raw
                        : await (await publicProgrammeFetch(config.url)).text();
                    const live = await runConfiguredScraper(config, {
                        fetch:
                            config.mode === 'json'
                                ? publicProgrammeFetch
                                : publicFetch,
                        render: async () => inspection!.raw,
                    });
                    const films = live.flatMap((row) => row.showings);
                    if (
                        !films.length ||
                        !films.some((film) =>
                            film.showings.some(
                                (showing) =>
                                    Date.parse(showing.startTime) > Date.now()
                            )
                        )
                    )
                        throw new Error(
                            'The mapped programme must contain at least one upcoming screening'
                        );
                    result.preview = films.slice(0, 10).map((film) => ({
                        title: film.film.title,
                        times: film.showings.map((s) => s.startTime),
                    }));
                    result.files = generateFiles(config, responseBody);
                    parseConfiguredProgramme(config, responseBody);
                    result.checks.push({
                        name: 'Live programme and runtime schema',
                        ok: true,
                        detail: `${films.length} films; upcoming screenings and valid timezone-aware dates found.`,
                    });
                    const output = await checkGeneratedFiles(
                        root,
                        result.files
                    );
                    result.checks.push({
                        name: 'Typecheck, all tests and generated-file lint',
                        ok: true,
                        detail: output.slice(-2500),
                    });
                    baseSha = (
                        await command(root, 'git', ['rev-parse', 'HEAD'])
                    ).trim();
                    result.ok = true;
                } catch (error) {
                    result.checks.push({
                        name: 'Validation stopped',
                        ok: false,
                        detail:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    });
                }
                if (result.ok)
                    validations.set(result.id, {
                        session,
                        config,
                        result,
                        baseSha,
                        cleanCheckout,
                        expires: Date.now() + 600000,
                    });
                json(response, result);
                return;
            }
            if (url.pathname === '/builder-api/pull-request') {
                const id = (input as { validationId?: unknown }).validationId;
                const record =
                    typeof id === 'string' ? validations.get(id) : undefined;
                if (
                    !record ||
                    record.session !== session ||
                    !record.result.ok ||
                    !record.result.files ||
                    record.expires < Date.now()
                )
                    throw new Error(
                        'Validate this scraper again before submitting'
                    );
                if (record.submitted) {
                    json(response, record.submitted);
                    return;
                }
                if (!session.token)
                    throw new Error('Sign in with GitHub first');
                if (!record.cleanCheckout)
                    throw new Error(
                        'This validation used uncommitted service changes. Commit the service changes, then validate again.'
                    );
                if (
                    (
                        await command(root, 'git', ['status', '--porcelain'])
                    ).trim()
                )
                    throw new Error(
                        'The service checkout has uncommitted changes. Commit them, then validate again.'
                    );
                if (
                    (
                        await command(root, 'git', ['rev-parse', 'HEAD'])
                    ).trim() !== record.baseSha
                )
                    throw new Error('The checkout changed. Validate again.');
                await checkDuplicate(
                    record.config,
                    root,
                    env.VITE_SUPABASE_URL ?? '',
                    env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY ?? ''
                );
                record.submitted = await createScraperPullRequest(
                    settings,
                    session,
                    record.config,
                    record.result.files,
                    record.baseSha
                );
                json(response, record.submitted);
                return;
            }
            json(response, { error: 'Builder endpoint not found' }, 404);
        } finally {
            busy = false;
        }
    } catch (error) {
        json(
            response,
            {
                error:
                    error instanceof Error
                        ? error.message
                        : 'Builder request failed',
            },
            400
        );
    }
});
const cleanup = setInterval(() => {
    for (const [id, session] of sessions)
        if (session.expires < Date.now()) sessions.delete(id);
    for (const [id, record] of validations)
        if (record.expires < Date.now()) validations.delete(id);
}, 60000);
cleanup.unref();
server.listen(port, host, () =>
    console.log(
        `Scraper builder listening at http://${host}:${port}. Open ${pageUrl.href}`
    )
);
