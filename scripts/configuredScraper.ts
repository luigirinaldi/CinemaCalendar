import { cleanField, parseScreeningTime } from '../shared/scraperValues';
import { parse, type HTMLElement } from 'node-html-parser';
import { launchScraperBrowser } from './scraperBrowser';
import {
    ScraperConfigSchema,
    type ScraperConfig,
    type FieldMapping,
} from '../shared/scraperConfig';
import { CinemaShowingsSchema, type FilmShowings } from './types';
import { fetchPage } from './http';
import { readScriptAssignments } from './embeddedAssignments';
import { DateTime } from 'luxon';
import { mapConcurrent } from './http';
import { z } from 'zod';

const HybridCapture = z.object({
    kind: z.literal('cinema-builder-hybrid-v1'),
    programme: z.unknown(),
    pages: z.record(z.string(), z.string()),
    reference: z.iso.datetime(),
});
export const readHybridCapture = (body: string) =>
    HybridCapture.parse(JSON.parse(body));

export function valueAt(value: unknown, path: string): unknown {
    if (!path || path === '$' || path === '$self') return value;
    return path
        .split('.')
        .reduce<unknown>(
            (current, key) =>
                current != null &&
                typeof current === 'object' &&
                !['__proto__', 'prototype', 'constructor'].includes(key)
                    ? (current as Record<string, unknown>)[key]
                    : undefined,
            value
        );
}
function text(value: unknown): string {
    return typeof value === 'string' || typeof value === 'number'
        ? String(value).trim()
        : '';
}
function absolute(value: string, base: string): string | undefined {
    if (!value) return undefined;
    const url = new URL(value, base);
    if (!['http:', 'https:'].includes(url.protocol))
        throw new Error('Film and booking links must use HTTP or HTTPS');
    return url.href;
}
function htmlValue(root: HTMLElement, field: FieldMapping) {
    if (!field.path) return '';
    const element =
        field.path === '$self' ? root : root.querySelector(field.path);
    return field.attribute
        ? (element?.getAttribute(field.attribute)?.trim() ?? '')
        : (element?.textContent.trim() ?? '');
}
export function configuredJson(body: string, config: ScraperConfig): unknown {
    if (config.details) {
        const data = JSON.parse(body) as Record<string, unknown>;
        return data?.kind === 'cinema-builder-hybrid-v1'
            ? readHybridCapture(body).programme
            : data;
    }
    if (!config.embeddedJson) return JSON.parse(body) as unknown;
    const scripts = parse(body).querySelectorAll(config.embeddedJson);
    if (scripts.length !== 1 || scripts[0].tagName !== 'SCRIPT')
        throw new Error(
            'Embedded JSON selector must match exactly one script. Inspect the page again if it changed.'
        );
    if (config.embeddedAssignment) {
        const assignments = readScriptAssignments(scripts[0].textContent);
        if (!assignments.has(config.embeddedAssignment))
            throw new Error(
                `Static assignment “${config.embeddedAssignment}” is missing, dynamic, or modified later in the script. Inspect the page again.`
            );
        return assignments.get(config.embeddedAssignment);
    }
    return JSON.parse(scripts[0].textContent) as unknown;
}

export function configuredFilmUrls(
    config: ScraperConfig,
    body: string
): string[] {
    const source = configuredJson(body, config);
    const items = valueAt(source, config.items);
    if (!Array.isArray(items))
        throw new Error(
            'Select the JSON film array before following detail links'
        );
    return items.map((item) => {
        const raw = text(
            valueAt(
                config.filmUrl.scope === 'page' ? source : item,
                config.filmUrl.path
            )
        );
        const url = absolute(cleanField(raw, config.filmUrl), config.url);
        if (!url) throw new Error('Every film needs a detail-page URL');
        const parsed = new URL(url);
        if (
            parsed.username ||
            parsed.password ||
            ![
                new URL(config.url).origin,
                new URL(config.cinema.website).origin,
            ].includes(parsed.origin)
        )
            throw new Error(
                'Detail links must stay on the programme or cinema website origin'
            );
        parsed.hash = '';
        return parsed.href;
    });
}

