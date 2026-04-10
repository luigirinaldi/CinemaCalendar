import { DateTime } from 'luxon';
import { CinemaShowings, CinemaShowingsSchema, FilmShowings, Cinema } from '../types';
import { parse } from 'node-html-parser';

const CINEMA_NAME = 'The Garden Cinema';
const LOG_PREFIX = '[' + CINEMA_NAME + ']';
const BASE_URL = 'https://www.thegardencinema.co.uk';

const CINEMA: Cinema = {
    name: CINEMA_NAME,
    location: 'London',
    website: 'https://www.thegardencinema.co.uk',
    coordinates: {
        lat: '51.5135',
        lng: '-0.1244',
    },
    defaultLanguage: 'en-GB',
};

// Comprehensive set of country names (lowercase for case-insensitive matching).
// Includes UN member states, common abbreviations, territories, and historical names
// that may appear in film credits.
const VALID_COUNTRIES = new Set([
    // A
    'afghanistan', 'albania', 'algeria', 'andorra', 'angola',
    'antigua and barbuda', 'argentina', 'armenia', 'australia', 'austria',
    'azerbaijan',
    // B
    'bahamas', 'bahrain', 'bangladesh', 'barbados', 'belarus', 'belgium',
    'belize', 'benin', 'bhutan', 'bolivia', 'bosnia and herzegovina',
    'botswana', 'brazil', 'brunei', 'bulgaria', 'burkina faso', 'burundi',
    // C
    'cabo verde', 'cambodia', 'cameroon', 'canada', 'central african republic',
    'chad', 'chile', 'china', 'colombia', 'comoros', 'congo',
    'democratic republic of the congo', 'costa rica', 'croatia', 'cuba',
    'cyprus', 'czech republic', 'czechia',
    // D
    'denmark', 'djibouti', 'dominica', 'dominican republic',
    // E
    'ecuador', 'egypt', 'el salvador', 'equatorial guinea', 'eritrea',
    'estonia', 'eswatini', 'ethiopia',
    // F
    'fiji', 'finland', 'france',
    // G
    'gabon', 'gambia', 'georgia', 'germany', 'ghana', 'greece', 'grenada',
    'guatemala', 'guinea', 'guinea-bissau', 'guyana',
    // H
    'haiti', 'honduras', 'hungary', 'hong kong',
    // I
    'iceland', 'india', 'indonesia', 'iran', 'iraq', 'ireland', 'israel',
    'italy', 'ivory coast',
    // J
    'jamaica', 'japan', 'jordan',
    // K
    'kazakhstan', 'kenya', 'kiribati', 'kosovo', 'kuwait', 'kyrgyzstan',
    // L
    'laos', 'latvia', 'lebanon', 'lesotho', 'liberia', 'libya',
    'liechtenstein', 'lithuania', 'luxembourg',
    // M
    'macau', 'madagascar', 'malawi', 'malaysia', 'maldives', 'mali', 'malta',
    'marshall islands', 'mauritania', 'mauritius', 'mexico', 'micronesia',
    'moldova', 'monaco', 'mongolia', 'montenegro', 'morocco', 'mozambique',
    'myanmar',
    // N
    'namibia', 'nauru', 'nepal', 'netherlands', 'new zealand', 'nicaragua',
    'niger', 'nigeria', 'north korea', 'north macedonia', 'norway',
    // O
    'oman',
    // P
    'pakistan', 'palau', 'palestine', 'panama', 'papua new guinea', 'paraguay',
    'peru', 'philippines', 'poland', 'portugal', 'puerto rico',
    // Q
    'qatar',
    // R
    'romania', 'russia', 'rwanda',
    // S
    'saint kitts and nevis', 'saint lucia', 'saint vincent and the grenadines',
    'samoa', 'san marino', 'sao tome and principe', 'saudi arabia', 'senegal',
    'serbia', 'seychelles', 'sierra leone', 'singapore', 'slovakia',
    'slovenia', 'solomon islands', 'somalia', 'south africa', 'south korea',
    'south sudan', 'spain', 'sri lanka', 'sudan', 'suriname', 'sweden',
    'switzerland', 'syria',
    // T
    'taiwan', 'tajikistan', 'tanzania', 'thailand', 'timor-leste', 'togo',
    'tonga', 'trinidad and tobago', 'tunisia', 'turkey', 'turkmenistan',
    'tuvalu',
    // U
    'uganda', 'ukraine', 'united arab emirates', 'united kingdom',
    'united states', 'united states of america', 'uruguay', 'uzbekistan',
    // V
    'vanuatu', 'vatican', 'venezuela', 'vietnam',
    // W
    'west germany',
    // Y
    'yemen', 'yugoslavia',
    // Z
    'zambia', 'zimbabwe',
    // Common abbreviations and territories
    'uk', 'usa', 'us', 'uae', 'ussr',
    // British nations sometimes listed separately
    'england', 'scotland', 'wales', 'northern ireland',
    // Other commonly used variants
    'korea',
]);

