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

export function parseConfiguredProgramme(input: ScraperConfig, body: string) {
    const config = ScraperConfigSchema.parse(input);
    const source =
        config.mode === 'json' ? configuredJson(body, config) : parse(body);
    const rawItems =
        config.mode === 'json'
            ? valueAt(source, config.items)
            : (source as HTMLElement).querySelectorAll(config.items);
    if (!Array.isArray(rawItems))
        throw new Error(
            'The film collection must select an array or repeated HTML elements'
        );
    const films = new Map<string, FilmShowings>();
    for (const item of rawItems) {
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
            const raw =
                config.mode === 'html'
                    ? htmlValue(root as HTMLElement, field)
                    : text(valueAt(root, field.path));
            return raw ? cleanField(raw, field) : '';
        };
        const title = read(item, config.title);
        if (!title)
            throw new Error('A film has no title. Check the title mapping.');
        const rawShowings = config.showings
            ? config.mode === 'html'
                ? (item as HTMLElement).querySelectorAll(config.showings)
                : valueAt(item, config.showings)
            : [item];
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
        for (const showing of rawShowings) {
            const time = read(showing, config.start);
            if (!time) throw new Error(`A screening for ${title} has no time`);
            const start = parseScreeningTime(
                time,
                read(showing, config.date) || read(item, config.date),
                config
            );
            const bookingUrl = absolute(
                read(showing, config.booking),
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
        const result = parseConfiguredProgramme(valid, body)[0].showings;
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
