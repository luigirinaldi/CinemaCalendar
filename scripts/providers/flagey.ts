import { chromium } from 'playwright-chromium';
import { parse } from 'node-html-parser';
import { loadProgrammePage } from '../browserProgramme';
import { cinemaDate } from '../dates';
import { publicUrl } from '../programmeScraper';
import type { FilmShowings } from '../types';

const CALENDAR = 'https://www.flagey.be/en/agenda/cinema';

export function parseFlageyProgramme(html: string): FilmShowings[] {
    const root = parse(html);
    const sessions = root.querySelectorAll(
        '[data-production-type="movie"][data-event-start]'
    );
    if (!sessions.length)
        throw new Error('Flagey: cinema calendar data is missing');
    return sessions.map((session) => {
        const title = session.getAttribute('data-production-title')?.trim();
        const start = session.getAttribute('data-event-start') || '';
        if (!title || !/\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(start))
            throw new Error(
                'Flagey: screening title or full datetime is missing'
            );
        return {
            film: { title, url: CALENDAR },
            showings: [
                {
                    startTime: cinemaDate(start, 'Europe/Brussels'),
                    theatre:
                        session.getAttribute('data-event-hall') || undefined,
                    bookingUrl: publicUrl(
                        session.getAttribute('href') || CALENDAR,
                        CALENDAR
                    ),
                },
            ],
        };
    });
}

export async function loadFlageyProgramme(): Promise<FilmShowings[]> {
    // Flagey's cookie redirect loops in stateless HTTP. A normal browser session
    // resolves it; all programme fields are then available as HTML data attributes.
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        const visited = new Set<string>();
        const films: FilmShowings[] = [];
        let url: string | undefined = CALENDAR;
        while (url) {
            if (visited.has(url) || visited.size >= 50)
                throw new Error(
                    'Flagey: calendar pagination repeats or exceeds its page limit'
                );
            visited.add(url);
            await loadProgrammePage(
                page,
                url,
                () =>
                    document.querySelector(
                        '[data-production-type="movie"][data-event-start]'
                    ) !== null,
                'Flagey cinema calendar'
            );
            const html = await page.content();
            films.push(...parseFlageyProgramme(html));
            const next = parse(html)
                .querySelector('a[rel="next"]')
                ?.getAttribute('href');
            url = next ? publicUrl(next, url) : undefined;
            if (
                url &&
                (new URL(url).origin !== new URL(CALENDAR).origin ||
                    !new URL(url).pathname.startsWith('/en/agenda'))
            )
                throw new Error(
                    'Flagey: unexpected calendar pagination target'
                );
        }
        return films;
    } finally {
        await browser.close();
    }
}
