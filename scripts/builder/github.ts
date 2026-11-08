import { createHash, randomBytes } from 'node:crypto';
import type { GeneratedFiles, ScraperConfig } from '../../shared/scraperConfig';

export interface GitHubSettings {
    clientId: string;
    clientSecret: string;
    callbackUrl: string;
    owner: string;
    repo: string;
    base: string;
}
export interface BuilderSession {
    csrf: string;
    expires: number;
    token?: string;
    login?: string;
    oauth?: { state: string; verifier: string; expires: number };
}
export async function githubRequest<T>(
    token: string,
    route: string,
    method = 'GET',
    body?: unknown
): Promise<T> {
    const response = await fetch(`https://api.github.com${route}`, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/json',
        },
        body: body == null ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
        throw new Error(
            `GitHub ${response.status}: ${((await response.json()) as { message?: string }).message ?? 'Request failed'}`
        );
    return (await response.json()) as T;
}
export function beginLogin(settings: GitHubSettings, session: BuilderSession) {
    if (!settings.clientId || !settings.clientSecret)
        throw new Error(
            'Register a GitHub OAuth app and configure the builder service credentials first'
        );
    const state = randomBytes(24).toString('hex');
    const verifier = randomBytes(32).toString('base64url');
    session.oauth = { state, verifier, expires: Date.now() + 600000 };
    const params = new URLSearchParams({
        client_id: settings.clientId,
        redirect_uri: settings.callbackUrl,
        scope: 'public_repo',
        state,
        code_challenge: createHash('sha256')
            .update(verifier)
            .digest('base64url'),
        code_challenge_method: 'S256',
    });
    return `https://github.com/login/oauth/authorize?${params}`;
}
export async function finishLogin(
    settings: GitHubSettings,
    session: BuilderSession,
    params: URLSearchParams
) {
    const oauth = session.oauth;
    delete session.oauth;
    if (
        !oauth ||
        oauth.expires < Date.now() ||
        params.get('state') !== oauth.state ||
        !params.get('code')
    )
        throw new Error('GitHub login expired or was cancelled. Try again.');
    const response = await fetch(
        'https://github.com/login/oauth/access_token',
        {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                client_id: settings.clientId,
                client_secret: settings.clientSecret,
                redirect_uri: settings.callbackUrl,
                code: params.get('code'),
                code_verifier: oauth.verifier,
            }),
            signal: AbortSignal.timeout(15000),
        }
    );
    const result = (await response.json()) as {
        access_token?: string;
        error_description?: string;
    };
    if (!response.ok || !result.access_token)
        throw new Error('GitHub could not complete sign-in');
    const user = await githubRequest<{ login: string }>(
        result.access_token,
        '/user'
    );
    const repo = await githubRequest<{ permissions?: { push?: boolean } }>(
        result.access_token,
        `/repos/${settings.owner}/${settings.repo}`
    );
    if (!repo.permissions?.push)
        throw new Error(
            'This GitHub account needs write access to the configured repository'
        );
    session.token = result.access_token;
    session.login = user.login;
    session.expires = Date.now() + 4 * 60 * 60 * 1000;
}

export async function createScraperPullRequest(
    settings: GitHubSettings,
    session: BuilderSession,
    config: ScraperConfig,
    files: GeneratedFiles,
    baseSha: string,
    options: { draft?: boolean; branch?: string } = {}
) {
    if (!session.token)
        throw new Error('Sign in with GitHub before opening a pull request');
    const prefix = `/repos/${settings.owner}/${settings.repo}`;
    const request = <T>(route: string, method = 'GET', body?: unknown) =>
        githubRequest<T>(session.token!, prefix + route, method, body);
    const repo = await request<{ permissions?: { push?: boolean } }>('');
    if (!repo.permissions?.push)
        throw new Error('Repository write access is required');
    const current = await request<{ object: { sha: string } }>(
        `/git/ref/heads/${encodeURIComponent(settings.base)}`
    );
    if (current.object.sha !== baseSha)
        throw new Error(
            'The base branch changed or differs from this checkout. Update it and validate again.'
        );
    const commit = await request<{ tree: { sha: string } }>(
        `/git/commits/${baseSha}`
    );
    const tree = await request<{ sha: string }>('/git/trees', 'POST', {
        base_tree: commit.tree.sha,
        tree: [
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
        ],
    });
    const next = await request<{ sha: string }>('/git/commits', 'POST', {
        message: `Add ${config.cinema.name} scraper\n\nGenerated from reviewed public programme mappings. ${options.draft ? 'Live mapping checked; repository checks will run in GitHub Actions.' : 'Live extraction, duplicate checks, typechecking, fixture tests and regression tests passed before submission.'}`,
        tree: tree.sha,
        parents: [baseSha],
    });
    const branch =
        options.branch ??
        `cinema/${config.filename.replace(/\.ts$/, '')}-${randomBytes(4).toString('hex')}`;
    await request('/git/refs', 'POST', {
        ref: `refs/heads/${branch}`,
        sha: next.sha,
    });
    try {
        const pr = await request<{ html_url: string }>('/pulls', 'POST', {
            title: `Add ${config.cinema.name} scraper`,
            head: branch,
            base: settings.base,
            ...(options.draft ? { draft: true } : {}),
            body: `Adds ${config.cinema.name} in ${config.cinema.location} using the ${config.embeddedJson ? 'embedded data' : config.mode === 'json' ? 'public GET API' : config.render ? 'rendered HTML' : 'static HTML'} programme at ${config.url}.\n\nIncludes a captured fixture test. ${options.draft ? 'The hosted builder checked catalogue/filename duplicates and live extraction with upcoming screenings. Typechecking, tests, lint and build are pending GitHub Actions. Keep this PR in draft until those checks pass and the mapping has been reviewed.' : 'The builder checked duplicate cinemas, live extraction with upcoming screenings, both TypeScript projects, all unit tests and generated-file lint before creating this branch. Review the mapping and preview before merging.'} No database changes or automatic merge are performed.`,
        });
        return { url: pr.html_url, branch };
    } catch (error) {
        // Keep the validated branch so a failed PR request can be recovered manually.
        throw new Error(
            `Branch ${branch} was created, but the pull request could not be opened: ${error instanceof Error ? error.message : 'GitHub error'}`
        );
    }
}
