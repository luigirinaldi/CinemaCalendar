import { useEffect } from 'react';
import { Circle, CircleMarker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import type { Cinema } from '../api';
import {
    cinemaCoords,
    type Coordinates,
    type SearchArea,
} from '../lib/location';

export function AreaSelection({
    area,
    onPick,
}: {
    area: SearchArea | null;
    onPick: (point: Coordinates) => void;
}) {
    const map = useMapEvents({
        click(event) {
            onPick(event.latlng);
        },
        keypress(event) {
            if (event.originalEvent.key === 'Enter') onPick(map.getCenter());
        },
    });
    useEffect(() => {
        if (area)
            map.fitBounds(
                L.latLng(area.lat, area.lng).toBounds(area.km * 2000),
                { padding: [24, 24], maxZoom: 14, animate: false }
            );
    }, [map, area]);
    return (
        area && (
            <>
                <Circle
                    center={[area.lat, area.lng]}
                    radius={area.km * 1000}
                    pathOptions={{
                        color: '#ef4444',
                        fillOpacity: 0.08,
                        weight: 2,
                    }}
                    interactive={false}
                />
                <CircleMarker
                    center={[area.lat, area.lng]}
                    radius={6}
                    pathOptions={{
                        color: '#fff',
                        fillColor: '#ef4444',
                        fillOpacity: 1,
                    }}
                    interactive={false}
                />
            </>
        )
    );
}

export function CinemaBounds({ cinemas }: { cinemas: Cinema[] }) {
    const map = useMap();
    useEffect(() => {
        const points = cinemas.flatMap((cinema) => {
            const point = cinemaCoords(cinema);
            return point ? [L.latLng(point.lat, point.lng)] : [];
        });
        if (points.length)
            map.fitBounds(L.latLngBounds(points), {
                padding: [30, 30],
                maxZoom: 13,
                animate: false,
            });
    }, [map, cinemas]);
    return null;
}
