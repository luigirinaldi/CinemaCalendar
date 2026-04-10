import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { LatLngBoundsExpression } from 'leaflet';
import type { GeoJsonObject } from 'geojson';
import type { CinemaTable } from '../api';

interface Coords {
    lat: number;
    lng: number;
}

interface OsmCinema {
    id: number;
    name: string;
    lat: number;
    lng: number;
    website?: string;
}

const CITY_AREA_IDS: Record<string, number> = {
    London: 3600065606,
    Padova: 3600044836,
};

const BOUNDARY_URLS: Record<string, string> = {
    London: `${import.meta.env.BASE_URL}data/boundaries/london.geojson`,
    Padova: `${import.meta.env.BASE_URL}data/boundaries/padova.geojson`,
};

const osmCache = new Map<string, OsmCinema[]>();

// ~111m threshold — coords come from OSM so matched pairs are essentially identical;
// this just needs to be generous enough to survive minor float differences while
// keeping truly separate buildings (e.g. BFI Southbank vs BFI IMAX ~300m away) apart.
const PROXIMITY_THRESHOLD_SQ = 0.0001 ** 2;

function parseCinemaCoords(cinema: CinemaTable): Coords | null {
    const c = cinema.coordinates as { lat: number | string; lng: number | string } | null;
    if (!c) return null;
    const lat = typeof c.lat === 'number' ? c.lat : parseFloat(c.lat as string);
    const lng = typeof c.lng === 'number' ? c.lng : parseFloat(c.lng as string);
    if (isNaN(lat) || isNaN(lng)) return null;
    return { lat, lng };
}

function normalizeHost(url: string): string {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

async function fetchOsmCinemas(areaId: number, signal: AbortSignal): Promise<OsmCinema[]> {
    const query = `[out:json][timeout:25];area(${areaId})->.city;(node["amenity"="cinema"](area.city);way["amenity"="cinema"](area.city););out center;`;
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`Overpass error ${res.status}`);
    const data = await res.json();
    type OsmEl = {
        id: number;
        tags?: { name?: string; website?: string; 'contact:website'?: string };
        lat?: number; lon?: number;
        center?: { lat: number; lon: number };
    };
    return (data.elements as OsmEl[])
        .filter((el) => el.lat != null || el.center != null)
        .map((el) => ({
            id: el.id,
            name: el.tags?.name ?? 'Unknown cinema',
            lat: el.lat ?? el.center!.lat,
            lng: el.lon ?? el.center!.lon,
            website: el.tags?.website ?? el.tags?.['contact:website'],
        }));
}

function countBadgeHtml(count: number): string {
    if (count <= 0) return '';
    return `<span style="position:absolute;top:-5px;right:-5px;background:#ef4444;color:#fff;border-radius:999px;font-size:8px;font-weight:700;min-width:12px;height:12px;display:flex;align-items:center;justify-content:center;padding:0 2px;box-shadow:0 1px 2px rgba(0,0,0,0.5)">${count}</span>`;
}

function faviconIcon(website: string, available: boolean, count: number): L.DivIcon {
    let domain: string;
    try { domain = new URL(website).hostname; } catch { domain = website; }
    const src = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
    const size = 32;
    const filter = available ? 'none' : 'grayscale(100%) opacity(0.6)';
    const badge = available ? countBadgeHtml(count) : '';
    return L.divIcon({
        html: `<div style="position:relative;display:inline-block;width:${size}px;height:${size}px"><img src="${src}" width="${size}" height="${size}" style="border-radius:3px;box-shadow:0 1px 4px rgba(0,0,0,0.5);filter:${filter}" onerror="this.style.display='none'" />${badge}</div>`,
        className: '',
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor: [0, -(size / 2 + 6)],
    });
}

function initialsIcon(name: string, available: boolean, count: number): L.DivIcon {
    const words = name.replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
    const letters = words.slice(0, 2).map(w => w[0].toUpperCase()).join('');
    const size = 32;
    const bg = available ? '#ef4444' : 'rgba(107,114,128,0.45)';
    const shadow = available ? '0 1px 4px rgba(0,0,0,0.5)' : 'none';
    const badge = available ? countBadgeHtml(count) : '';
    return L.divIcon({
        html: `<div style="position:relative;display:inline-block;width:${size}px;height:${size}px;background:${bg};color:#fff;border-radius:4px;display:flex;align-items:center;justify-content:center;font-weight:700;box-shadow:${shadow}">${letters}${badge}</div>`,
        className: '',
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor: [0, -(size / 2 + 6)],
    });
}

