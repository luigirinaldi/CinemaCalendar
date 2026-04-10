/**
 * One-time script to update cinema GPS coordinates in the DB using OSM data.
 *
 * Usage:
 *   npx tsx scripts/update_cinema_coords.ts           # dry run — shows matches, no writes
 *   npx tsx scripts/update_cinema_coords.ts --apply   # writes coordinates to DB
 */
import 'dotenv/config';
import { connectDB } from './database';

const CITY_AREA_IDS: Record<string, number> = {
    London: 3600065606,
    Padova: 3600044836,
};

interface OsmCinema {
    id: number;
    name: string;
    lat: number;
    lng: number;
    website?: string;
}

const OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

type OsmElement = {
    id: number;
    tags?: { name?: string; website?: string; 'contact:website'?: string };
    lat?: number;
    lon?: number;
    center?: { lat: number; lon: number };
};

async function fetchOsmCinemasForCity(areaId: number): Promise<OsmCinema[]> {
    const query = `[out:json][timeout:25];area(${areaId})->.city;(node["amenity"="cinema"](area.city);way["amenity"="cinema"](area.city););out center;`;

    let lastError = '';
    for (const endpoint of OVERPASS_ENDPOINTS) {
        const url = `${endpoint}?data=${encodeURIComponent(query)}`;
        let res: Response | undefined;
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                res = await fetch(url);
            } catch (e) {
                lastError = String(e);
                break;
            }
            if (res.status === 429 || res.status >= 500) {
                lastError = `${res.status} ${res.statusText}`;
                if (attempt < 2) {
                    const wait = attempt * 8_000;
                    console.log(
                        `    ${res.status} from ${endpoint} — waiting ${wait / 1000}s…`
                    );
                    await new Promise((r) => setTimeout(r, wait));
                    continue;
                }
                res = undefined;
                break;
            }
            if (!res.ok) {
                lastError = `${res.status} ${res.statusText}`;
                res = undefined;
            }
            break;
        }
        if (res?.ok) {
            console.log(`    Using endpoint: ${endpoint}`);
            const data = await res.json();
            return (data.elements as OsmElement[])
                .filter((el) => el.lat != null || el.center != null)
                .map((el) => ({
                    id: el.id,
                    name: el.tags?.name ?? '(unnamed)',
                    lat: el.lat ?? el.center!.lat,
                    lng: el.lon ?? el.center!.lon,
                    website: el.tags?.website ?? el.tags?.['contact:website'],
                }));
        }
        console.log(`    Endpoint failed (${lastError}), trying next…`);
    }
    throw new Error(`All Overpass endpoints failed. Last error: ${lastError}`);
}

function normalize(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Jaccard similarity on word tokens, with substring and space-stripped comparisons */
function similarity(a: string, b: string): number {
    const na = normalize(a);
    const nb = normalize(b);
    if (na === nb) return 1.0;
    if (na.includes(nb) || nb.includes(na)) return 0.9;

    // Also compare with spaces removed — catches "RegentStreetCinema" vs "Regent Street Cinema"
    // and "Porto Astra" vs "Portoastra"
    const sa = na.replace(/\s/g, '');
    const sb = nb.replace(/\s/g, '');
    if (sa === sb) return 1.0;
    if (sa.includes(sb) || sb.includes(sa)) return 0.85;

    const wordsA = new Set(na.split(' ').filter(Boolean));
    const wordsB = new Set(nb.split(' ').filter(Boolean));
    const intersection = [...wordsA].filter((w) => wordsB.has(w)).length;
    const union = new Set([...wordsA, ...wordsB]).size;
    return union === 0 ? 0 : intersection / union;
}

function findBestMatch(
    name: string,
    candidates: OsmCinema[]
): { match: OsmCinema; score: number } | null {
    let best: { match: OsmCinema; score: number } | null = null;
    for (const osm of candidates) {
        const score = similarity(name, osm.name);
        if (!best || score > best.score) best = { match: osm, score };
    }
    return best && best.score >= 0.3 ? best : null;
}

function formatCoords(lat: number, lng: number): string {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

async function main() {
    const apply = process.argv.includes('--apply');
    const db = await connectDB();

    try {
        const cinemas = await db
            .selectFrom('new_cinemas')
            .selectAll()
            .execute();
        const cities = [...new Set(cinemas.map((c) => c.location))];

        for (const city of cities) {
            const areaId = CITY_AREA_IDS[city];
            if (!areaId) {
                console.log(
                    `\nSkipping ${city} — no Overpass area ID configured`
                );
                continue;
            }

            if (cities.indexOf(city) > 0) {
                // Brief pause to be polite to the Overpass API
                await new Promise((r) => setTimeout(r, 3_000));
            }

            console.log(`\n── ${city} ─────────────────────────────────`);
            console.log(`  Fetching OSM cinemas for area ${areaId}…`);
            const osmCinemas = await fetchOsmCinemasForCity(areaId);
            console.log(`  Found ${osmCinemas.length} cinemas on OSM\n`);

            const cityCinemas = cinemas.filter((c) => c.location === city);

            for (const cinema of cityCinemas) {
                const result = findBestMatch(cinema.name, osmCinemas);

                if (!result) {
                    console.log(`  ✗ ${cinema.name}`);
                    console.log(`      No OSM match found (score < 0.3)`);
                    console.log(
                        `      OSM candidates: ${osmCinemas.map((o) => `"${o.name}"`).join(', ')}`
                    );
                    continue;
                }

                const { match, score } = result;
                const confidence =
                    score >= 0.8 ? 'HIGH' : score >= 0.5 ? 'MED' : 'LOW';
                const coords = formatCoords(match.lat, match.lng);

                console.log(
                    `  ${confidence === 'HIGH' ? '✓' : '?'} ${cinema.name}`
                );
                console.log(
                    `      OSM match:   "${match.name}" (score: ${score.toFixed(2)}, ${confidence})`
                );
                console.log(
                    `      Coordinates: ${coords}${match.website ? `  [${match.website}]` : ''}`
                );

                if (confidence === 'LOW') {
                    console.log(
                        `      ⚠ Low confidence — skipping even with --apply`
                    );
                    continue;
                }

                if (apply) {
                    const update: Record<string, unknown> = {
                        coordinates: { lat: match.lat, lng: match.lng },
                    };
                    if (match.website) update.website = match.website;
                    await db
                        .updateTable('new_cinemas')
                        .set(update as any)
                        .where('id', '=', cinema.id)
                        .execute();
                    console.log(
                        `      → Updated coords${match.website ? ' + website' : ''} in DB`
                    );
                }
            }
        }

        if (!apply) {
            console.log(
                '\n(dry run) Re-run with --apply to write coordinates to the DB'
            );
        } else {
            console.log('\n✅ Done');
        }
    } finally {
        await db.destroy();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
