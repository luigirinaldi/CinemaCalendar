import {
    ScraperConfigSchema,
    type ScraperConfig,
    type ValidationResult,
} from '../../shared/scraperConfig';
import { inspectHttp, sanitizedHtml } from './discovery';
import {
    parseConfiguredProgramme,
    captureConfiguredDetails,
    runConfiguredScraper,
} from '../configuredScraper';
import { generateFiles } from './generate';
import { parseLocationResults } from './geocoding';
import { publicProgrammeFetch, publicUrl } from './network';
import {
    beginLogin,
    finishLogin,
    githubRequest,
    createScraperPullRequest,
    type GitHubSettings,
    type BuilderSession,
} from './github';
import { sameCinema } from './cinemaIdentity';
import { hashToken, type BuilderStore } from './edgeStore';

export interface EdgeOptions {
    store: BuilderStore;
    settings: GitHubSettings;
    origins: string[];
    supabaseUrl: string;
    publicKey: string;
    rateSalt: string;
    programmeFetch?: typeof publicProgrammeFetch;
    github?: typeof githubRequest;
}

async function boundedBody(request: Request) {
    if (!request.body) throw new Error('Request body required');
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            size += value.length;
            if (size > 100000) throw new Error('Request exceeds 100 KB');
            chunks.push(value);
        }
    } finally {
        await reader.cancel();
    }
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.length;
    }
    return JSON.parse(new TextDecoder().decode(body)) as unknown;
}

