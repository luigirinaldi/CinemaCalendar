import { DateTime } from 'luxon';
import { parse } from 'node-html-parser';
import { z } from 'zod';
import { fetchPage } from '../http';
import { plainText, publicUrl } from '../programmeScraper';
import type { FilmShowings } from '../types';

const LightProgramme = z.object({
    Schedule: z.array(
        z.object({
            ID: z.number(),
            Title: z.string().min(1),
            Url: z.string().min(1),
            Runtime: z.string().optional(),
            PictureUrl: z.string().optional(),
            Dates: z.array(
                z.object({
                    Key: z.string().regex(/^\d{8}$/),
                    Sessions: z.array(
                        z.object({
                            Sort: z.string().regex(/^\d{4}$/),
                            Url: z.string().optional(),
                        })
                    ),
                })
            ),
        })
    ),
});

export async function loadLightProgramme(website: string): Promise<string> {
    const html = await (await fetchPage(new URL('/cinema', website))).text();
    const feed = parse(html)
        .querySelectorAll('script[src]')
        .map((el) => el.getAttribute('src')!)
        .find(
            (src) =>
                new URL(src, website).pathname ===
                '/resource/services/miniguide/data.ashx'
        );
    if (!feed)
        throw new Error('Light miniguide feed is missing from the cinema page');
    const url = new URL(feed, website);
    if (url.origin !== new URL(website).origin)
        throw new Error('Unexpected Light feed origin');
    return (await fetchPage(url)).text();
}

export function parseLightProgramme(
    body: string,
    website: string
): FilmShowings[] {
    // This endpoint wraps JSON in a JS assignment. Never execute the downloaded script.
    const match = body.match(
        /\bvar\s+__gfminiguidedata\s*=\s*(\{[^]*\})\s*(?:;|$)/
    );
    if (!match) throw new Error('Unexpected Light miniguide response');
    return LightProgramme.parse(JSON.parse(match[1])).Schedule.map((film) => {
        const hours = Number(film.Runtime?.match(/(\d+)h/)?.[1] || 0);
        const minutes = Number(film.Runtime?.match(/(\d+)m/)?.[1] || 0);
        const url = publicUrl(film.Url, website);
        return {
            film: {
                title: plainText(film.Title),
                url,
                duration: hours * 60 + minutes || undefined,
                coverUrl: film.PictureUrl
                    ? publicUrl(film.PictureUrl, website)
                    : undefined,
            },
            showings: film.Dates.flatMap((day) =>
                day.Sessions.map((session) => {
                    const time = DateTime.fromFormat(
                        day.Key + session.Sort,
                        'yyyyMMddHHmm',
                        { zone: 'Europe/London' }
                    );
                    if (!time.isValid)
                        throw new Error(
                            `Invalid Light screening date: ${day.Key} ${session.Sort}`
                        );
                    // Native sessions open a JS booking panel; the film page is the stable booking entry.
                    return {
                        startTime: time.toUTC().toISO()!,
                        bookingUrl: session.Url
                            ? publicUrl(session.Url, website)
                            : url,
                    };
                })
            ),
        };
    });
}
