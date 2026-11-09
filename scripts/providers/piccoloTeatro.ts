import { DateTime } from 'luxon';
import { parse } from 'node-html-parser';
import { z } from 'zod';
import { fetchPage, mapConcurrent } from '../http';
import type { FilmShowings, Showing } from '../types';

const BASE = 'https://www.piccolo-padova.it';
const API = `${BASE}/wp-json/wp/v2`;
const ZONE = 'Europe/Rome';
const WINDOW_DAYS = 183;
const BOOKING = 'https://www.liveticket.it/piccoloteatropadova';
const Post = z.object({
    id: z.number().int().positive(),
    title: z.object({ rendered: z.string().min(1) }),
    link: z.string().url(),
    date: z.string(),
    modified: z.string(),
    categories: z.array(z.number().int()),
    rttpg_featured_image_url: z.unknown().optional(),
});
type FilmPost = z.infer<typeof Post>;
export interface PiccoloProgramme {
    category: number;
    reference: string;
    entries: { post: FilmPost; html: string }[];
}
const fold = (value: string) =>
    value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
const weekdays = [
    'lunedi',
    'martedi',
    'mercoledi',
    'giovedi',
    'venerdi',
    'sabato',
    'domenica',
];
const months = [
    'gennaio',
    'febbraio',
    'marzo',
    'aprile',
    'maggio',
    'giugno',
    'luglio',
    'agosto',
    'settembre',
    'ottobre',
    'novembre',
    'dicembre',
];
const schedulePattern =
    /\b(luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato|domenica)\s+(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)(?:\s+((?:19|20|21)\d{2}))?\s*(?:[–—-]\s*)?(?:ore|alle)\s+(\d{1,2})[.:](\d{2})\b/giu;

function venueUrl(value: string) {
    const url = new URL(value);
    if (url.origin !== BASE || url.username || url.password)
        throw new Error(`Piccolo Teatro: unexpected film URL ${value}`);
    return url.href;
}
function postDates(post: FilmPost) {
    const dates = [post.date, post.modified].map((value) =>
        DateTime.fromISO(value, { zone: ZONE })
    );
    if (dates.some((date) => !date.isValid))
        throw new Error(`Piccolo Teatro: invalid post metadata for ${post.id}`);
    return dates;
}
function recentPost(post: FilmPost, reference: DateTime) {
    // Publication/modification dates establish freshness only, never showtimes.
    const newest = DateTime.max(...postDates(post))!;
    return (
        newest >= reference.minus({ days: WINDOW_DAYS }) &&
        newest <= reference.plus({ days: WINDOW_DAYS })
    );
}

/** Require a unique nearby year whose calendar weekday agrees with the source. */
export function piccoloScreeningDate(
    day: number,
    month: number,
    weekday: string,
    hour: number,
    minute: number,
    reference: DateTime,
    year?: number
): string {
    reference = reference.setZone(ZONE);
    if (
        !reference.isValid ||
        hour > 23 ||
        hour < 0 ||
        minute > 59 ||
        minute < 0
    )
        throw new Error('Piccolo Teatro: invalid date/time components');
    const expectedWeekday = weekdays.indexOf(fold(weekday)) + 1;
    const years = year
        ? [year]
        : [reference.year - 1, reference.year, reference.year + 1];
    const matches = years
        .map((candidate) =>
            DateTime.fromObject(
                { year: candidate, month, day, hour, minute },
                { zone: ZONE }
            )
        )
        .filter(
            (date) =>
                date.isValid &&
                date.month === month &&
                date.day === day &&
                date.hour === hour &&
                date.minute === minute &&
                date.weekday === expectedWeekday &&
                Math.abs(
                    date.startOf('day').diff(reference.startOf('day'), 'days')
                        .days
                ) <= WINDOW_DAYS &&
                date.getPossibleOffsets().length === 1
        );
    if (matches.length !== 1)
        throw new Error(
            `Piccolo Teatro: ambiguous, stale or inconsistent screening date ${weekday} ${day}/${month}${year ? `/${year}` : ''} ${hour}:${minute}`
        );
    return matches[0].toUTC().toISO()!;
}

