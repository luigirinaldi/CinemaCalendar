import { useEffect, useRef, useState } from 'react';
import { MapPin, Search } from 'lucide-react';
import type { CinemaLocationResult } from '../../shared/cinemaLocation';
import { builderApi } from './api';

export default function CinemaLocationSearch({
    csrf,
    name,
    city,
    coordinates,
    disabled,
    onPick,
}: {
    csrf: string;
    name: string;
    city: string;
    coordinates: { lat: string; lng: string };
    disabled: boolean;
    onPick: (result: CinemaLocationResult) => void;
}) {
    const [query, setQuery] = useState<string | null>(null);
    const [results, setResults] = useState<CinemaLocationResult[]>([]);
    const [selected, setSelected] = useState<CinemaLocationResult | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [searched, setSearched] = useState(false);
    const revision = useRef(0);
    useEffect(
        () => () => {
            revision.current++;
        },
        []
    );
    const searchText = query ?? [name, city].filter(Boolean).join(', ');
    async function search() {
        if (busy || disabled || searchText.trim().length < 3) return;
        const id = ++revision.current;
        setBusy(true);
        setError('');
        setResults([]);
        setSearched(false);
        try {
            const response = await builderApi.searchLocation(
                csrf,
                searchText.trim()
            );
            if (id === revision.current) {
                setResults(response.results);
                setSearched(true);
            }
        } catch (error) {
            if (id === revision.current)
                setError(
                    error instanceof Error
                        ? error.message
                        : 'Location search failed. You can enter coordinates manually.'
                );
        } finally {
            if (id === revision.current) setBusy(false);
        }
    }
    return (
        <div className="mb-5 rounded-lg border border-neutral-800 bg-neutral-950/50 p-4">
            <p className="mb-3 flex items-center gap-2 text-sm font-medium">
                <MapPin className="h-4 w-4 text-red-400" />
                Find the cinema’s coordinates
            </p>
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    void search();
                }}
                className="flex flex-col gap-3 sm:flex-row sm:items-end"
            >
                <label className="min-w-0 flex-1 text-sm text-neutral-400">
                    Cinema name or address
                    <input
                        value={searchText}
                        disabled={disabled || busy}
                        maxLength={250}
                        placeholder="Rex Cinema, Padova or a street address"
                        onChange={(event) => {
                            setQuery(event.target.value);
                            setResults([]);
                            setSearched(false);
                            setError('');
                        }}
                        className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white focus:border-red-500 focus:outline-none"
                    />
                </label>
                <button
                    disabled={disabled || busy || searchText.trim().length < 3}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-700 px-4 py-2 text-sm font-medium hover:bg-neutral-800 disabled:opacity-40"
                >
                    <Search className="h-4 w-4" />
                    Search location
                </button>
            </form>
            <p className="mt-2 text-xs text-neutral-500">
                Include the city for better matches. Search text is sent to{' '}
                <a
                    href="https://photon.komoot.io/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                >
                    Photon
                </a>
                ; data ©{' '}
                <a
                    href="https://www.openstreetmap.org/copyright"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                >
                    OpenStreetMap contributors
                </a>
                .
            </p>
            {busy && (
                <p role="status" className="mt-3 text-sm text-neutral-400">
                    Searching locations…
                </p>
            )}
            {error && (
                <p role="alert" className="mt-3 text-sm text-red-400">
                    {error}
                </p>
            )}
            {searched && !results.length && (
                <p role="status" className="mt-3 text-sm text-neutral-400">
                    No locations found. Try the full street address and city, or
                    enter coordinates manually.
                </p>
            )}
            {results.length > 0 && (
                <ul
                    aria-label="Location search results"
                    className="mt-3 space-y-2"
                >
                    {results.map((result) => (
                        <li
                            key={result.id}
                            className="rounded-lg border border-neutral-800 p-3"
                        >
                            <p className="text-sm text-neutral-200">
                                {result.label}
                            </p>
                            <p className="mt-1 text-xs text-neutral-500">
                                {result.lat}, {result.lng}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-4 text-sm">
                                <button
                                    type="button"
                                    disabled={disabled || busy}
                                    aria-label={`Use location: ${result.label}`}
                                    className="font-medium text-red-400 hover:text-red-300 disabled:opacity-40"
                                    onClick={() => {
                                        setSelected(result);
                                        onPick(result);
                                    }}
                                >
                                    Use this location
                                </button>
                                <a
                                    href={`https://www.openstreetmap.org/?mlat=${encodeURIComponent(result.lat)}&mlon=${encodeURIComponent(result.lng)}#map=18/${encodeURIComponent(result.lat)}/${encodeURIComponent(result.lng)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-neutral-400 underline"
                                >
                                    Check on map
                                </a>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
            {selected &&
                coordinates.lat === selected.lat &&
                coordinates.lng === selected.lng && (
                    <p role="status" className="mt-3 text-sm text-emerald-400">
                        Coordinates filled from {selected.label}. You can adjust
                        them below.
                    </p>
                )}
        </div>
    );
}