/**
 * Parse director(s), country/countries, year, and duration from a stats string.
 *
 * Format (positional from the end):
 *   [...directors], [...countries], YYYY, NNNm.
 *
 * Algorithm:
 *   1. Pop last token if it looks like a duration ("NNNm.")
 *   2. Pop new last token if it looks like a year ("YYYY")
 *   3. Pop tokens from the end while they match a known country name
 *   4. Everything remaining is one or more director names
 */
function parseStats(statsText: string): {
    director?: string;
    country?: string;
    year?: number;
    duration?: number;
} {
    const parts = statsText
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);

    let duration: number | undefined;
    let year: number | undefined;

    if (parts.length > 0 && /^\d+m\.?$/.test(parts[parts.length - 1])) {
        duration = parseInt(parts.pop()!);
    }

    if (parts.length > 0 && /^(?:19|20)\d{2}$/.test(parts[parts.length - 1])) {
        year = parseInt(parts.pop()!);
    }

    const countryParts: string[] = [];
    while (
        parts.length > 0 &&
        VALID_COUNTRIES.has(parts[parts.length - 1].toLowerCase())
    ) {
        countryParts.unshift(parts.pop()!);
    }

    const country = countryParts.length > 0 ? countryParts.join(', ') : undefined;
    const director = parts.length > 0 ? parts.join(', ') : undefined;

    return { director, country, year, duration };
}

export async function scraper(): Promise<CinemaShowings> {
    const response = await fetch(BASE_URL);
    const html = await response.text();
    const root = parse(html);

    const filmMap = new Map<string, FilmShowings>();

    const dateBlocks = root.querySelectorAll('.date-block');
    if (dateBlocks.length === 0) {
        throw new Error(`${LOG_PREFIX} No date blocks found on page`);
    }

    for (const dateBlock of dateBlocks) {
        // data-date is in ISO format e.g. "2026-03-22"
        const dateStr = dateBlock.getAttribute('data-date');
        if (!dateStr) {
            console.error(`${LOG_PREFIX} date-block missing data-date attribute`);
            continue;
        }

        const filmCards = dateBlock.querySelectorAll('.films-list__by-date__film');

        for (const filmCard of filmCards) {
            const titleLink = filmCard.querySelector('.films-list__by-date__film__title a');
            if (!titleLink) continue;

            const filmUrl = titleLink.getAttribute('href');
            if (!filmUrl) continue;

            titleLink.querySelector('.films-list__by-date__film__rating')?.remove();
            const title = titleLink.text.trim();

            if (!title) {
                console.error(`${LOG_PREFIX} Empty title for ${filmUrl}`);
                continue;
            }

            // Poster image
            const posterImg = filmCard.querySelector('.films-list__by-date__film__thumb');
            const coverUrl = posterImg?.getAttribute('src') || undefined;

            // Stats: "Director, Country, YYYY, NNNm."
            const statsEl = filmCard.querySelector('.films-list__by-date__film__stats');
            const statsText = statsEl?.text.trim() || '';
            const { director, country, year, duration } = parseStats(statsText);

            // Screening time links
            const screeningLinks = filmCard.querySelectorAll('.screening-time a.screening');

            for (const link of screeningLinks) {
                const timeStr = link.text.trim(); // "HH:MM"
                const bookingUrl = link.getAttribute('href') || undefined;

                const startDt = DateTime.fromISO(`${dateStr}T${timeStr}`, {
                    zone: 'Europe/London',
                });
                if (!startDt.isValid) {
                    console.error(
                        `${LOG_PREFIX} Failed to parse datetime: ${dateStr}T${timeStr} for "${title}"`
                    );
                    continue;
                }
                const startTime = startDt.toISO()!;

                if (!filmMap.has(filmUrl)) {
                    filmMap.set(filmUrl, {
                        film: {
                            title,
                            url: filmUrl,
                            director,
                            country,
                            year,
                            duration,
                            coverUrl,
                        },
                        showings: [],
                    });
                }

                filmMap.get(filmUrl)!.showings.push({
                    startTime,
                    ...(bookingUrl && { bookingUrl }),
                });
            }
        }
    }

    const showings = Array.from(filmMap.values()).filter((fs) => fs.showings.length > 0);

    return [{ cinema: CINEMA, showings }];
}

async function main() {
    console.log('Running as main script');
    const result = await scraper();
    const trustedResult = CinemaShowingsSchema.parse(result);
    console.log(JSON.stringify(trustedResult, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}
