import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet';
import type { Cinema } from '../api';
import {
    cinemaCoords,
    type Coordinates,
    type SearchArea,
} from '../lib/location';
import { AreaSelection, CinemaBounds } from './MapLayers';

export default function LocationMap({
    cinemas,
    area,
    onPick,
}: {
    cinemas: Cinema[];
    area: SearchArea | null;
    onPick: (point: Coordinates) => void;
}) {
    return (
        <MapContainer
            center={[area?.lat ?? 48, area?.lng ?? 8]}
            zoom={5}
            className="h-72 sm:h-80 w-full rounded-lg"
            aria-label="Choose a search location on the map"
        >
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {!area && <CinemaBounds cinemas={cinemas} />}
            <AreaSelection area={area} onPick={onPick} />
            {cinemas.flatMap((cinema) => {
                const point = cinemaCoords(cinema);
                return point
                    ? [
                          <CircleMarker
                              key={cinema.id}
                              center={[point.lat, point.lng]}
                              radius={5}
                              pathOptions={{
                                  color: '#525252',
                                  fillColor: '#fff',
                                  fillOpacity: 1,
                              }}
                              eventHandlers={{ click: () => onPick(point) }}
                          >
                              <Popup>{cinema.name}</Popup>
                          </CircleMarker>,
                      ]
                    : [];
            })}
        </MapContainer>
    );
}