/** Fetch linked HTML with a fixed bound; capture both sources for reproducible tests. */
export async function captureConfiguredDetails(
    config: ScraperConfig,
    body: string,
    fetcher: (url: string) => Promise<Response> = fetchPage,
    reference: DateTime = DateTime.now()
): Promise<string> {
    if (!config.details) return body;
    if (config.embeddedJson)
        throw new Error(
            'Hybrid metadata currently requires a JSON API response'
        );
    const programme = configuredJson(body, config);
    const items = valueAt(programme, config.items);
    if (!Array.isArray(items))
        throw new Error(
            'Select the JSON film array before following detail links'
        );
    const urls = configuredFilmUrls(config, body);
    if (new Set(urls).size > config.details.maxFilms)
        throw new Error(
            `Detail-page limit reached (${config.details.maxFilms} films). Narrow the API list or use a custom scraper; the programme was not truncated.`
        );
    if (config.yearPolicy === 'nearby-weekday')
        for (const item of items) {
            const date = DateTime.fromISO(
                text(valueAt(item, config.details.freshnessPath!)),
                { zone: config.timezone }
            );
            if (
                !date.isValid ||
                Math.abs(date.diff(reference, 'days').days) > 183
            )
                throw new Error(
                    'A film has missing or stale API freshness metadata. Yearless dates cannot be safely interpreted.'
                );
        }
    const pages = await mapConcurrent(
        [...new Set(urls)],
        async (url) => {
            const response = await fetcher(url);
            if (!response.ok)
                throw new Error(
                    `Film detail page ${url} returned HTTP ${response.status}`
                );
            const root = parse(await response.text());
            for (const element of root.querySelectorAll(
                'script,style,link,iframe,object,embed'
            ))
                element.remove();
            if (root.querySelectorAll(config.details!.root).length !== 1)
                throw new Error(
                    `Detail-page container must match exactly one film on ${url}`
                );
            return [url, root.toString()] as const;
        },
        2
    );
    return JSON.stringify({
        kind: 'cinema-builder-hybrid-v1',
        programme,
        pages: Object.fromEntries(pages),
        reference: reference.toUTC().toISO(),
    });
}

export function parseConfiguredProgramme(input: ScraperConfig, body: string) {
    const config = ScraperConfigSchema.parse(input);
    const source =
        config.mode === 'json' ? configuredJson(body, config) : parse(body);
    const capture = config.details ? readHybridCapture(body) : null;
    const reference = capture
        ? DateTime.fromISO(capture.reference)
        : DateTime.now();
    const detailUrls = config.details ? configuredFilmUrls(config, body) : [];
    const rawItems =
        config.mode === 'json'
            ? valueAt(source, config.items)
            : (source as HTMLElement).querySelectorAll(config.items);
    if (!Array.isArray(rawItems))
        throw new Error(
            'The film collection must select an array or repeated HTML elements'
        );
    const films = new Map<string, FilmShowings>();
    for (const [itemIndex, item] of rawItems.entries()) {
        const read = (row: unknown, field: FieldMapping) => {
            if (!field.path) return '';
            let root =
                field.scope === 'film'
                    ? item
                    : field.scope === 'page'
                      ? source
                      : row;
            if (field.scope === 'ancestor') {
                if (config.mode !== 'html' || !field.ancestor)
                    throw new Error(
                        'Ancestor scope requires HTML and an ancestor selector'
                    );
                root = (row as HTMLElement).closest(field.ancestor);
                if (!root)
                    throw new Error(`No ancestor matches ${field.ancestor}`);
            }
            let raw =
                config.mode === 'html'
                    ? htmlValue(root as HTMLElement, field)
                    : text(valueAt(root, field.path));
            if (field.htmlText) raw = parse(raw).textContent;
            return raw ? cleanField(raw, field) : '';
        };
        const title = read(item, config.title);
        if (!title)
            throw new Error('A film has no title. Check the title mapping.');
        const detailPage = capture
            ? parse(capture.pages[detailUrls[itemIndex]] ?? '')
            : null;
        const detailRoots =
            detailPage && config.details
                ? detailPage.querySelectorAll(config.details.root)
                : [];
        if (config.details && detailRoots.length !== 1)
            throw new Error(`Missing captured film detail page for ${title}`);
        const detailRoot = detailRoots[0];
        const htmlFilm =
            config.mode === 'html' ? (item as HTMLElement) : detailRoot;
        const htmlPage = detailPage ?? (source as HTMLElement);
        const useHtmlScreenings = config.mode === 'html' || !!config.details;
        const rawShowings = config.showings
            ? useHtmlScreenings
                ? htmlFilm.querySelectorAll(config.showings)
                : valueAt(item, config.showings)
            : [config.details ? detailRoot : item];
        if (!Array.isArray(rawShowings))
            throw new Error(
                `The screening collection for ${title} is not an array`
            );
        const url =
            absolute(read(item, config.filmUrl), config.url) ??
            config.cinema.website;
        const key = JSON.stringify([title, url]);
        const film = films.get(key) ?? {
            film: {
                title,
                url,
                director: read(item, config.director) || undefined,
                coverUrl: absolute(read(item, config.poster), config.url),
            },
            showings: [],
        };
        const screeningRows = config.splitScreeningLines
            ? rawShowings.flatMap((showing) => {
                  const lineHtml = (showing as HTMLElement).innerHTML
                      .replace(/<br\s*\/?>/gi, '\n')
                      .replace(/<\/p\s*>/gi, '</p>\n');
                  return parse(lineHtml)
                      .textContent.split(/\r?\n/)
                      .map((line) => line.trim())
                      .filter(Boolean)
                      .map((line) => ({ showing, line }));
              })
            : rawShowings.map((showing) => ({ showing, line: '' }));
        const readShowing = (showing: unknown, field: FieldMapping) => {
            if (!useHtmlScreenings) return read(showing, field);
            if (!field.path) return '';
            let root: HTMLElement | null =
                field.scope === 'film'
                    ? htmlFilm
                    : field.scope === 'page'
                      ? htmlPage
                      : (showing as HTMLElement);
            if (field.scope === 'ancestor')
                root = (showing as HTMLElement).closest(field.ancestor || '');
            if (!root)
                throw new Error('Screening field has no matching HTML scope');
            const value = htmlValue(root as HTMLElement, field);
            return value ? cleanField(value, field) : '';
        };
        for (const { showing, line } of screeningRows) {
            const time = config.splitScreeningLines
                ? cleanField(line, config.start)
                : readShowing(showing, config.start);
            if (!time) throw new Error(`A screening for ${title} has no time`);
            const start = parseScreeningTime(
                time,
                readShowing(showing, config.date) ||
                    (useHtmlScreenings
                        ? readShowing(htmlFilm, config.date)
                        : read(item, config.date)),
                config,
                reference
            );
            const bookingUrl = absolute(
                readShowing(showing, config.booking),
                config.url
            );
            if (!film.showings.some((row) => row.startTime === start))
                film.showings.push({ startTime: start, bookingUrl });
        }
        films.set(key, film);
    }
    return CinemaShowingsSchema.parse([
        { cinema: config.cinema, showings: [...films.values()] },
    ]);
}

