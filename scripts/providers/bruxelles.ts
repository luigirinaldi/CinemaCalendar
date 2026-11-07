import { DateTime } from 'luxon';
import { parse, type HTMLElement } from 'node-html-parser';
import { fetchPage, mapConcurrent } from '../http';
import { publicUrl } from '../programmeScraper';
import type { FilmShowings } from '../types';

const ZONE = 'Europe/Brussels';
const text = (root: HTMLElement, selector: string) =>
    root.querySelector(selector)?.textContent.trim().replace(/\s+/g, ' ') || '';
const attr = (root: HTMLElement, selector: string, name: string) =>
    root.querySelector(selector)?.getAttribute(name) || '';
const optionalNumber = (value: string) =>
    Number(value.match(/\d+/)?.[0]) || undefined;

export async function programmeHtml(url: string): Promise<string> {
    return (await fetchPage(url)).text();
}

export function brusselsTime(
    value: string,
    format: string,
    locale = 'fr'
): string {
    const date = DateTime.fromFormat(
        value.replace(/\s+/g, ' ').trim(),
        format,
        { zone: ZONE, locale }
    );
    if (!date.isValid)
        throw new Error(`Invalid Bruxelles screening date: ${value}`);
    return date.toUTC().toISO()!;
}

function requireContainer(root: HTMLElement, selector: string, name: string) {
    const container = root.querySelector(selector);
    if (!container) throw new Error(`${name}: programme container is missing`);
    return container;
}

export function parseAventureProgramme(html: string): FilmShowings[] {
    const table = requireContainer(parse(html), '#movieTable', 'Aventure');
    let day = '';
    return table.querySelectorAll('tr').flatMap((row) => {
        const heading = text(row, 'th .d-none.d-md-block');
        if (heading) day = heading;
        const cells = row.querySelectorAll('td');
        const link = row.querySelector('a[href*="/catalogue/movie/"]');
        if (!link) return [];
        if (!day || cells.length < 3)
            throw new Error('Aventure: screening has no date or time');
        const url = publicUrl(
            link.getAttribute('href')!,
            'https://www.cinema-aventure.be'
        );
        return [
            {
                film: { title: link.textContent.trim(), url },
                showings: [
                    {
                        startTime: brusselsTime(
                            `${day} ${cells[0].textContent.trim()}`,
                            'cccc d LLLL yyyy HH:mm'
                        ),
                        theatre:
                            cells[2].textContent.split('|')[0].trim() ||
                            undefined,
                        bookingUrl: publicUrl(
                            attr(row, 'a.sessionButton', 'href') || url,
                            url
                        ),
                    },
                ],
            },
        ];
    });
}

export function parseRitcsProgramme(html: string): FilmShowings[] {
    const root = parse(html);
    requireContainer(root, '.wpt_events', 'Cinema RITCS');
    return root.querySelectorAll('.wp_theatre_event').map((event) => {
        const title = text(event, '.wp_theatre_event_title');
        const url = publicUrl(
            attr(event, '.wp_theatre_event_title a', 'href'),
            'https://www.cinemaritcs.be'
        );
        if (!title) throw new Error('Cinema RITCS: missing film title');
        return {
            film: {
                title,
                url,
                coverUrl: attr(event, 'figure img', 'src') || undefined,
            },
            showings: [
                {
                    startTime: brusselsTime(
                        `${text(event, '.wp_theatre_event_startdate')} ${text(event, '.wp_theatre_event_starttime')}`,
                        'LLLL d, yyyy h:mm a',
                        'en'
                    ),
                    bookingUrl: publicUrl(
                        attr(event, '.wp_theatre_event_tickets_url', 'href') ||
                            url,
                        url
                    ),
                },
            ],
        };
    });
}

