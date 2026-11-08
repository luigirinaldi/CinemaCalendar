import { parse } from 'node-html-parser';
import { launchScraperBrowser } from '../scraperBrowser';
import type { Discovery } from '../../shared/scraperConfig';
import { publicFetch, publicProgrammeFetch, publicUrl } from './network';
import { inspectWordPress, isWordPressIndex } from './wordpress';
import { readScriptAssignments } from '../embeddedAssignments';

/** Keep API samples small even when the response embeds multi-megabyte posters. */
function jsonCandidate(
    url: string,
    body: string,
    onWordPressIndex?: () => void
): Discovery['candidates'][number] | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(body);
    } catch {
        return null;
    }
    if (isWordPressIndex(parsed)) {
        onWordPressIndex?.();
        return null;
    }
    const paths = jsonPaths(parsed);
    if (!paths.length) return null;
    let nodes = 0;
    function sample(value: unknown, depth = 0): unknown {
        if (++nodes > 500 || depth > 7) return null;
        if (typeof value === 'string')
            return value.length > 800
                ? `${value.slice(0, 800)}… [sample shortened]`
                : value;
        if (Array.isArray(value))
            return value.slice(0, 3).map((entry) => sample(entry, depth + 1));
        if (value && typeof value === 'object')
            return Object.fromEntries(
                Object.entries(value)
                    .slice(0, 50)
                    .map(([key, entry]) => [key, sample(entry, depth + 1)])
            );
        return value;
    }
    return { url, paths, sample: sample(parsed) };
}

export function jsonPaths(value: unknown, prefix = '$', depth = 0): string[] {
    if (depth > 6 || value == null || typeof value !== 'object') return [];
    if (Array.isArray(value))
        return [
            prefix,
            ...jsonPaths(value[0], prefix === '$' ? '' : prefix, depth + 1),
        ];
    return Object.entries(value)
        .slice(0, 60)
        .flatMap(([key, entry]) => {
            const path = prefix === '$' || !prefix ? key : `${prefix}.${key}`;
            return [path, ...jsonPaths(entry, path, depth + 1)];
        })
        .filter((path, i, all) => all.indexOf(path) === i);
}