export function createEdgeHandler(options: EdgeOptions) {
    const { store, settings } = options;
    const programmeFetch = options.programmeFetch ?? publicProgrammeFetch;
    const github = options.github ?? githubRequest;
    const repo = `/repos/${settings.owner}/${settings.repo}`;
    const requestGithub = <T>(session: BuilderSession, route: string) =>
        github<T>(session.token!, repo + route);
    async function checkDuplicates(
        config: ScraperConfig,
        session: BuilderSession
    ) {
        const current = await requestGithub<{ object: { sha: string } }>(
            session,
            `/git/ref/heads/${encodeURIComponent(settings.base)}`
        );
        const tree = await requestGithub<{
            truncated?: boolean;
            tree: { path: string }[];
        }>(session, `/git/trees/${current.object.sha}?recursive=1`);
        if (tree.truncated)
            throw new Error(
                'Repository tree is truncated; cannot complete the filename check'
            );
        const names = new Set(
            tree.tree.map((entry) => entry.path.toLowerCase())
        );
        if (
            names.has(`scripts/cinemas/${config.filename}`.toLowerCase()) ||
            names.has(
                `tests/${config.filename.replace(/\.ts$/, '.test.ts')}`.toLowerCase()
            )
        )
            throw new Error(
                'A scraper or test with that filename already exists'
            );
        for (const required of [
            'scripts/configuredScraper.ts',
            'scripts/embeddedAssignments.ts',
            'shared/scraperConfig.ts',
            'shared/scraperValues.ts',
        ])
            if (!names.has(required.toLowerCase()))
                throw new Error(
                    `Merge the builder runtime into ${settings.base} first: missing ${required}. Downloads and previews remain available.`
                );
        for (let from = 0; from < 100000; from += 500) {
            const response = await fetch(
                `${options.supabaseUrl}/rest/v1/new_cinemas?select=id,name,location,website&order=id&offset=${from}&limit=500`,
                {
                    headers: { apikey: options.publicKey },
                    signal: AbortSignal.timeout(12000),
                }
            );
            if (!response.ok)
                throw new Error('Cannot read the public cinema catalogue');
            const rows = (await response.json()) as {
                name: string;
                location: string | null;
                website: string | null;
            }[];
            if (rows.some((row) => sameCinema(config, row)))
                throw new Error('This cinema already exists in the catalogue');
            if (!rows.length) return current.object.sha;
        }
        throw new Error('Catalogue check exceeded its row limit');
    }
    const preview = (
        films: ReturnType<typeof parseConfiguredProgramme>[number]['showings']
    ) =>
        films.slice(0, 10).map((film) => ({
            title: film.film.title,
            times: film.showings.map((showing) => showing.startTime),
        }));

    return async function handle(request: Request): Promise<Response> {
        const origin = request.headers.get('origin') ?? '';
        const cors = {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Headers':
                'content-type,apikey,x-builder-session',
            'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
            Vary: 'Origin',
            'Cache-Control': 'no-store',
        };
        const json = (value: unknown, status = 200) =>
            Response.json(value, { status, headers: cors });
        if (!options.origins.includes(origin))
            return Response.json(
                { error: 'Frontend origin is not allowed' },
                { status: 403 }
            );
        if (request.method === 'OPTIONS')
            return new Response(null, { status: 204, headers: cors });
        const route =
            new URL(request.url).pathname.split('/scraper-builder')[1] ||
            '/session';
        let lockedId = '';
        let lock = '';
        try {
            const token = request.headers.get('x-builder-session');
            const id =
                token && /^[a-f0-9]{64}$/.test(token)
                    ? await hashToken(token)
                    : '';
            let session = id ? await store.readSession(id) : null;
            if (route === '/session' && request.method === 'GET') {
                let sessionToken: string | undefined;
                if (!session) {
                    await store.rate('bootstrap:global', 300, 3600);
                    const ip =
                        request.headers
                            .get('x-forwarded-for')
                            ?.split(',')[0]
                            .trim() || 'unknown';
                    await store.rate(
                        `bootstrap:${await hashToken(options.rateSalt + ip)}`,
                        20,
                        3600
                    );
                    sessionToken = [
                        ...crypto.getRandomValues(new Uint8Array(32)),
                    ]
                        .map((byte) => byte.toString(16).padStart(2, '0'))
                        .join('');
                    session = {
                        csrf: '',
                        expires: Date.now() + 4 * 60 * 60 * 1000,
                    };
                    await store.saveSession(
                        await hashToken(sessionToken),
                        session
                    );
                }
                return json({
                    csrf: '',
                    login: session.login ?? null,
                    githubConfigured:
                        !!settings.clientId && !!settings.clientSecret,
                    local: false,
                    edge: true,
                    repository: `${settings.owner}/${settings.repo}`,
                    base: settings.base,
                    ...(sessionToken ? { sessionToken } : {}),
                });
            }
            if (!session || session.expires < Date.now())
                return json(
                    {
                        error: 'Session expired. Refresh the helper and sign in again.',
                    },
                    401
                );
            if (request.method !== 'POST')
                return json({ error: 'Method not allowed' }, 405);
            lock = crypto.randomUUID();
            if (!(await store.lockSession(id, lock)))
                return json(
                    {
                        error: 'Another operation is running in this session. Try again shortly.',
                    },
                    409
                );
            lockedId = id;
            session = await store.readSession(id);
            if (!session) return json({ error: 'Session expired' }, 401);
            await store.rate(`requests:${id}`, 30, 60);
            const input = await boundedBody(request);
            if (route === '/auth/start') {
                const url = beginLogin(settings, session);
                await store.saveSession(id, session);
                return json({ url });
            }
            if (route === '/auth/complete') {
                const { code, state } = input as {
                    code?: string;
                    state?: string;
                };
                const params = new URLSearchParams({
                    code: code ?? '',
                    state: state ?? '',
                });
                try {
                    await finishLogin(settings, session, params);
                } finally {
                    await store.saveSession(id, session);
                }
                return json({ ok: true });
            }
            if (route === '/logout') {
                delete session.token;
                delete session.login;
                delete session.oauth;
                await store.saveSession(id, session);
                return json({ ok: true });
            }
            if (!session.token || !session.login)
                return json(
                    {
                        error: 'Sign in with a GitHub account that has repository write access first.',
                    },
                    401
                );
            // Recheck access on every hosted operation; revocations take effect immediately.
            const permission = await requestGithub<{
                permissions?: { push?: boolean };
            }>(session, '');
            if (!permission.permissions?.push)
                return json(
                    { error: 'Repository write access is required' },
                    403
                );
            if (route === '/discover') {
                const draft = input as { url?: string; browser?: boolean };
                if (draft.browser)
                    throw new Error(
                        'Browser inspection is available only in the local companion. Disable JavaScript inspection for hosted discovery.'
                    );
                if (typeof draft.url !== 'string')
                    throw new Error('Enter a programme URL');
                const { raw: _raw, ...result } = await inspectHttp(
                    draft.url,
                    programmeFetch
                );
                return json(result);
            }
            if (route === '/page-preview') {
                const url = (input as { url?: unknown }).url;
                if (typeof url !== 'string')
                    throw new Error('Enter a film page URL');
                publicUrl(url);
                const response = await programmeFetch(url);
                if (!response.ok)
                    throw new Error(`Film page HTTP ${response.status}`);
                return json({
                    url: response.url || url,
                    html: sanitizedHtml(await response.text()),
                });
            }
            if (route === '/location-search') {
                const query = (input as { query?: unknown }).query;
                if (
                    typeof query !== 'string' ||
                    query.trim().length < 3 ||
                    query.length > 250
                )
                    throw new Error(
                        'Enter a cinema name and city (3–250 characters)'
                    );
                await store.rate('geocoder:global', 1, 1);
                const url = new URL('https://photon.komoot.io/api/');
                url.searchParams.set('q', query.trim());
                url.searchParams.set('limit', '5');
                const response = await programmeFetch(url.href);
                if (!response.ok)
                    throw new Error(
                        `Location search HTTP ${response.status}; coordinates can be entered manually`
                    );
                return json({
                    results: parseLocationResults(await response.json()),
                });
            }
            if (route === '/preview' || route === '/validate') {
                const draft = input as ScraperConfig;
                const config = ScraperConfigSchema.parse(
                    route === '/preview'
                        ? {
                              ...draft,
                              filename: 'previewCinema.ts',
                              cinema: {
                                  name: 'Preview',
                                  location: 'Preview',
                                  website: draft.cinema?.website || draft.url,
                                  defaultLanguage:
                                      draft.cinema?.defaultLanguage || 'en-GB',
                                  coordinates: { lat: '0', lng: '0' },
                              },
                          }
                        : draft
                );
                if (config.render)
                    throw new Error(
                        'Rendered programmes require the local companion. Hosted mode supports HTTP sources.'
                    );
                publicUrl(config.url);
                const response = await programmeFetch(config.url);
                if (!response.ok)
                    throw new Error(`Programme HTTP ${response.status}`);
                const body = await captureConfiguredDetails(
                    config,
                    await response.text(),
                    programmeFetch
                );
                if (route === '/preview') {
                    const films = parseConfiguredProgramme(config, body)[0]
                        .showings;
                    return json({
                        films: films.length,
                        screenings: films.reduce(
                            (total, film) => total + film.showings.length,
                            0
                        ),
                        preview: preview(films),
                    });
                }
                const result: ValidationResult = {
                    id: crypto.randomUUID(),
                    ok: false,
                    checks: [],
                    preview: [],
                    files: null,
                    repositoryChecks: 'pending',
                };
                try {
                    const first = parseConfiguredProgramme(config, body)[0]
                        .showings;
                    result.files = generateFiles(config, body);
                    result.preview = preview(first);
                    result.checks.push({
                        name: 'Captured fixture and file generation',
                        ok: true,
                        detail: 'Files are available for download. Review the selected fields.',
                    });
                    const films = (
                        await runConfiguredScraper(config, {
                            fetch: programmeFetch,
                        })
                    ).flatMap((cinema) => cinema.showings);
                    if (
                        !films.some((film) =>
                            film.showings.some(
                                (showing) =>
                                    Date.parse(showing.startTime) > Date.now()
                            )
                        )
                    )
                        throw new Error('Map at least one upcoming screening');
                    result.preview = preview(films);
                    result.checks.push({
                        name: 'Live mapping',
                        ok: true,
                        detail: `${films.length} films; complete API pagination and upcoming screenings checked.`,
                    });
                    const baseSha = await checkDuplicates(config, session);
                    result.checks.push({
                        name: 'Catalogue and repository filename',
                        ok: true,
                        detail: 'Cinema not in the catalogue; scraper/test filenames are unused.',
                    });
                    result.ok = true;
                    await store.saveValidation({
                        id: result.id,
                        session_id: id,
                        config,
                        result,
                        base_sha: baseSha,
                        expires_at: new Date(Date.now() + 600000).toISOString(),
                        state: 'ready',
                    });
                } catch (error) {
                    result.ok = false;
                    result.checks.push({
                        name: 'Validation stopped',
                        ok: false,
                        detail:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    });
                }
                return json(result);
            }
            if (route === '/pull-request') {
                const validationId = (input as { validationId?: unknown })
                    .validationId;
                if (
                    typeof validationId !== 'string' ||
                    !/^[a-f0-9-]{36}$/.test(validationId)
                )
                    throw new Error('Validate again before submitting');
                const record = await store.readValidation(validationId, id);
                if (!record || !record.result.ok || !record.result.files)
                    throw new Error(
                        'Validation expired. Validate again before submitting.'
                    );
                if (record.state === 'submitted' && record.submitted)
                    return json(record.submitted);
                if (!(await store.claimValidation(validationId, id)))
                    return json(
                        {
                            error: 'This validation was already submitted or its submission is in progress. Check GitHub before validating again.',
                        },
                        409
                    );
                const branch = `cinema/${record.config.filename.replace(/\.ts$/, '')}-${record.id.slice(0, 12)}`;
                try {
                    if (
                        (await checkDuplicates(record.config, session)) !==
                        record.base_sha
                    )
                        throw new Error(
                            'The base branch changed. Validate again.'
                        );
                    const submitted = await createScraperPullRequest(
                        settings,
                        session,
                        record.config,
                        record.result.files,
                        record.base_sha,
                        { draft: true, branch }
                    );
                    await store.finishValidation(
                        validationId,
                        'submitted',
                        submitted
                    );
                    return json(submitted);
                } catch (error) {
                    await store.finishValidation(validationId, 'failed');
                    throw new Error(
                        `${error instanceof Error ? error.message : String(error)} If a branch was created, recover it at https://github.com/${settings.owner}/${settings.repo}/tree/${branch}`
                    );
                }
            }
            return json({ error: 'Builder endpoint not found' }, 404);
        } catch (error) {
            return json(
                {
                    error:
                        error instanceof Error
                            ? error.message
                            : 'Builder request failed',
                },
                400
            );
        } finally {
            if (lockedId)
                await store.unlockSession(lockedId, lock).catch(() => {});
        }
    };
}
