import { parse } from 'node-html-parser';
import { DateTime } from 'luxon';
import { fetchPage, mapConcurrent } from '../http';
import { publicUrl } from '../programmeScraper';
import type { FilmShowings } from '../types';
import { brusselsTime, programmeHtml } from './bruxelles';

export function ugcPublishedDates(html: string): string[] {
    const match = html.match(/\binitCalendarDate\s*\(\s*(\[[\d,\s]*\])/);
    if (!match)
        throw new Error('UGC Belgium published calendar dates are missing');
    const days: unknown = JSON.parse(match[1]);
    if (!Array.isArray(days) || days.length > 366)
        throw new Error('Unexpected UGC Belgium date collection');
    return [
        ...new Set(
            days.map((day) => {
                if (!/^\d{8}$/.test(String(day)))
                    throw new Error('Invalid UGC Belgium calendar date');
                const parsed = DateTime.fromFormat(String(day), 'yyyyMMdd', {
                    zone: 'Europe/Brussels',
                });
                if (!parsed.isValid)
                    throw new Error('Invalid UGC Belgium calendar date');
                return parsed.toISODate()!;
            })
        ),
    ];
}

export function parseUgcBelgiumProgramme(
    html: string,
    cinemaId: string
): FilmShowings[] {
    const root = parse(html);
    const blocks = root.querySelectorAll('[id^="bloc-showing-film-"]');
    if (
        !blocks.length &&
        !/Aucune séance|aucun film|pas de séance/i.test(root.textContent)
    )
        throw new Error('UGC Belgium programme structure is missing');
    return blocks.flatMap((block) => {
        const link = block.querySelector('.block--title a[href]');
        const title = link?.textContent.trim();
        if (!link || !title)
            throw new Error('UGC Belgium film title or link is missing');
        const showings = block
            .querySelectorAll('[data-showing]')
            .filter(
                (session) => session.getAttribute('data-cinemaId') === cinemaId
            )
            .map((session) => {
                const id = session.getAttribute('data-showing');
                if (!id) throw new Error('UGC Belgium showing ID is missing');
                return {
                    startTime: brusselsTime(
                        `${session.getAttribute('data-seanceDate') || ''} ${session.getAttribute('data-seanceHour') || ''}`,
                        'dd/MM/yyyy HH:mm'
                    ),
                    bookingUrl: `https://www.ugc.be/reservationSeances.html?id=${encodeURIComponent(id)}`,
                };
            });
        if (!showings.length) return [];
        return [
            {
                film: {
                    title,
                    url: publicUrl(
                        link.getAttribute('href')!,
                        'https://www.ugc.be'
                    ),
                    coverUrl: block
                        .querySelector('.visu-wrapper img[data-src]')
                        ?.getAttribute('data-src'),
                },
                showings,
            },
        ];
    });
}

export async function loadUgcBelgiumProgramme(
    cinemaId: string
): Promise<FilmShowings[]> {
    const page = await programmeHtml(
        `https://www.ugc.be/cinema.html?id=${encodeURIComponent(cinemaId)}`
    );
    const days = ugcPublishedDates(page);
    return (
        await mapConcurrent(
            days,
            async (day) => {
                const params = new URLSearchParams({ cinemaId, date: day });
                const response = await fetchPage(
                    `https://www.ugc.be/showingsCinemaAjaxAction!getShowingsForCinemaPage.action?${params}`
                );
                return parseUgcBelgiumProgramme(
                    await response.text(),
                    cinemaId
                );
            },
            3
        )
    ).flat();
}