/** Parse data scripts, including JSON-LD and hydration state, without eval. */
export function embeddedJsonCandidates(
    html: string,
    url: string
): Discovery['candidates'] {
    const root = parse(html);
    return root
        .querySelectorAll('script')
        .flatMap((script) => {
            const body = script.textContent.trim();
            const candidate = /^(?:\[|\{)/.test(body)
                ? jsonCandidate(url, body)
                : null;
            const assignments = candidate
                ? []
                : [...readScriptAssignments(body)].slice(0, 10);
            if (!candidate && !assignments.length) return [];
            const id = script.getAttribute('id');
            // Use a stable ID when possible; otherwise retain the exact script index.
            const parts: string[] = [];
            for (let node = script; node?.tagName; node = node.parentNode) {
                const siblings = node.parentNode?.childNodes.filter(
                    (child) => child.nodeType === 1
                ) ?? [node];
                parts.unshift(
                    `${node.tagName.toLowerCase()}:nth-child(${siblings.indexOf(node) + 1})`
                );
            }
            const selector =
                id &&
                /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(id) &&
                root.querySelectorAll(`#${id}`).length === 1
                    ? `script#${id}`
                    : parts.join(' > ');
            if (candidate) return [{ ...candidate, embeddedJson: selector }];
            return assignments.flatMap(([name, value]) => {
                const assignment = jsonCandidate(url, JSON.stringify(value));
                return assignment
                    ? [
                          {
                              ...assignment,
                              embeddedJson: selector,
                              embeddedAssignment: name,
                          },
                      ]
                    : [];
            });
        })
        .slice(0, 10);
}

/** The selection preview contains inert markup, not the cinema's scripts. */
export function sanitizedHtml(body: string) {
    const root = parse(body);
    for (const element of root.querySelectorAll(
        'script,style,link,meta,base,iframe,object,embed,svg,math,template'
    ))
        element.remove();
    for (const element of root.querySelectorAll('*')) {
        for (const key of Object.keys(element.attributes))
            if (
                !['id', 'class', 'datetime', 'title', 'href', 'src'].includes(
                    key
                ) &&
                !key.startsWith('data-')
            )
                element.removeAttribute(key);
        // Keep the source attribute as data for mapping without navigating/loading it.
        for (const key of ['src', 'href']) {
            const value = element.getAttribute(key);
            if (value) element.setAttribute(`data-builder-${key}`, value);
            element.removeAttribute(key);
        }
    }
    return root.toString().slice(0, 1000000);
}

/** Fast, bounded inspection of advertised JSON endpoints and literal fetch URLs. */
export async function inspectHttp(
    input: string,
    fetch = publicProgrammeFetch
): Promise<Discovery & { raw: string }> {
    const response = await fetch(publicUrl(input).href);
    if (!response.ok)
        throw new Error(`The cinema page returned HTTP ${response.status}`);
    const url = publicUrl(response.url || input).href;
    const raw = await response.text();
    const candidates: Discovery['candidates'] = [];
    const failures: string[] = [];
    let knownWordPressIndex: { url: string; body: string } | undefined;
    const add = (endpoint: string, body: string) => {
        const candidate = jsonCandidate(endpoint, body, () => {
            if (new URL(endpoint).origin === new URL(url).origin)
                knownWordPressIndex = { url: endpoint, body };
        });
        if (candidate && !candidates.some((item) => item.url === endpoint))
            candidates.push(candidate);
    };
    const direct =
        /json/i.test(response.headers.get('content-type') ?? '') ||
        /^\s*(?:\[|{)/.test(raw);
    if (direct) add(url, raw);
    if (!direct && raw.length > 2000000)
        throw new Error('The cinema page exceeds the inspection size limit');
    const root = parse(direct ? '' : raw);
    if (!direct) candidates.push(...embeddedJsonCandidates(raw, url));
    const endpoints = new Set<string>();
    const remember = (value: string) => {
        if (endpoints.size >= 5) return;
        try {
            const endpoint = publicUrl(new URL(value, url).href).href;
            if (endpoint !== url) endpoints.add(endpoint);
        } catch {
            /* Unsafe or non-HTTP links are never fetched. */
        }
    };
    for (const link of root.querySelectorAll('link,a')) {
        const href = link.getAttribute('href') ?? '';
        if (
            /json/i.test(link.getAttribute('type') ?? '') ||
            /\.json(?:\?|$)/i.test(href)
        )
            remember(href);
    }
    for (const script of root.querySelectorAll('script')) {
        for (const match of script.textContent.matchAll(
            /(?:fetch|axios\.get)\(\s*['"]([^'"]+)['"]/g
        ))
            remember(match[1]);
    }
    await Promise.all(
        [...endpoints].map(async (endpoint) => {
            try {
                const result = await fetch(endpoint);
                if (result.ok)
                    add(
                        publicUrl(result.url || endpoint).href,
                        await result.text()
                    );
                else
                    failures.push(
                        `API hint ${endpoint} returned HTTP ${result.status}.`
                    );
            } catch (error) {
                failures.push(
                    `Could not inspect API hint ${endpoint}: ${error instanceof Error ? error.message : String(error)}`
                );
            }
        })
    );
    if (!direct || knownWordPressIndex) {
        const wordpress = await inspectWordPress(
            url,
            fetch,
            knownWordPressIndex
        );
        failures.push(...wordpress.warnings);
        for (const response of wordpress.responses)
            add(response.url, response.body);
    }
    candidates.sort(
        (a, b) =>
            b.paths.filter((path) =>
                /film|movie|title|screening|session|showing/i.test(path)
            ).length -
            a.paths.filter((path) =>
                /film|movie|title|screening|session|showing/i.test(path)
            ).length
    );
    return {
        url,
        raw: direct ? '' : raw,
        html: sanitizedHtml(direct ? '' : raw),
        candidates,
        rendered: false,
        warnings: [
            'Reads embedded JSON, static JavaScript data assignments and up to five explicit JSON/API links without executing page code.',
            'Also checks /wp-json/ and up to five relevant advertised WordPress GET collection routes.',
            'JSON samples show at most three entries per array and shorten long strings. Validation fetches the complete programme.',
            ...failures,
            ...(!candidates.length
                ? [
                      'No public JSON programme was found. Select fields in the HTML, or enable JavaScript inspection and inspect again if the programme is missing.',
                  ]
                : []),
            'API discovery is best-effort. Endpoints constructed by JavaScript or loaded after interaction may require browser inspection or a custom scraper.',
        ],
    };
}

export async function inspectWebsite(
    input: string,
    options: {
        browser?: boolean;
        channel?: string;
        fetch?: typeof publicFetch;
    } = {}
): Promise<Discovery & { raw: string }> {
    if (!options.browser) return inspectHttp(input, options.fetch);
    const url = publicUrl(input).href;
    const candidates: Discovery['candidates'] = [];
    const warnings: string[] = [];
    let observedWordPressIndex: { url: string; body: string } | undefined;
    const browser = await launchScraperBrowser(options.channel);
    try {
        const context = await browser.newContext({
            serviceWorkers: 'block',
            acceptDownloads: false,
        });
        await context.routeWebSocket('**/*', (socket) => socket.close());
        let requests = 0;
        await context.route('**/*', async (route) => {
            if (
                ++requests > 70 ||
                route.request().method() !== 'GET' ||
                ['image', 'media', 'font'].includes(
                    route.request().resourceType()
                )
            ) {
                await route.abort();
                return;
            }
            try {
                const response = await (
                    options.fetch ??
                    (['fetch', 'xhr'].includes(route.request().resourceType())
                        ? publicProgrammeFetch
                        : publicFetch)
                )(route.request().url());
                // Preserve the final document origin/path for relative URLs and scripts.
                if (response.url && response.url !== route.request().url()) {
                    await route.fulfill({
                        status: 302,
                        headers: { location: publicUrl(response.url).href },
                        body: '',
                    });
                    return;
                }
                const body = Buffer.from(await response.arrayBuffer());
                if (
                    response.ok &&
                    (/json/i.test(response.headers.get('content-type') ?? '') ||
                        ['fetch', 'xhr'].includes(
                            route.request().resourceType()
                        )) &&
                    candidates.length < 10
                ) {
                    const candidate = jsonCandidate(
                        route.request().url(),
                        body.toString(),
                        () => {
                            observedWordPressIndex = {
                                url: route.request().url(),
                                body: body.toString(),
                            };
                        }
                    );
                    if (
                        candidate &&
                        !candidates.some((item) => item.url === candidate.url)
                    )
                        candidates.push(candidate);
                }
                const headers: Record<string, string> = {};
                response.headers.forEach((value, key) => {
                    headers[key] = value;
                });
                await route.fulfill({
                    status: response.status,
                    headers,
                    body,
                });
            } catch (error) {
                if (
                    warnings.length < 10 &&
                    ['fetch', 'xhr'].includes(route.request().resourceType())
                )
                    warnings.push(
                        `Could not inspect API request ${route.request().url()}: ${error instanceof Error ? error.message : String(error)}`
                    );
                await route.abort().catch(() => {});
            }
        });
        const page = await context.newPage();
        const response = await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
        });
        if (!response?.ok())
            throw new Error(
                `The cinema page returned HTTP ${response?.status() ?? 'unknown'}`
            );
        await page
            .waitForLoadState('networkidle', { timeout: 5000 })
            .catch(() =>
                warnings.push(
                    'Some requests did not finish; API discovery may be incomplete.'
                )
            );
        const wordpress = await inspectWordPress(
            publicUrl(page.url()).href,
            options.fetch ?? publicProgrammeFetch,
            observedWordPressIndex &&
                new URL(observedWordPressIndex.url).origin ===
                    new URL(page.url()).origin
                ? observedWordPressIndex
                : undefined
        );
        warnings.push(...wordpress.warnings);
        for (const response of wordpress.responses) {
            const candidate = jsonCandidate(response.url, response.body);
            if (
                candidate &&
                !candidates.some((item) => item.url === candidate.url)
            )
                candidates.push(candidate);
        }
        let raw = await page.content();
        if (raw.length <= 2000000)
            candidates.push(
                ...embeddedJsonCandidates(raw, publicUrl(page.url()).href)
            );
        if (raw.length > 2000000) {
            if (!candidates.length)
                throw new Error(
                    'The cinema page exceeds the inspection size limit'
                );
            // Large embedded images must not hide APIs already captured successfully.
            raw = '';
            warnings.push(
                'The rendered HTML exceeds the 2 MB preview limit. The discovered APIs are available; use API mapping for this page.'
            );
        }
        if (!candidates.length)
            warnings.push(
                'No usable public GET API was observed. Try the programme page or map the HTML below.'
            );
        warnings.push(
            'Only unauthenticated GET requests are inspected. Login, CAPTCHA, private APIs and POST APIs require a custom scraper.'
        );
        warnings.push(
            'JSON samples are shortened for display; validation fetches the complete programme.'
        );
        candidates.sort(
            (a, b) =>
                b.paths.filter((path) =>
                    /film|movie|title|screening|session|showing/i.test(path)
                ).length -
                a.paths.filter((path) =>
                    /film|movie|title|screening|session|showing/i.test(path)
                ).length
        );
        return {
            rendered: true,
            url: publicUrl(page.url()).href,
            html: sanitizedHtml(raw),
            raw,
            candidates,
            warnings,
        };
    } finally {
        await browser.close();
    }
}
