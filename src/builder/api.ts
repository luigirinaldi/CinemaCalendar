import type {
    Discovery,
    ScraperConfig,
    ValidationResult,
} from '../../shared/scraperConfig';
import type { CinemaLocationResult } from '../../shared/cinemaLocation';

const base = (
    import.meta.env.VITE_SCRAPER_BUILDER_URL ??
    (import.meta.env.DEV
        ? '/builder-api'
        : `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scraper-builder`)
).replace(/\/$/, '');
export const hostedBuilder = /\/functions\/v1\/scraper-builder$/.test(base);
const tokenKey = `cinema-builder-session:${base}`;
export interface BuilderStatus {
    csrf: string;
    login: string | null;
    githubConfigured: boolean;
    local: boolean;
    repository: string;
    base: string;
    edge?: boolean;
}
async function request<T>(
    route: string,
    csrf?: string,
    body?: unknown
): Promise<T> {
    const response = await fetch(`${base}${route}`, {
        method: body == null ? 'GET' : 'POST',
        credentials: hostedBuilder ? 'omit' : 'include',
        headers: {
            ...(body == null ? {} : { 'Content-Type': 'application/json' }),
            ...(hostedBuilder
                ? {
                      apikey: import.meta.env
                          .VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY,
                      'X-Builder-Session': localStorage.getItem(tokenKey) ?? '',
                  }
                : body == null
                  ? {}
                  : { 'X-Builder-CSRF': csrf ?? '' }),
        },
        body: body == null ? undefined : JSON.stringify(body),
    });
    const data = (await response.json().catch(() => {
        throw new Error(
            hostedBuilder
                ? 'The hosted builder is unavailable. Check that the scraper-builder Edge Function and its migration have been deployed.'
                : 'The local builder service is unavailable. Start npm run scraper_builder alongside the site.'
        );
    })) as T & { error?: string; sessionToken?: string };
    if (hostedBuilder && response.ok && data.sessionToken)
        localStorage.setItem(tokenKey, data.sessionToken);
    if (response.status === 404)
        throw new Error(
            hostedBuilder
                ? 'The hosted builder endpoint was not found. Deploy the function and check VITE_SCRAPER_BUILDER_URL.'
                : 'The builder service is out of date or its URL is incorrect. Restart npm run scraper_builder, then refresh this page.'
        );
    if (response.status === 403 && data.error === 'Invalid builder request')
        throw new Error(
            'The builder service restarted or your session expired. Refresh this page, then try again.'
        );
    if (!response.ok)
        throw new Error(data.error ?? `Builder HTTP ${response.status}`);
    return data;
}
export const builderApi = {
    searchLocation: (csrf: string, query: string) =>
        request<{ results: CinemaLocationResult[] }>('/location-search', csrf, {
            query,
        }),
    session: async () => {
        let status = await request<BuilderStatus>('/session');
        const url = new URL(location.href);
        if (hostedBuilder && url.searchParams.get('builderLogin') === '1') {
            const code = url.searchParams.get('code');
            const state = url.searchParams.get('state');
            const error =
                url.searchParams.get('error_description') ||
                url.searchParams.get('error');
            for (const key of [
                'builderLogin',
                'code',
                'state',
                'error',
                'error_description',
            ])
                url.searchParams.delete(key);
            url.hash = '#/add-cinema';
            history.replaceState(null, '', url);
            if (error) throw new Error(`GitHub sign-in failed: ${error}`);
            if (!code || !state)
                throw new Error(
                    'GitHub sign-in did not return a code and state. Try again.'
                );
            await request('/auth/complete', '', { code, state });
            status = await request<BuilderStatus>('/session');
        }
        return status;
    },
    login: async (csrf: string) =>
        hostedBuilder
            ? (await request<{ url: string }>('/auth/start', csrf, {})).url
            : `${base}/auth/github`,
    discover: (csrf: string, url: string, browser = false) =>
        request<Discovery>('/discover', csrf, { url, browser }),
    pagePreview: (csrf: string, url: string) =>
        request<{ url: string; html: string }>('/page-preview', csrf, { url }),
    validate: (csrf: string, config: ScraperConfig) =>
        request<ValidationResult>('/validate', csrf, config),
    preview: (csrf: string, config: ScraperConfig) =>
        request<{
            films: number;
            screenings: number;
            preview: ValidationResult['preview'];
        }>('/preview', csrf, config),
    submit: (csrf: string, validationId: string) =>
        request<{ url: string; branch: string }>('/pull-request', csrf, {
            validationId,
        }),
    logout: (csrf: string) => request('/logout', csrf, {}),
    loginUrl: `${base}/auth/github`,
};
