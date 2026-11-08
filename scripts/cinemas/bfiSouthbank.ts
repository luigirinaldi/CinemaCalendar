// Inspired by and adapted from the cinescrapers project by Joeboy:
// https://github.com/Joeboy/cinescrapers/blob/main/src/cinescrapers/scrapers/bfi/scrape.py
import { DateTime } from 'luxon';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
    CinemaShowing,
    CinemaShowingsSchema,
    FilmShowings,
    Cinema,
} from '../types';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { BrowserContext, Page } from 'playwright-chromium';
import { loadProgrammePage, ProgrammePageError } from '../browserProgramme';
import { mapConcurrent } from '../http';
import { parse } from 'node-html-parser';
import { z } from 'zod';

chromium.use(StealthPlugin());

const CINEMA_NAME = 'BFI Southbank';
const LOG_PREFIX = '[' + CINEMA_NAME + ']';
const BASE_URL = 'https://whatson.bfi.org.uk/Online';
const FILMS_INDEX_URL = BASE_URL + '/article/filmsindex';
const CONCURRENCY_LIMIT = 1;
const MAX_RETRIES = 2;
const TEST_LIMIT = process.env.BFI_TEST_LIMIT
    ? parseInt(process.env.BFI_TEST_LIMIT)
    : undefined;
const LONDON_TZ = 'Europe/London';

const CINEMA: Cinema = {
    name: CINEMA_NAME,
    location: 'London',
    website: 'https://www.bfi.org.uk/bfi-southbank',
    coordinates: {
        lat: `51° 30' 18.36" N`,
        lng: `0° 6' 48.60" W`,
    },
    defaultLanguage: 'en-GB',
};

// e.g. "USA 2001. 159min" or "UK 2025. 123min. Total running time 150min"
const COUNTRY_YEAR_DURATION_RE =
    /^(?<country>[A-Za-z][A-Za-z\s]*?)\s+(?<year>(?:19|20)\d{2})\.\s*(?<duration>\d+)min/;

interface FilmInfo {
    director?: string;
    year?: number;
    duration?: number;
    country?: string;
    language?: string;
}

interface ArticleContext {
    searchNames: string[];
    searchResults: unknown[][];
}

// Global lexical bindings (let/const) need not be properties of window.
declare const articleContext: unknown;

const ArticleContextSchema = z.object({
    searchNames: z.array(z.string()),
    searchResults: z.array(z.array(z.unknown())),
});

const EmptyArticleContextSchema = z
    .object({
        searchLabels: z.object({ no_results_message: z.string().min(1) }),
        loginLabels: z.record(z.string(), z.unknown()),
        contextId: z.string(),
        articleId: z.string().min(1),
        articleSearchId: z.literal(''),
        salesType: z.literal('P'),
        sToken: z.string(),
    })
    .strict();

/** BFI omits all search fields when a completed film page has no on-sale sessions. */
export function isBfiEmptyProgramme(source: unknown, html: string): boolean {
    const context = EmptyArticleContextSchema.safeParse(source);
    if (!context.success) return false;
    const root = parse(html);
    if (!root.querySelector('h1.Page__heading')) return false;
    // Event pages omit the .Booking wrapper. Match the article's search widget,
    // not the unrelated empty CalendarWidget in the sidebar.
    const widget = root
        .querySelectorAll('div[name="avWidget"]')
        .find(
            (element) =>
                element.id.startsWith(`avWidget_${context.data.articleId}_`) &&
                /registerWidget\s*\(\s*["']SearchWebWidget2["']/.test(
                    element.querySelector('script')?.textContent || ''
                )
        );
    const body = widget?.querySelector('div');
    return !!body && !body.querySelector('*') && !body.textContent.trim();
}

/** Extract JSON literals only; never evaluate script text supplied by the website. */
function jsonLiteral(source: string, start: number): unknown {
    const opening = source[start];
    if (opening !== '{' && opening !== '[') return undefined;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = start; index < source.length; index++) {
        const character = source[index];
        if (quoted) {
            if (escaped) escaped = false;
            else if (character === '\\') escaped = true;
            else if (character === '"') quoted = false;
            continue;
        }
        if (character === '"') quoted = true;
        else if (character === '{' || character === '[') depth++;
        else if ((character === '}' || character === ']') && --depth === 0) {
            try {
                return JSON.parse(source.slice(start, index + 1)) as unknown;
            } catch {
                return undefined;
            }
        }
    }
    return undefined;
}