export async function renderedHtml(url: string) {
    const browser = await launchScraperBrowser();
    try {
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
        await page
            .waitForLoadState('networkidle', { timeout: 5000 })
            .catch(() => {});
        return await page.content();
    } finally {
        await browser.close();
    }
}

export async function runConfiguredScraper(
    config: ScraperConfig,
    dependencies: {
        fetch?: (url: string) => Promise<Response>;
        render?: (url: string) => Promise<string>;
        reference?: DateTime;
    } = {}
) {
    const valid = ScraperConfigSchema.parse(config);
    if (valid.mode === 'html' || valid.embeddedJson) {
        if (valid.render)
            return parseConfiguredProgramme(
                valid,
                await (dependencies.render ?? renderedHtml)(valid.url)
            );
        const response = await (dependencies.fetch ?? fetchPage)(valid.url);
        if (!response.ok) throw new Error(`Programme HTTP ${response.status}`);
        return parseConfiguredProgramme(
            { ...valid, url: response.url || valid.url },
            await response.text()
        );
    }
    const films: FilmShowings[] = [];
    const followed = new Set<string>();
    const pagination = valid.pagination;
    const first = Number(
        new URL(valid.url).searchParams.get(pagination?.parameter ?? '') ?? 1
    );
    if (!Number.isInteger(first) || first !== 1)
        throw new Error('Paginated programmes must start at page 1');
    for (let page = 1; page <= (pagination?.maxPages ?? 1); page++) {
        const url = new URL(valid.url);
        if (pagination)
            url.searchParams.set(pagination.parameter, String(page));
        const response = await (dependencies.fetch ?? fetchPage)(url.href);
        if (!response.ok) throw new Error(`Programme HTTP ${response.status}`);
        const body = await response.text();
        if (valid.details) {
            for (const url of configuredFilmUrls(valid, body))
                followed.add(url);
            if (followed.size > valid.details.maxFilms)
                throw new Error(
                    'Detail-page limit reached across API pages. Narrow the film list; no partial programme was accepted.'
                );
        }
        const captured = await captureConfiguredDetails(
            valid,
            body,
            dependencies.fetch ?? fetchPage,
            dependencies.reference
        );
        const result = parseConfiguredProgramme(valid, captured)[0].showings;
        films.push(...result);
        if (!pagination) break;
        const totalRaw =
            response.headers.get('x-wp-totalpages') ??
            (pagination.totalPagesPath
                ? valueAt(
                      configuredJson(body, valid),
                      pagination.totalPagesPath
                  )
                : undefined);
        const total = Number(totalRaw);
        if (totalRaw != null && (!Number.isInteger(total) || total < 0))
            throw new Error('Invalid API page count');
        if (!result.length || (totalRaw != null && page >= total)) break;
        if (page === pagination.maxPages)
            throw new Error(
                'Pagination limit reached. Increase the bound or map the total page count.'
            );
    }
    // Combine films that occur on several API pages and deduplicate times.
    const grouped = new Map<string, FilmShowings>();
    for (const film of films) {
        const key = JSON.stringify([film.film.title, film.film.url]);
        const existing = grouped.get(key);
        if (!existing) grouped.set(key, film);
        else
            for (const showing of film.showings)
                if (
                    !existing.showings.some(
                        (row) => row.startTime === showing.startTime
                    )
                )
                    existing.showings.push(showing);
    }
    return CinemaShowingsSchema.parse([
        { cinema: valid.cinema, showings: [...grouped.values()] },
    ]);
}
