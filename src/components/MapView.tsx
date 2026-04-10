import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, GeoJSON, useMap } from 'react-leaflet';
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
}

// OSM relation IDs → Overpass area IDs (relation ID + 3,600,000,000)
const CITY_AREA_IDS: Record<string, number> = {
    London: 3600065606,
    Padova: 3600044836,
};

const BOUNDARY_URLS: Record<string, string> = {
    London: `${import.meta.env.BASE_URL}data/boundaries/london.geojson`,
    Padova: `${import.meta.env.BASE_URL}data/boundaries/padova.geojson`,
};

function parseCinemaCoords(cinema: CinemaTable): Coords | null {
    const c = cinema.coordinates as { lat: number | string; lng: number | string } | null;
    if (!c) return null;
    const lat = typeof c.lat === 'number' ? c.lat : parseFloat(c.lat as string);
    const lng = typeof c.lng === 'number' ? c.lng : parseFloat(c.lng as string);
    if (isNaN(lat) || isNaN(lng)) return null;
    return { lat, lng };
}

async function fetchOsmCinemas(areaId: number): Promise<OsmCinema[]> {
    const query = `[out:json][timeout:25];area(${areaId})->.city;(node["amenity"="cinema"](area.city);way["amenity"="cinema"](area.city););out center;`;
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    const data = await res.json();
    return (data.elements as Array<{ id: number; tags?: { name?: string }; lat?: number; lon?: number; center?: { lat: number; lon: number } }>)
        .filter((el) => el.lat != null || el.center != null)
        .map((el) => ({
            id: el.id,
            name: el.tags?.name ?? 'Unknown cinema',
            lat: el.lat ?? el.center!.lat,
            lng: el.lon ?? el.center!.lon,
        }));
}

function BoundsFitter({ geojson }: { geojson: GeoJsonObject | null }) {
    const map = useMap();
    const prevGeojson = useRef<GeoJsonObject | null>(null);

    useEffect(() => {
        if (!geojson || geojson === prevGeojson.current) return;
        prevGeojson.current = geojson;
        const layer = L.geoJSON(geojson);
        const bounds = layer.getBounds();
        if (bounds.isValid()) {
            map.fitBounds(bounds as LatLngBoundsExpression, { padding: [20, 20] });
        }
    }, [geojson, map]);

    return null;
}

interface MapViewProps {
    cinemas: CinemaTable[];
    activeCinemaIds: Set<number>;
    selectedCity: string;
}

export default function MapView({ cinemas, activeCinemaIds, selectedCity }: MapViewProps) {
    const [boundaryGeojson, setBoundaryGeojson] = useState<GeoJsonObject | null>(null);
    const [osmCinemas, setOsmCinemas] = useState<OsmCinema[]>([]);
    const [osmLoading, setOsmLoading] = useState(false);

    useEffect(() => {
        const url = BOUNDARY_URLS[selectedCity];
        if (!url) { setBoundaryGeojson(null); return; }
        let cancelled = false;
        fetch(url)
            .then((r) => r.json())
            .then((data) => { if (!cancelled) setBoundaryGeojson(data); })
            .catch(() => { if (!cancelled) setBoundaryGeojson(null); });
        return () => { cancelled = true; };
    }, [selectedCity]);

    useEffect(() => {
        const areaId = CITY_AREA_IDS[selectedCity];
        if (!areaId) { setOsmCinemas([]); return; }
        let cancelled = false;
        setOsmLoading(true);
        fetchOsmCinemas(areaId)
            .then((results) => { if (!cancelled) { setOsmCinemas(results); setOsmLoading(false); } })
            .catch(() => { if (!cancelled) { setOsmCinemas([]); setOsmLoading(false); } });
        return () => { cancelled = true; };
    }, [selectedCity]);

    // Tracked cinemas in the selected city that have coordinates
    const trackedMapped = cinemas.filter(
        (c) => c.location === selectedCity && parseCinemaCoords(c) !== null,
    );
    // Tracked cinemas with no coordinates (can't place on map)
    const trackedUnmapped = cinemas.filter(
        (c) => c.location === selectedCity && parseCinemaCoords(c) === null,
    );

    function trackedMarkerColor(cinema: CinemaTable): string {
        return activeCinemaIds.has(cinema.id) ? '#ef4444' : '#f97316';
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
                        <GeoJSON
                            key={selectedCity}
                            data={boundaryGeojson}
                            style={{ color: '#ef4444', weight: 2, fillOpacity: 0.04, fillColor: '#ef4444' }}
                        />
                        <BoundsFitter geojson={boundaryGeojson} />
                    </>
                )}

                {/* All OSM cinemas in city — grey */}
                {osmCinemas.map((osm) => (
                    <CircleMarker
                        key={osm.id}
                        center={[osm.lat, osm.lng]}
                        radius={7}
                        pathOptions={{ color: '#6b7280', fillColor: '#6b7280', fillOpacity: 0.7, weight: 1.5 }}
                    >
                        <Popup>
                            <div className="text-sm">
                                <p className="font-semibold">{osm.name}</p>
                                <p className="text-neutral-400 text-xs">Not yet tracked</p>
                            </div>
                        </Popup>
                    </CircleMarker>
                ))}

                {/* Tracked cinemas — red (active) or orange (no screenings) — rendered on top */}
                {trackedMapped.map((cinema) => {
                    const coords = parseCinemaCoords(cinema)!;
                    const color = trackedMarkerColor(cinema);
                    return (
                        <CircleMarker
                            key={cinema.id}
                            center={[coords.lat, coords.lng]}
                            radius={10}
                            pathOptions={{ color, fillColor: color, fillOpacity: 0.9, weight: 2 }}
                        >
                            <Popup>
                                <div className="text-sm">
                                    <p className="font-semibold">{cinema.name}</p>
                                    {activeCinemaIds.has(cinema.id)
                                        ? <p className="text-green-600 text-xs mt-1">Screenings available</p>
                                        : <p className="text-neutral-400 text-xs mt-1">No screenings in current range</p>
                                    }
                                </div>
                            </Popup>
                        </CircleMarker>
                    );
                })}
            </MapContainer>

            {/* OSM loading indicator */}
            {osmLoading && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-neutral-900/90 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs text-neutral-300">
                    Loading cinemas from OpenStreetMap…
                </div>
            )}

            {/* Legend */}
            <div className="absolute bottom-6 left-4 z-[1000] bg-neutral-900/90 border border-neutral-700 rounded-lg p-3 text-xs text-white space-y-1">
                <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full inline-block" style={{ background: '#ef4444' }} />
                    <span>Tracked — screenings this range</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full inline-block" style={{ background: '#f97316' }} />
                    <span>Tracked — no current screenings</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full inline-block" style={{ background: '#6b7280' }} />
                    <span>Cinema on OSM (not yet tracked)</span>
                </div>
            </div>

            {/* Tracked cinemas without coordinates */}
            {trackedUnmapped.length > 0 && (
                <div className="absolute top-4 right-4 z-[1000] bg-neutral-900/90 border border-neutral-700 rounded-lg p-3 text-xs text-white max-w-48">
                    <p className="font-semibold mb-1 text-neutral-400">Missing coordinates:</p>
                    <ul className="space-y-0.5">
                        {trackedUnmapped.map((c) => (
                            <li key={c.id}>{c.name}</li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