export function parseBfiInlineContext(html: string): ArticleContext | null {
    const fields: Record<string, unknown> = {};
    for (const script of parse(html).querySelectorAll('script:not([src])')) {
        const source = script.textContent;
        if (
            /\barticleContext(?:\.searchResults|\[["']searchResults["']\])\s*(?:\.push\s*\(|\[[^\]]*\]\s*=)/.test(
                source
            )
        )
            return null;
        for (const match of source.matchAll(
            /\b(?:window\.)?articleContext\s*=\s*(?=\{)/g
        )) {
            const value = jsonLiteral(source, match.index! + match[0].length);
            if (
                value &&
                typeof value === 'object' &&
                ('searchNames' in value || 'searchResults' in value)
            ) {
                Object.assign(fields, ArticleContextSchema.parse(value));
            }
        }
        for (const field of ['searchNames', 'searchResults']) {
            const pattern = new RegExp(
                `\\b(?:window\\.)?articleContext(?:\\.${field}|\\["${field}"\\]|\\['${field}'\\])\\s*=\\s*(?=\\[)`,
                'g'
            );
            for (const match of source.matchAll(pattern))
                fields[field] = jsonLiteral(
                    source,
                    match.index! + match[0].length
                );
        }
    }
    return Object.keys(fields).length === 2
        ? ArticleContextSchema.parse(fields)
        : null;
}

async function saveBfiDiagnostic(
    page: Page,
    filmUrl: string,
    filmTitle: string,
    error: unknown
): Promise<void> {
    try {
        const directory = path.resolve('.scraper-debug/bfi');
        await mkdir(directory, { recursive: true });
        const name = `${new Date().toISOString().replace(/[:.]/g, '-')}-${filmTitle
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .slice(0, 70)}`;
        const htmlPath = path.join(directory, name + '.html');
        const html = await page.content();
        await writeFile(htmlPath, html);
        await writeFile(
            path.join(directory, name + '.json'),
            JSON.stringify(
                {
                    url: filmUrl,
                    filmTitle,
                    pageTitle: parse(html).querySelector('title')?.textContent,
                    reason:
                        error instanceof ProgrammePageError
                            ? error.reason
                            : 'parse',
                    httpStatus:
                        error instanceof ProgrammePageError
                            ? error.status
                            : undefined,
                    error:
                        error instanceof Error ? error.message : String(error),
                },
                null,
                2
            )
        );
        console.warn(
            `${LOG_PREFIX} Saved failed page for diagnosis: ${htmlPath}`
        );
    } catch (diagnosticError) {
        console.warn(
            `${LOG_PREFIX} Could not save failed page`,
            diagnosticError
        );
    }
}

export function parseBfiShowings(
    source: unknown,
    filmUrl: string
): FilmShowings['showings'] {
    const { searchNames, searchResults } = ArticleContextSchema.parse(source);
    const dateIndex = searchNames.indexOf('start_date');
    if (searchResults.length && dateIndex < 0)
        throw new Error(
            `${LOG_PREFIX} Programme has no start_date column: ${filmUrl}`
        );
    return searchResults.map((row) => {
        const raw = row[dateIndex];
        const startTime =
            typeof raw === 'string' ? parseStartDate(raw) : undefined;
        if (!startTime)
            throw new Error(
                `${LOG_PREFIX} Invalid screening date ${JSON.stringify(raw)}: ${filmUrl}`
            );
        return { startTime, bookingUrl: filmUrl };
    });
}

export function parseBfiFilmLinks(
    html: string
): { url: string; title: string }[] {
    const films = new Map<string, { url: string; title: string }>();
    for (const link of parse(html).querySelectorAll('div.Rich-text a[href]')) {
        const url = new URL(link.getAttribute('href')!, BASE_URL + '/');
        if (
            url.origin !== new URL(BASE_URL).origin ||
            !/^\/Online\/article\/[^/]+\/?$/.test(url.pathname)
        )
            continue;
        const title = link.textContent.trim().replace(/\s+/g, ' ');
        if (!title) continue;
        url.hash = '';
        films.set(url.href, { url: url.href, title });
    }
    if (!films.size)
        throw new Error(`${LOG_PREFIX} Film index has no usable film links`);
    return [...films.values()];
}

export function parseBfiFilmInfo(
    html: string
): FilmInfo & { coverUrl?: string } {
    const info: FilmInfo & { coverUrl?: string } = {};
    const root = parse(html);
    for (const li of root.querySelectorAll(
        'li.Film-info__information__wrapper'
    )) {
        const heading = li
            .querySelector('p.Film-info__information__heading')
            ?.textContent.trim();
        const value = li
            .querySelector('p.Film-info__information__value')
            ?.textContent.trim();
        if (!value) continue;

        if (heading === 'Director' || heading === 'Directors') {
            info.director = value;
        } else if (!heading) {
            const match = value.match(COUNTRY_YEAR_DURATION_RE);
            if (match?.groups) {
                info.country = match.groups.country.trim();
                info.year = parseInt(match.groups.year);
                info.duration = parseInt(match.groups.duration);
            } else if (value.toLowerCase().includes('subtitles')) {
                info.language = value;
            }
        }
    }
    const source = root.querySelector('img.Media__image')?.getAttribute('src');
    if (source) {
        try {
            const url = new URL(source, BASE_URL);
            if (url.protocol === 'https:' || url.protocol === 'http:')
                info.coverUrl = url.href;
        } catch {
            /* Optional artwork may be absent or malformed. */
        }
    }
    return info;
}

function parseStartDate(dateStr: string): string | undefined {
    // A calendar date alone must never turn into an invented midnight screening.
    if (!/\d{1,2}:\d{2}/.test(dateStr)) return undefined;
    // Try ISO first
    let dt = DateTime.fromISO(dateStr, { zone: LONDON_TZ });
    if (dt.isValid) return dt.toISO() ?? undefined;

    // Try "dd/MM/yyyy HH:mm:ss" (Spektrix format)
    dt = DateTime.fromFormat(dateStr, 'dd/MM/yyyy HH:mm:ss', {
        zone: LONDON_TZ,
    });
    if (dt.isValid) return dt.toISO() ?? undefined;

    // Try "dd/MM/yyyy HH:mm"
    dt = DateTime.fromFormat(dateStr, 'dd/MM/yyyy HH:mm', { zone: LONDON_TZ });
    if (dt.isValid) return dt.toISO() ?? undefined;

    // Try "cccc d MMMM yyyy HH:mm" e.g. "Tuesday 25 March 2026 18:00"
    dt = DateTime.fromFormat(dateStr, 'cccc d MMMM yyyy HH:mm', {
        zone: LONDON_TZ,
    });
    if (dt.isValid) return dt.toISO() ?? undefined;

    return undefined;
}

async function processFilm(
    context: BrowserContext,
    filmUrl: string,
    filmTitle: string
): Promise<FilmShowings> {
    for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
        if (attempt > 1) {
            console.log(
                `${LOG_PREFIX} Retry ${attempt - 1}/${MAX_RETRIES}: "${filmTitle}"`
            );
        } else {
            console.log(
                `${LOG_PREFIX} Processing: "${filmTitle}" (${filmUrl})`
            );
        }
        const page = await context.newPage();
        try {
            await loadProgrammePage(
                page,
                filmUrl,
                () => {
                    const context = (
                        typeof articleContext !== 'undefined'
                            ? articleContext
                            : (
                                  window as unknown as {
                                      articleContext?: unknown;
                                  }
                              ).articleContext
                    ) as
                        | (Partial<ArticleContext> & { articleId?: unknown })
                        | undefined;
                    return (
                        (Array.isArray(context?.searchNames) &&
                            Array.isArray(context?.searchResults)) ||
                        (typeof context?.articleId === 'string' &&
                            !('searchNames' in context) &&
                            !('searchResults' in context) &&
                            document.querySelector('h1.Page__heading') !==
                                null &&
                            Array.from(
                                document.querySelectorAll(
                                    'div[name="avWidget"]'
                                )
                            ).some(
                                (widget) =>
                                    widget.id.startsWith(
                                        `avWidget_${context.articleId}_`
                                    ) &&
                                    /registerWidget\s*\(\s*["']SearchWebWidget2["']/.test(
                                        widget.querySelector('script')
                                            ?.textContent || ''
                                    ) &&
                                    widget.querySelector('div:empty') !== null
                            )) ||
                        (document.querySelector('h1') !== null &&
                            Array.from(document.scripts).some(
                                (script) =>
                                    /\barticleContext\b/.test(
                                        script.textContent || ''
                                    ) &&
                                    /searchNames/.test(
                                        script.textContent || ''
                                    ) &&
                                    /searchResults/.test(
                                        script.textContent || ''
                                    )
                            ))
                    );
                },
                `${LOG_PREFIX} Film "${filmTitle}"`
            );

            const html = await page.content();
            const evaluated = await page
                .evaluate(() =>
                    typeof articleContext !== 'undefined'
                        ? articleContext
                        : ((window as unknown as { articleContext?: unknown })
                              .articleContext ?? null)
                )
                .catch(() => null);
            const programme = ArticleContextSchema.safeParse(evaluated);
            const data = programme.success
                ? programme.data
                : isBfiEmptyProgramme(evaluated, html)
                  ? { searchNames: [], searchResults: [] }
                  : parseBfiInlineContext(html);
            if (!data)
                throw new Error(
                    `${LOG_PREFIX} Missing or unsupported programme data for "${filmTitle}"`
                );

            // Optional metadata must not introduce per-field browser waits.
            const filmInfo = parseBfiFilmInfo(html);
            if (filmInfo.year === undefined) {
                console.warn(
                    `${LOG_PREFIX} Could not find release year for "${filmTitle}"`
                );
            }

            const showings = parseBfiShowings(data, filmUrl);

            console.log(
                `${LOG_PREFIX} "${filmTitle}": ${showings.length} showings parsed`
            );
            return {
                film: { title: filmTitle, url: filmUrl, ...filmInfo },
                showings,
            };
        } catch (error) {
            if (
                attempt > MAX_RETRIES ||
                (error instanceof ProgrammePageError &&
                    error.reason === 'access')
            ) {
                await saveBfiDiagnostic(page, filmUrl, filmTitle, error);
                throw error;
            }
            console.warn(
                `${LOG_PREFIX} Failed to load "${filmTitle}"; retrying`,
                error
            );
        } finally {
            await page.close();
        }
    }

    // Unreachable but required for TypeScript
    throw new Error(`${LOG_PREFIX} Failed to load "${filmTitle}"`);
}

export async function scraper(): Promise<CinemaShowing[]> {
    const browser = await chromium.launch();

    try {
        const context = await browser.newContext();

        // Scrape index page for film links
        const indexPage = await context.newPage();
        try {
            await loadProgrammePage(
                indexPage,
                FILMS_INDEX_URL,
                () =>
                    document.querySelector(
                        'div.Rich-text a[href*="article/"]'
                    ) !== null,
                `${LOG_PREFIX} Film index`
            );
        } catch (error) {
            await saveBfiDiagnostic(
                indexPage,
                FILMS_INDEX_URL,
                'film-index',
                error
            );
            throw error;
        }

        const filmLinks = parseBfiFilmLinks(await indexPage.content());

        await indexPage.close();
        console.log(`${LOG_PREFIX} Found ${filmLinks.length} films`);

        const filmsToProcess =
            TEST_LIMIT !== undefined
                ? filmLinks.slice(0, TEST_LIMIT)
                : filmLinks;
        if (TEST_LIMIT !== undefined) {
            console.log(
                `${LOG_PREFIX} Test mode: processing ${filmsToProcess.length} of ${filmLinks.length} films`
            );
        }

        // Drain in-flight pages before closing their shared browser on failure.
        const failures: unknown[] = [];
        const results = await mapConcurrent(
            filmsToProcess,
            async ({ url, title }) => {
                if (failures.length) return undefined;
                try {
                    return await processFilm(context, url, title);
                } catch (error) {
                    failures.push(error);
                    return undefined;
                }
            },
            CONCURRENCY_LIMIT
        );
        if (failures.length) throw failures[0];
        const filmShowings = results.filter(
            (film): film is FilmShowings => film !== undefined
        );

        const withShowings = filmShowings.filter(
            (fs) => fs.showings.length > 0
        );
        console.log(
            `${LOG_PREFIX} ${withShowings.length}/${filmShowings.length} films have showings`
        );

        return [{ cinema: CINEMA, showings: withShowings }];
    } finally {
        await browser.close();
    }
}

async function main() {
    console.log('Running as main script');
    const result = await scraper();
    const trustedResult = CinemaShowingsSchema.parse(result);
    console.log(JSON.stringify(trustedResult, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}