function BoundsFitter({ geojson }: { geojson: GeoJsonObject | null }) {
    const map = useMap();
    const prevGeojson = useRef<GeoJsonObject | null>(null);
    useEffect(() => {
        if (!geojson || geojson === prevGeojson.current) return;
        prevGeojson.current = geojson;
        const layer = L.geoJSON(geojson);
        const bounds = layer.getBounds();
        if (bounds.isValid()) map.fitBounds(bounds as LatLngBoundsExpression, { padding: [20, 20] });
    }, [geojson, map]);
    return null;
}

interface MapViewProps {
    cinemas: CinemaTable[];
    activeCinemaIds: Set<number>;
    selectedCity: string;
    cinemaMovieCounts: Map<number, number>;
}

export default function MapView({ cinemas, activeCinemaIds, selectedCity, cinemaMovieCounts }: MapViewProps) {
    const [boundaryGeojson, setBoundaryGeojson] = useState<GeoJsonObject | null>(null);
    const [osmCinemas, setOsmCinemas] = useState<OsmCinema[]>([]);
    const [osmLoading, setOsmLoading] = useState(false);
    const [osmError, setOsmError] = useState<string | null>(null);

    useEffect(() => {
        const url = BOUNDARY_URLS[selectedCity];
        setBoundaryGeojson(null);
        if (!url) return;
        const controller = new AbortController();
        fetch(url, { signal: controller.signal })
            .then((r) => r.json())
            .then((data) => setBoundaryGeojson(data))
            .catch((err) => { if (err.name !== 'AbortError') setBoundaryGeojson(null); });
        return () => controller.abort();
    }, [selectedCity]);

    useEffect(() => {
        const areaId = CITY_AREA_IDS[selectedCity];
        if (!areaId) { setOsmCinemas([]); return; }
        const cached = osmCache.get(selectedCity);
        if (cached) { setOsmCinemas(cached); return; }
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30_000);
        setOsmCinemas([]);
        setOsmLoading(true);
        setOsmError(null);
        fetchOsmCinemas(areaId, controller.signal)
            .then((results) => { osmCache.set(selectedCity, results); setOsmCinemas(results); setOsmLoading(false); })
            .catch((err) => { if (err.name === 'AbortError') return; setOsmError('Could not load cinemas from OpenStreetMap.'); setOsmLoading(false); })
            .finally(() => clearTimeout(timeoutId));
        return () => { controller.abort(); clearTimeout(timeoutId); };
    }, [selectedCity]);

    const trackedWithCoords = cinemas
        .filter((c) => c.location === selectedCity)
        .flatMap((c) => { const coords = parseCinemaCoords(c); return coords ? [{ cinema: c, coords }] : []; });

    const trackedUnmapped = cinemas.filter(
        (c) => c.location === selectedCity && parseCinemaCoords(c) === null,
    );

    /** Match an OSM cinema to a tracked cinema.
     *  When both OSM and DB cinema have websites: require hostname match AND proximity.
     *  When either lacks a website: use proximity alone.
     *  This prevents BFI Southbank/IMAX mixup (same hostname, different buildings).
     */
    function matchTracked(osm: OsmCinema): CinemaTable | null {
        const osmHost = osm.website ? normalizeHost(osm.website) : '';

        let best: { cinema: CinemaTable; distSq: number } | null = null;
        for (const { cinema, coords } of trackedWithCoords) {
            const distSq = (osm.lat - coords.lat) ** 2 + (osm.lng - coords.lng) ** 2;
            if (distSq >= PROXIMITY_THRESHOLD_SQ) continue;

            const dbHost = cinema.website ? normalizeHost(cinema.website) : '';
            // If both sides have a website, require hostname to also match
            if (osmHost && dbHost && osmHost !== dbHost) continue;

            if (!best || distSq < best.distSq) best = { cinema, distSq };
        }
        return best?.cinema ?? null;
    }

    // Tracked cinemas with no OSM counterpart — show as fallback markers
    const osmMatchedCinemaIds = new Set(
        osmCinemas.map((osm) => matchTracked(osm)?.id).filter((id): id is number => id != null),
    );
    const unmatchedTracked = trackedWithCoords.filter(({ cinema }) => !osmMatchedCinemaIds.has(cinema.id));

    function renderMarker(
        key: number | string,
        position: [number, number],
        website: string | null | undefined,
        name: string,
        available: boolean,
        count: number,
        popupContent: React.ReactNode,
    ) {
        const icon = website
            ? faviconIcon(website, available, count)
            : initialsIcon(name, available, count);
        return (
            <Marker key={key} position={position} icon={icon} zIndexOffset={available ? 1000 : 100}>
                <Popup>{popupContent}</Popup>
            </Marker>
        );
    }

    return (
        <div className="relative" style={{ height: 'calc(100vh - 220px)', minHeight: '400px' }}>
            <MapContainer
                center={[51.5, -0.1]}
                zoom={10}
                style={{ height: '100%', width: '100%', borderRadius: '8px' }}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {boundaryGeojson && (
                    <>
                        <GeoJSON key={selectedCity} data={boundaryGeojson}
                            style={{ color: '#ef4444', weight: 2, fillOpacity: 0.04, fillColor: '#ef4444' }} />
                        <BoundsFitter geojson={boundaryGeojson} />
                    </>
                )}

                {/* OSM cinemas — unavailable first so available ones render on top */}
                {[...osmCinemas]
                    .map((osm) => {
                        const tracked = matchTracked(osm);
                        const available = tracked != null && activeCinemaIds.has(tracked.id);
                        const count = tracked ? (cinemaMovieCounts.get(tracked.id) ?? 0) : 0;
                        const website = osm.website ?? tracked?.website ?? null;
                        return { osm, tracked, available, count, website };
                    })
                    .sort((a, b) => Number(a.available) - Number(b.available))
                    .map(({ osm, tracked, available, count, website }) => {
                        const label = tracked?.name ?? osm.name;
                        const popup = (
                            <div className="text-sm min-w-36">
                                <p className="font-semibold">{label}</p>
                                {tracked
                                    ? count > 0
                                        ? <p className="text-red-500 text-xs mt-0.5">{count} film{count !== 1 ? 's' : ''} showing</p>
                                        : <p className="text-neutral-400 text-xs mt-0.5">No screenings in current range</p>
                                    : osm.website
                                        ? <a href={osm.website} target="_blank" rel="noopener noreferrer" className="text-blue-500 text-xs hover:underline break-all">{osm.website}</a>
                                        : <p className="text-neutral-400 text-xs">Not yet tracked</p>
                                }
                            </div>
                        );
                        return renderMarker(osm.id, [osm.lat, osm.lng], website, label, available, count, popup);
                    })}

                {/* Fallback markers for tracked cinemas with no OSM entry */}
                {unmatchedTracked.map(({ cinema, coords }) => {
                    const available = activeCinemaIds.has(cinema.id);
                    const count = cinemaMovieCounts.get(cinema.id) ?? 0;
                    const popup = (
                        <div className="text-sm min-w-36">
                            <p className="font-semibold">{cinema.name}</p>
                            {count > 0
                                ? <p className="text-red-500 text-xs mt-0.5">{count} film{count !== 1 ? 's' : ''} showing</p>
                                : <p className="text-neutral-400 text-xs mt-0.5">No screenings in current range</p>}
                        </div>
                    );
                    return renderMarker(cinema.id, [coords.lat, coords.lng], cinema.website, cinema.name, available, count, popup);
                })}
            </MapContainer>

            {(osmLoading || osmError) && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-neutral-900/90 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs text-neutral-300">
                    {osmLoading ? 'Loading cinemas from OpenStreetMap…' : osmError}
                </div>
            )}

            {/* Legend */}
            <div className="absolute bottom-6 left-4 z-[1000] bg-neutral-900/90 border border-neutral-700 rounded-lg p-3 text-xs text-white space-y-1.5">
                <div className="flex items-center gap-2">
                    <img src="https://www.google.com/s2/favicons?domain=example.com&sz=32" width="14" height="14" className="rounded-sm" />
                    <span>Screenings available</span>
                </div>
                <div className="flex items-center gap-2">
                    <img src="https://www.google.com/s2/favicons?domain=example.com&sz=32" width="10" height="10" className="rounded-sm" style={{ filter: 'grayscale(100%) opacity(0.45)' }} />
                    <span>No screenings / not tracked</span>
                </div>
            </div>

            {trackedUnmapped.length > 0 && (
                <div className="absolute top-4 right-4 z-[1000] bg-neutral-900/90 border border-neutral-700 rounded-lg p-3 text-xs text-white max-w-48">
                    <p className="font-semibold mb-1 text-neutral-400">Missing coordinates:</p>
                    <ul className="space-y-0.5">{trackedUnmapped.map((c) => <li key={c.id}>{c.name}</li>)}</ul>
                </div>
            )}
        </div>
    );
}
