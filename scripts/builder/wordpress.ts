import { publicProgrammeFetch, publicUrl } from './network';

type JsonObject = Record<string, unknown>;
const object = (value: unknown): value is JsonObject =>
    !!value && typeof value === 'object' && !Array.isArray(value);
export function isWordPressIndex(
    value: unknown
): value is JsonObject & { routes: JsonObject } {
    return (
        object(value) &&
        object(value.routes) &&
        (Array.isArray(value.namespaces) || typeof value.namespace === 'string')
    );
}
const getMethod = (value: unknown) =>
    Array.isArray(value)
        ? value.includes('GET')
        : typeof value === 'string'
          ? value.split(/[\s,]+/).includes('GET')
          : object(value) && !!value.GET;
const collectionWord =
    /^(?:films?|movies?|events?|eventi|evento|screenings?|showings?|sessions?|programmes?|programmazion[ei]|programmi|orari|proiezioni|spettacoli|cinemas?)$/i;
const usableGet = (meta: unknown): boolean =>
    object(meta) &&
    (Array.isArray(meta.endpoints) ? meta.endpoints : [meta]).some(
        (endpoint) =>
            object(endpoint) &&
            getMethod(endpoint.methods) &&
            (!object(endpoint.args) ||
                Object.entries(endpoint.args).every(
                    ([key, arg]) =>
                        !object(arg) ||
                        (!(arg.required === true && arg.default == null) &&
                            !(key === 'context' && arg.default === 'edit'))
                ))
    );

/** Follow only advertised, literal collection routes; never fill regex IDs or credentials. */
export function wordpressCollectionRoutes(
    index: unknown,
    indexUrl: string
): string[] {
    if (!isWordPressIndex(index)) return [];
    const base = publicUrl(indexUrl);
    const queryRoute = base.searchParams.has('rest_route');
    base.search = '';
    base.hash = '';
    base.pathname = base.pathname.replace(/\/?$/, '/');
    const rootPath = base.pathname.match(/^(.*?\/wp-json)(?:\/|$)/);
    if (rootPath) base.pathname = rootPath[1] + '/';
    return Object.entries(index.routes)
        .slice(0, 2000)
        .flatMap(([route, meta]) => {
            if (
                !object(meta) ||
                route.length > 300 ||
                !/^\/[a-zA-Z0-9_./-]+$/.test(route) ||
                route.includes('//')
            )
                return [];
            const parts = route.split('/').filter(Boolean);
            if (parts.some((part) => part === '.' || part === '..')) return [];
            if (
                parts
                    .flatMap((part) => part.split(/[-_]/))
                    .some((part) =>
                        /^(?:admin|users?|settings?|delete|remove|reset|create|update|edit|save|import|export|sync|flush|clear|checkout|cart|purchase|reserve|cancel)$/i.test(
                            part
                        )
                    )
            )
                return [];
            if (
                !(parts.at(-1) ?? '')
                    .split(/[-_]/)
                    .some((part) => collectionWord.test(part))
            )
                return [];
            if (!usableGet(meta)) return [];
            const endpoint = queryRoute
                ? new URL(base)
                : publicUrl(new URL(route.slice(1), base).href);
            if (queryRoute) endpoint.searchParams.set('rest_route', route);
            return endpoint.origin === base.origin ? [endpoint.href] : [];
        })
        .sort((a, b) => {
            const score = (url: string) => {
                const endpoint = new URL(url);
                const path =
                    endpoint.searchParams.get('rest_route') ??
                    endpoint.pathname;
                const leaf = path.split('/').filter(Boolean).at(-1) ?? '';
                return (
                    (collectionWord.test(leaf) ? 10 : 0) +
                    (/screening|showing|session/i.test(path)
                        ? 3
                        : /film|movie/i.test(path)
                          ? 2
                          : 1)
                );
            };
            return score(b) - score(a) || a.localeCompare(b);
        });
}

