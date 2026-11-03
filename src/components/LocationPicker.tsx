import { lazy, Suspense, useState } from 'react';
import { LocateFixed, MapPin, ChevronDown } from 'lucide-react';
import type { Cinema } from '../api';
import {
    cityCenter,
    cinemasInArea,
    nearestCity,
    searchArea,
    type SearchArea,
    type Coordinates,
} from '../lib/location';

const LocationMap = lazy(() => import('./LocationMap'));

export default function LocationPicker({
    cinemas,
    city,
    area,
    onChange,
}: {
    cinemas: Cinema[];
    city: string;
    area: SearchArea | null;
    onChange: (city: string, area: SearchArea | null) => void;
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [draft, setDraft] = useState<SearchArea | null>(area);
    const [km, setKm] = useState(area?.km ?? 25);
    const [locating, setLocating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const cities = [
        ...new Set(cinemas.flatMap((c) => (c.location ? [c.location] : []))),
    ].sort((a, b) => a.localeCompare(b));
    const matches = cities.filter((name) =>
        name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
    );
    const nearby = area ? nearestCity(cinemas, area) : null;
    const label = area
        ? `${nearby && nearby.distance < 100 ? `Near ${nearby.city}` : 'Selected point'} · ${area.km} km`
        : city || 'Choose location';
    const pick = (point: Coordinates) => {
        setDraft(searchArea(point.lat, point.lng, km));
        setError(null);
    };
    function locate() {
        if (!navigator.geolocation) {
            setError(
                'Location is unavailable in this browser. Choose a city or a point on the map.'
            );
            return;
        }
        setLocating(true);
        setError(null);
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const next = searchArea(
                    position.coords.latitude,
                    position.coords.longitude,
                    km
                );
                setDraft(next);
                if (!next)
                    setError(
                        'This location is outside the supported map area. Choose a point on the map.'
                    );
                setLocating(false);
            },
            () => {
                setError(
                    'Could not access your location. Choose a city or a point on the map.'
                );
                setLocating(false);
            },
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
        );
    }
    return (
        <div className={open ? 'w-full' : 'w-full sm:w-auto'}>
            <button
                className="flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm hover:border-neutral-500"
                aria-expanded={open}
                aria-controls="location-picker"
                onClick={() => {
                    if (!open) {
                        const center = area ?? cityCenter(cinemas, city);
                        setDraft(
                            center
                                ? searchArea(
                                      center.lat,
                                      center.lng,
                                      area?.km ?? 25
                                  )
                                : null
                        );
                        setKm(area?.km ?? 25);
                        setQuery('');
                        setError(null);
                    }
                    setOpen(!open);
                }}
            >
                <MapPin className="h-4 w-4 text-red-400" />
                {label}
                <ChevronDown className="h-4 w-4" />
            </button>
            {open && (
                <section
                    id="location-picker"
                    aria-label="Search location"
                    className="mt-3 space-y-4 rounded-xl border border-neutral-700 bg-neutral-900 p-4 sm:p-5"
                >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h2 className="font-semibold">
                                Where would you like to watch?
                            </h2>
                            <p className="mt-1 text-sm text-neutral-400">
                                Choose a city, or pick a point and a distance.
                            </p>
                        </div>
                        <button
                            type="button"
                            disabled={locating}
                            onClick={locate}
                            className="inline-flex items-center gap-2 text-sm text-neutral-200 underline underline-offset-4 disabled:opacity-50"
                        >
                            <LocateFixed className="h-4 w-4" />
                            {locating ? 'Finding location…' : 'Use my location'}
                        </button>
                    </div>
                    <label className="block text-sm text-neutral-300">
                        Find a city
                        <input
                            type="search"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search available cities"
                            className="mt-1 block w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-white"
                        />
                    </label>
                    <div
                        className="flex max-h-32 flex-wrap gap-2 overflow-y-auto"
                        aria-label="Available cities"
                    >
                        {matches.map((name) => (
                            <button
                                key={name}
                                onClick={() => {
                                    onChange(name, null);
                                    setOpen(false);
                                }}
                                className={`rounded-md border px-3 py-1.5 text-sm ${!area && name === city ? 'border-red-700 bg-red-950 text-white' : 'border-neutral-700 text-neutral-300 hover:bg-neutral-800'}`}
                            >
                                {name}
                            </button>
                        ))}
                        {!matches.length && (
                            <p className="text-sm text-neutral-400">
                                No tracked cities match. You can still choose a
                                point below.
                            </p>
                        )}
                    </div>
                    <p className="text-xs text-neutral-400">
                        Click the map to move the search pin. With the map
                        focused, press Enter to choose its centre.
                    </p>
                    <div className="relative z-0 overflow-hidden rounded-lg">
                        <Suspense
                            fallback={
                                <p
                                    role="status"
                                    className="flex h-72 sm:h-80 items-center justify-center text-neutral-400"
                                >
                                    Loading location map...
                                </p>
                            }
                        >
                            <LocationMap
                                cinemas={cinemas}
                                area={draft}
                                onPick={pick}
                            />
                        </Suspense>
                    </div>
                    <label className="block text-sm text-neutral-200">
                        Search within <strong>{km} km</strong>
                        <input
                            aria-label="Search radius in kilometres"
                            type="range"
                            min="1"
                            max="100"
                            value={km}
                            className="mt-2 block w-full accent-red-600"
                            onChange={(event) => {
                                const value = Number(event.target.value);
                                setKm(value);
                                if (draft) setDraft({ ...draft, km: value });
                            }}
                        />
                    </label>
                    <p className="text-sm text-neutral-400">
                        {draft
                            ? `${cinemasInArea(cinemas, draft).length} tracked cinemas in this area.`
                            : 'Pick a point to search nearby.'}{' '}
                        Nearby search includes cinemas with known coordinates.
                    </p>
                    {error && (
                        <p role="alert" className="text-sm text-red-400">
                            {error}
                        </p>
                    )}
                    <div className="flex flex-wrap justify-end gap-3">
                        <button
                            className="rounded-lg px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
                            onClick={() => setOpen(false)}
                        >
                            Cancel
                        </button>
                        <button
                            disabled={!draft || locating}
                            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
                            onClick={() => {
                                if (draft) {
                                    onChange(city, draft);
                                    setOpen(false);
                                }
                            }}
                        >
                            Search this area
                        </button>
                    </div>
                </section>
            )}
        </div>
    );
}