export function parsePiccoloFilm(
    input: unknown,
    html: string,
    reference: DateTime
): FilmShowings {
    const post = Post.parse(input);
    if (!recentPost(post, reference))
        throw new Error(
            `Piccolo Teatro: stale post ${post.id}; refusing to assign a new year to archived dates`
        );
    const root = parse(html);
    const articles = root.querySelectorAll(
        `article.post-${post.id}, article#post-${post.id}`
    );
    const article = articles.length === 1 ? articles[0] : undefined;
    const heading = article?.querySelector('header h1.entry-title');
    const schedules = article?.querySelectorAll('header .data-evento') ?? [];
    const title = parse(post.title.rendered).textContent.trim();
    if (
        !article ||
        !heading ||
        schedules.length !== 1 ||
        fold(heading.textContent) !== fold(title)
    )
        throw new Error(
            `Piccolo Teatro: missing or changed film page for ${title} (${post.id})`
        );
    const text = parse(
        schedules[0].innerHTML
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p\s*>/gi, '</p>\n')
    )
        .textContent.replace(/\s+/gu, ' ')
        .trim();
    const matches = [...text.matchAll(schedulePattern)];
    if (!matches.length)
        throw new Error(
            `Piccolo Teatro: no explicit screening times for ${title}`
        );
    let end = 0;
    const times: string[] = [];
    for (const match of matches) {
        if (!/^[\s;,]*$/.test(text.slice(end, match.index)))
            throw new Error(
                `Piccolo Teatro: unsupported date text for ${title}: ${text}`
            );
        const [, weekday, day, month, year, hour, minute] = match;
        times.push(
            piccoloScreeningDate(
                Number(day),
                months.indexOf(fold(month)) + 1,
                weekday,
                Number(hour),
                Number(minute),
                reference,
                year ? Number(year) : undefined
            )
        );
        end = match.index! + match[0].length;
    }
    if (!/^[\s;,]*$/.test(text.slice(end)))
        throw new Error(
            `Piccolo Teatro: unsupported date text for ${title}: ${text}`
        );
    const explicitBooking = article
        .querySelectorAll('a[href]')
        .map((link) => link.getAttribute('href')!)
        .find((value) => {
            try {
                const url = new URL(value, BASE);
                return (
                    url.protocol === 'https:' &&
                    (url.hostname === 'liveticket.it' ||
                        url.hostname.endsWith('.liveticket.it')) &&
                    !url.username &&
                    !url.password
                );
            } catch {
                return false;
            }
        });
    const poster = post.rttpg_featured_image_url;
    const apiPoster =
        poster &&
        typeof poster === 'object' &&
        'full' in poster &&
        Array.isArray(poster.full) &&
        typeof poster.full[0] === 'string'
            ? poster.full[0]
            : undefined;
    const rawPoster =
        apiPoster || root.querySelector('.locandina img')?.getAttribute('src');
    const cover = rawPoster ? new URL(rawPoster, BASE) : undefined;
    return {
        film: {
            title,
            url: venueUrl(post.link),
            coverUrl:
                cover && ['http:', 'https:'].includes(cover.protocol)
                    ? cover.href
                    : undefined,
        },
        showings: [...new Set(times)].sort().map(
            (startTime) =>
                ({
                    startTime,
                    bookingUrl: explicitBooking
                        ? new URL(explicitBooking, BASE).href
                        : BOOKING,
                }) satisfies Showing
        ),
    };
}

export async function loadPiccoloProgramme(
    options: { fetch?: typeof fetchPage; reference?: DateTime } = {}
): Promise<PiccoloProgramme> {
    const fetch = options.fetch ?? fetchPage;
    const reference = (options.reference ?? DateTime.now()).setZone(ZONE);
    if (!reference.isValid)
        throw new Error('Piccolo Teatro: invalid reference date');
    const categoryResponse = await fetch(
        `${API}/categories?slug=cinema&per_page=100`
    );
    if (!categoryResponse.ok)
        throw new Error(
            `Piccolo Teatro categories HTTP ${categoryResponse.status}`
        );
    const categories = z
        .array(z.object({ id: z.number().int().positive(), slug: z.string() }))
        .parse(await categoryResponse.json())
        .filter((category) => category.slug === 'cinema');
    if (categories.length !== 1)
        throw new Error(
            'Piccolo Teatro: cannot uniquely identify the Cinema category'
        );
    const category = categories[0].id;
    const posts = new Map<number, FilmPost>();
    let totalPages = 1;
    let totalPosts: number | null = null;
    for (let page = 1; page <= totalPages; page++) {
        const url = new URL(`${API}/posts`);
        url.search = new URLSearchParams({
            categories: String(category),
            per_page: '100',
            page: String(page),
            _fields:
                'id,title,link,date,modified,categories,rttpg_featured_image_url',
        }).toString();
        const response = await fetch(url.href);
        if (!response.ok)
            throw new Error(`Piccolo Teatro programme HTTP ${response.status}`);
        const rawPages = response.headers.get('x-wp-totalpages');
        const pages = Number(rawPages);
        if (
            rawPages === null ||
            !Number.isInteger(pages) ||
            pages < 0 ||
            pages > 50 ||
            (page > 1 && pages !== totalPages)
        )
            throw new Error(
                'Piccolo Teatro: missing, changed or excessive WordPress page count'
            );
        totalPages = pages;
        const rawTotal = response.headers.get('x-wp-total');
        if (rawTotal !== null) {
            const count = Number(rawTotal);
            if (
                !Number.isInteger(count) ||
                count < 0 ||
                (totalPosts !== null && count !== totalPosts)
            )
                throw new Error(
                    'Piccolo Teatro: invalid or changed WordPress film count'
                );
            totalPosts = count;
        }
        const rows = z.array(Post).parse(await response.json());
        if (
            (!rows.length && page < totalPages) ||
            (rows.length && totalPages === 0)
        )
            throw new Error('Piccolo Teatro: incomplete WordPress programme');
        for (const post of rows) posts.set(post.id, post);
    }
    if (totalPosts !== null && totalPosts !== posts.size)
        throw new Error(
            'Piccolo Teatro: WordPress pagination did not return the complete film list'
        );
    const films = [...posts.values()].filter((post) =>
        post.categories.includes(category)
    );
    const current = films.filter((post) => recentPost(post, reference));
    if (films.length && !current.length)
        throw new Error('Piccolo Teatro: only stale film posts were returned');
    const entries = await mapConcurrent(
        current,
        async (post) => {
            const response = await fetch(venueUrl(post.link));
            if (!response.ok)
                throw new Error(
                    `Piccolo Teatro film ${post.id} HTTP ${response.status}`
                );
            return { post, html: await response.text() };
        },
        2
    );
    return { category, reference: reference.toISO()!, entries };
}

export function parsePiccoloProgramme(
    source: PiccoloProgramme
): FilmShowings[] {
    const reference = DateTime.fromISO(source.reference, { zone: ZONE });
    return source.entries
        .filter((entry) => entry.post.categories.includes(source.category))
        .map((entry) => parsePiccoloFilm(entry.post, entry.html, reference));
}