export function parseCinematekProgramme(html: string): FilmShowings[] {
    const root = requireContainer(parse(html), '#calendar', 'Cinematek');
    return root.querySelectorAll('.screening-date-group').flatMap((group) => {
        const day = attr(group, '.screening-date', 'data-date');
        return group.querySelectorAll('a.screening').flatMap((screening) => {
            const theatre = text(screening, '.screening__location');
            if (!['Ledoux', 'Plateau'].includes(theatre)) return [];
            const films = screening.querySelectorAll('.film');
            const title = films
                .map(
                    (film) =>
                        text(film, '.film__title strong') ||
                        text(film, '.film__title')
                )
                .filter(Boolean)
                .join(' + ');
            if (!title)
                throw new Error('Cinematek: screening has no film title');
            const durations = films.map((film) =>
                optionalNumber(
                    text(film, '.film__details').match(/(\d+)\s*['′]/)?.[1] ||
                        ''
                )
            );
            const info =
                films.length === 1 ? text(films[0], '.film__directors') : '';
            return [
                {
                    film: {
                        title,
                        url: 'https://cinematek.be/programme/calendrier',
                        year: optionalNumber(
                            info.match(/\b(?:19|20)\d{2}\b/)?.[0] || ''
                        ),
                        duration:
                            durations.length && durations.every(Boolean)
                                ? durations.reduce<number>(
                                      (sum, n) => sum + n!,
                                      0
                                  )
                                : undefined,
                    },
                    showings: [
                        {
                            startTime: brusselsTime(
                                `${day} ${text(screening, '.screening__time')}`,
                                'yyyy-MM-dd HH:mm'
                            ),
                            theatre,
                            bookingUrl: publicUrl(
                                screening.getAttribute('href')!,
                                'https://cinematek.be'
                            ),
                        },
                    ],
                },
            ];
        });
    });
}

export function parseNovaProgramme(html: string): FilmShowings[] {
    const root = parse(html);
    requireContainer(root, '.liste-agenda', 'Nova');
    const result: FilmShowings[] = [];
    for (const list of root.querySelectorAll('.liste-agenda')) {
        let day = '';
        for (const item of list.childNodes.filter(
            (node): node is HTMLElement => node.nodeType === 1
        )) {
            if (item.classList.contains('jour')) {
                day = item.textContent.match(/\d{2}\.\d{2}\.\d{4}/)?.[0] || '';
                continue;
            }
            if (item.tagName !== 'LI' || !item.classList.contains('item'))
                continue;
            const kind = text(item, '[itemprop="keywords"]');
            if (!/^(?:Film|Compilation|Projection|Séance|Ciné)/i.test(kind))
                continue;
            const title = text(item, 'h2.titre a');
            const url = publicUrl(
                attr(item, 'h2.titre a', 'href'),
                'https://www.nova-cinema.org/'
            );
            if (!title || !day)
                throw new Error(
                    'Nova: screening has no title or full calendar date'
                );
            const single = !item.querySelector('.titre_courts');
            const cover = attr(item, 'meta[itemprop="image"]', 'content');
            result.push({
                film: {
                    title,
                    url,
                    coverUrl: cover ? publicUrl(cover, url) : undefined,
                    director: single
                        ? text(item, '.realisateur') || undefined
                        : undefined,
                    year: single
                        ? optionalNumber(text(item, '.annee'))
                        : undefined,
                    duration: single
                        ? optionalNumber(text(item, '.duree'))
                        : undefined,
                },
                showings: [
                    {
                        startTime: brusselsTime(
                            `${day} ${text(item, '.dategauche')}`,
                            'dd.MM.yyyy HH:mm'
                        ),
                        bookingUrl: url,
                    },
                ],
            });
        }
    }
    return result;
}

export function palaceFilmLinks(html: string): string[] {
    const root = requireContainer(
        parse(html),
        '.results_archive_films__wrapper',
        'Palace'
    );
    return [
        ...new Set(
            root
                .querySelectorAll('article .title a[href]')
                .map((a) =>
                    publicUrl(
                        a.getAttribute('href')!,
                        'https://www.cinema-palace.be'
                    )
                )
        ),
    ].filter((url) => !/^\/(?:en|nl)\//.test(new URL(url).pathname));
}

export function parsePalaceFilm(html: string, url: string): FilmShowings[] {
    const root = parse(html);
    const title = text(root, 'h1.m_article__title');
    if (!title)
        throw new Error(`Palace: film page is missing its title: ${url}`);
    const showings = root
        .querySelectorAll('#seances .seances__item')
        .map((item) => ({
            startTime: brusselsTime(
                attr(item, 'time', 'datetime'),
                'dd/MM/yyyy HH:mm'
            ),
            theatre: text(item, '.seances__room') || undefined,
            bookingUrl: publicUrl(
                attr(item, 'a.seances__time', 'href') || url,
                url
            ),
        }));
    if (!showings.length) return []; // A listed forthcoming film can have no sessions on sale yet.
    const director = root
        .querySelectorAll('.cast__item')
        .find((item) => text(item, '.cast__label') === 'Réalisation');
    return [
        {
            film: {
                title,
                url,
                coverUrl:
                    attr(root, 'meta[property="og:image"]', 'content') ||
                    undefined,
                director: director
                    ? text(director, '.cast__value') || undefined
                    : undefined,
            },
            showings,
        },
    ];
}

export async function loadPalaceProgramme(): Promise<FilmShowings[]> {
    const listing = await programmeHtml(
        'https://www.cinema-palace.be/wp-json/palace/v1/getListingFilms?lang=fr'
    );
    const urls = palaceFilmLinks(listing);
    return (
        await mapConcurrent(
            urls,
            async (url) => parsePalaceFilm(await programmeHtml(url), url),
            3
        )
    ).flat();
}

/** Vendôme prints weekday/day/month; resolve only a nearby year matching that weekday. */
export function vendomeDate(
    dayMonth: string,
    weekday: string,
    reference = DateTime.now().setZone(ZONE)
): string {
    const matches = [reference.year - 1, reference.year, reference.year + 1]
        .map((year) =>
            DateTime.fromFormat(
                `${dayMonth.replace(/\s/g, '')}/${year}`,
                'dd/MM/yyyy',
                { zone: ZONE, locale: 'fr' }
            )
        )
        .filter(
            (date) =>
                date.isValid &&
                date.toFormat('cccc').toLowerCase() ===
                    weekday.trim().toLowerCase() &&
                Math.abs(date.diff(reference.startOf('day'), 'days').days) <=
                    183
        );
    if (matches.length !== 1)
        throw new Error(
            `Vendôme: ambiguous or stale calendar date ${weekday} ${dayMonth}`
        );
    return matches[0].toISODate()!;
}

export function parseVendomeProgramme(
    html: string,
    reference?: DateTime
): FilmShowings[] {
    const root = parse(html);
    const content = root.querySelector('h1')?.parentNode;
    if (!content || !content.querySelector('.taille_contexte'))
        throw new Error('Vendôme: timetable is missing');
    const result: FilmShowings[] = [];
    let title = '';
    for (const child of content.childNodes.filter(
        (node): node is HTMLElement => node.nodeType === 1
    )) {
        if (child.tagName === 'H2') {
            title = child.textContent.trim();
            continue;
        }
        const rows = child.querySelectorAll('.taille_contexte');
        if (!rows.length) continue;
        const href = attr(child, 'a[href*="/les_films/"]', 'href');
        if (!title || !href)
            throw new Error('Vendôme: film title or detail link is missing');
        const url = publicUrl(href, 'http://www.cinema-vendome.be');
        const cover = attr(child, 'img.img_horaire_par_film', 'src');
        const showings = rows.flatMap((row) => {
            const cells = row.childNodes.filter(
                (node): node is HTMLElement => node.nodeType === 1
            );
            if (cells.length < 3)
                throw new Error('Vendôme: malformed timetable row');
            const day = vendomeDate(
                cells[1].textContent.trim(),
                cells[0].textContent.trim(),
                reference
            );
            return cells.slice(2).flatMap((cell) =>
                [...cell.textContent.matchAll(/\b\d{1,2}:\d{2}\b/g)].map(
                    (match) => ({
                        startTime: brusselsTime(
                            `${day} ${match[0].padStart(5, '0')}`,
                            'yyyy-MM-dd HH:mm'
                        ),
                        bookingUrl: url,
                    })
                )
            );
        });
        result.push({
            film: {
                title,
                url,
                coverUrl: cover ? publicUrl(cover, url) : undefined,
            },
            showings,
        });
    }
    return result;
}
