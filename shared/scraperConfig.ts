import { z } from 'zod';

const path = z
    .string()
    .max(250)
    .refine(
        (value) =>
            !value
                .split('.')
                .some((key) =>
                    ['__proto__', 'prototype', 'constructor'].includes(key)
                ),
        'Unsupported field path'
    );
const field = z.object({
    path,
    attribute: z.string().max(80).default(''),
    scope: z.enum(['row', 'film', 'page', 'ancestor']).optional(),
    ancestor: z.string().max(250).optional(),
    after: z.string().max(200).optional(),
    before: z.string().max(200).optional(),
    replacements: z
        .array(
            z.object({
                find: z.string().min(1).max(200),
                replace: z.string().max(200),
            })
        )
        .max(20)
        .optional(),
});
export const ScraperConfigSchema = z
    .object({
        filename: z
            .string()
            .regex(
                /^[a-z][a-zA-Z0-9]*Cinema\.ts$/,
                'Use a name such as newVenueCinema.ts'
            ),
        cinema: z.object({
            name: z.string().trim().min(2).max(150),
            location: z.string().trim().min(2).max(100),
            website: z
                .string()
                .url()
                .max(1500)
                .refine((value) => {
                    try {
                        const url = new URL(value);
                        return (
                            ['http:', 'https:'].includes(url.protocol) &&
                            !url.username &&
                            !url.password
                        );
                    } catch {
                        return false;
                    }
                }, 'Use an HTTP(S) website without credentials'),
            defaultLanguage: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/),
            coordinates: z.object({
                lat: z
                    .string()
                    .min(1)
                    .refine(
                        (v) =>
                            Number.isFinite(Number(v)) &&
                            Math.abs(Number(v)) <= 85
                    ),
                lng: z
                    .string()
                    .min(1)
                    .refine(
                        (v) =>
                            Number.isFinite(Number(v)) &&
                            Math.abs(Number(v)) <= 180
                    ),
            }),
        }),
        timezone: z
            .string()
            .min(1)
            .refine((zone) => {
                try {
                    new Intl.DateTimeFormat('en', { timeZone: zone });
                    return true;
                } catch {
                    return false;
                }
            }, 'Use an IANA timezone'),
        mode: z.enum(['json', 'html']),
        render: z.boolean().default(false),
        embeddedJson: z.string().max(250).optional(),
        embeddedAssignment: z.string().max(250).optional(),
        url: z.string().url().max(1500),
        items: path.min(1),
        title: field,
        filmUrl: field,
        director: field,
        poster: field,
        showings: path,
        start: field,
        date: field,
        booking: field,
        dateFormat: z.string().max(100).default(''),
        dateLocale: z.string().max(40).optional(),
        pagination: z
            .object({
                parameter: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
                maxPages: z.number().int().min(2).max(50),
                totalPagesPath: path,
            })
            .nullable()
            .default(null),
    })
    .refine(
        (config) => config.title.path && config.start.path,
        'Map both the film title and screening time'
    )
    .refine(
        (config) =>
            !config.embeddedJson ||
            (config.mode === 'json' && !config.pagination),
        'Embedded JSON requires JSON mode and does not support API pagination'
    )
    .refine(
        (config) => !config.embeddedAssignment || !!config.embeddedJson,
        'Choose a script selector for the JavaScript assignment'
    );
export type ScraperConfig = z.infer<typeof ScraperConfigSchema>;
export type FieldMapping = ScraperConfig['title'];

export function emptyConfig(url = ''): ScraperConfig {
    const empty = () => ({ path: '', attribute: '' });
    return {
        filename: 'newVenueCinema.ts',
        cinema: {
            name: '',
            location: '',
            website: url,
            defaultLanguage: 'en-GB',
            coordinates: { lat: '', lng: '' },
        },
        timezone: 'Europe/London',
        mode: 'json',
        render: false,
        url,
        items: '$',
        title: empty(),
        filmUrl: empty(),
        director: empty(),
        poster: empty(),
        showings: '',
        start: empty(),
        date: empty(),
        booking: empty(),
        dateFormat: '',
        pagination: null,
    };
}

export interface Discovery {
    rendered?: boolean;
    url: string;
    html: string;
    candidates: {
        url: string;
        sample: unknown;
        paths: string[];
        embeddedJson?: string;
        embeddedAssignment?: string;
    }[];
    warnings: string[];
}
export interface GeneratedFiles {
    scraperPath: string;
    scraper: string;
    testPath: string;
    test: string;
}
export interface ValidationResult {
    repositoryChecks?: 'pending';
    id: string;
    ok: boolean;
    checks: { name: string; ok: boolean; detail: string }[];
    preview: { title: string; times: string[] }[];
    files: GeneratedFiles | null;
}