export async function inspectWordPress(
    pageUrl: string,
    fetch = publicProgrammeFetch,
    knownIndex?: { url: string; body: string }
) {
    const requested = publicUrl(new URL('/wp-json/', pageUrl).href).href;
    const warnings: string[] = [];
    const responses: { url: string; body: string }[] = [];
    try {
        let body: string;
        let indexUrl: string;
        if (knownIndex) {
            body = knownIndex.body;
            indexUrl = publicUrl(knownIndex.url).href;
        } else {
            const response = await fetch(requested);
            if (!response.ok)
                return {
                    responses,
                    warnings: [
                        `WordPress discovery checked ${requested}: HTTP ${response.status}.`,
                    ],
                };
            body = await response.text();
            indexUrl = publicUrl(response.url || requested).href;
        }
        let index: unknown;
        try {
            index = JSON.parse(body);
        } catch {
            return {
                responses,
                warnings: [`No WordPress REST index found at ${indexUrl}.`],
            };
        }
        if (!isWordPressIndex(index))
            return {
                responses,
                warnings: [`No WordPress REST index found at ${indexUrl}.`],
            };
        const namespaces = Array.isArray(index.namespaces)
            ? index.namespaces
                  .filter((entry): entry is string => typeof entry === 'string')
                  .slice(0, 40)
                  .map((entry) => entry.slice(0, 150))
            : [String(index.namespace).slice(0, 150)];
        warnings.push(
            `WordPress REST namespaces at ${indexUrl}: ${namespaces.join(', ') || '(none)'}. These identify API extensions, not a complete list of installed plugins.`
        );
        const routes = wordpressCollectionRoutes(index, indexUrl);
        if (
            !routes.length &&
            usableGet(index.routes['/wp/v2/posts']) &&
            usableGet(index.routes['/wp/v2/categories'])
        ) {
            const endpoint = (route: string) => {
                const url = new URL(indexUrl);
                if (url.searchParams.has('rest_route'))
                    url.searchParams.set('rest_route', route);
                else {
                    url.search = '';
                    url.pathname =
                        url.pathname.replace(/\/?$/, '/') +
                        route.replace(/^\//, '');
                }
                return url;
            };
            const categoryUrl = endpoint('/wp/v2/categories');
            categoryUrl.searchParams.set('per_page', '100');
            try {
                const response = await fetch(categoryUrl.href);
                if (response.ok) {
                    const categories: unknown = await response.json();
                    const ids = Array.isArray(categories)
                        ? categories
                              .filter(
                                  (category) =>
                                      object(category) &&
                                      Number.isInteger(category.id) &&
                                      Number(category.id) > 0 &&
                                      /(?:^|[-\s])(?:cinema|cinéma|films?|movies?|kino)(?:$|[-\s])/i.test(
                                          String(
                                              category.slug ||
                                                  category.name ||
                                                  ''
                                          )
                                      )
                              )
                              .slice(0, 10)
                              .map((category) => category.id)
                        : [];
                    if (ids.length) {
                        const posts = endpoint('/wp/v2/posts');
                        posts.searchParams.set('categories', ids.join(','));
                        posts.searchParams.set('per_page', '100');
                        const result = await fetch(posts.href);
                        if (result.ok)
                            responses.push({
                                url: posts.href,
                                body: await result.text(),
                            });
                        else
                            warnings.push(
                                `Cinema-category posts returned HTTP ${result.status}.`
                            );
                        warnings.push(
                            'Found cinema-category WordPress posts. These may contain film metadata without showtimes; use Follow film detail pages to map screening HTML when needed. CMS publication dates are not screening times.'
                        );
                    }
                }
            } catch (error) {
                warnings.push(
                    `Could not inspect cinema-category posts: ${error instanceof Error ? error.message : String(error)}`
                );
            }
        }
        warnings.push(
            `WordPress discovery found ${routes.length} relevant GET collection routes; checking at most five. Routes requiring IDs or required arguments are skipped.`
        );
        await Promise.all(
            routes.slice(0, 5).map(async (url) => {
                try {
                    const response = await fetch(url);
                    if (response.ok)
                        responses.push({
                            url: publicUrl(response.url || url).href,
                            body: await response.text(),
                        });
                    else
                        warnings.push(
                            `WordPress API route ${url} returned HTTP ${response.status}.`
                        );
                } catch (error) {
                    warnings.push(
                        `Could not inspect WordPress API route ${url}: ${error instanceof Error ? error.message : String(error)}`
                    );
                }
            })
        );
    } catch (error) {
        warnings.push(
            `Could not inspect WordPress index ${requested}: ${error instanceof Error ? error.message : String(error)}`
        );
    }
    return { responses, warnings };
}
