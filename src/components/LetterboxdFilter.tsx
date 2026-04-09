import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { fetchLetterboxdList, type LetterboxdFilm } from '../api';

const tabClass = (active: boolean) =>
    `px-4 py-2 rounded-lg transition ${
        active ? 'bg-red-700 text-white' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
    }`;

type AppliedFilter = { username: string; films: LetterboxdFilm[]; collapsed: boolean };

function computeSlugs(
    filters: AppliedFilter[],
    mode: 'union' | 'intersect'
): Set<string> | null {
    if (filters.length === 0) return null;
    const slugSets = filters.map((f) => new Set(f.films.map((m) => m.slug)));
    if (filters.length === 1 || mode === 'union') {
        return new Set(slugSets.flatMap((s) => [...s]));
    }
    return slugSets.slice(1).reduce(
        (acc, s) => new Set([...acc].filter((slug) => s.has(slug))),
        new Set(slugSets[0])
    );
}

function FilmList({ films, className }: { films: LetterboxdFilm[]; className?: string }) {
    return (
        <ul className={`divide-y divide-neutral-800 ${className ?? ''}`}>
            {films.map((film) => (
                <li key={film.slug}>
                    <a
                        href={`https://letterboxd.com/film/${film.slug}/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-baseline gap-1.5 px-4 py-1 text-xs text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
                    >
                        <span className="text-neutral-600">↗</span>
                        <span>{film.title}</span>
                        {film.year && <span className="text-neutral-600">({film.year})</span>}
                    </a>
                </li>
            ))}
        </ul>
    );
}

export default function LetterboxdFilter({
    onChange,
}: {
    onChange: (f: Set<string> | null) => void;
}) {
    const [username, setUsername] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pendingFilms, setPendingFilms] = useState<LetterboxdFilm[] | null>(null);
    const [pendingUsername, setPendingUsername] = useState('');
    const [appliedFilters, setAppliedFilters] = useState<AppliedFilter[]>([]);
    const [filterMode, setFilterMode] = useState<'union' | 'intersect'>('union');
    const [panelCollapsed, setPanelCollapsed] = useState(false);

    const handleFetch = async () => {
        const trimmed = username.trim();
        if (!trimmed) return;
        setLoading(true);
        setError(null);
        setPendingFilms(null);
        try {
            const films = await fetchLetterboxdList(trimmed);
            setPendingFilms(films);
            setPendingUsername(trimmed);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to fetch watchlist');
        } finally {
            setLoading(false);
        }
    };

    const handleApply = () => {
        if (!pendingFilms) return;
        const newFilters = appliedFilters.some((f) => f.username === pendingUsername)
            ? appliedFilters.map((f) =>
                  f.username === pendingUsername ? { ...f, films: pendingFilms } : f
              )
            : [...appliedFilters, { username: pendingUsername, films: pendingFilms, collapsed: false }];
        setAppliedFilters(newFilters);
        onChange(computeSlugs(newFilters, filterMode));
        setPendingFilms(null);
    };

    const handleRemoveFilter = (uname: string) => {
        const newFilters = appliedFilters.filter((f) => f.username !== uname);
        setAppliedFilters(newFilters);
        onChange(computeSlugs(newFilters, filterMode));
    };

    const handleSetMode = (mode: 'union' | 'intersect') => {
        setFilterMode(mode);
        onChange(computeSlugs(appliedFilters, mode));
    };

    const handleClearAll = () => {
        setAppliedFilters([]);
        setPendingFilms(null);
        onChange(null);
        setError(null);
    };

    const toggleFilterCollapsed = (uname: string) => {
        setAppliedFilters((prev) =>
            prev.map((f) => (f.username === uname ? { ...f, collapsed: !f.collapsed } : f))
        );
    };

    const effectiveCount = computeSlugs(appliedFilters, filterMode)?.size ?? 0;

    return (
        <div>
            <label className="text-sm text-neutral-400 mb-2 block">Letterboxd Watchlist</label>

            <div className="flex gap-2">
                <input
                    type="text"
                    placeholder="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleFetch()}
                    disabled={loading}
                    className="bg-neutral-800 text-white px-3 py-2 rounded-lg border border-neutral-700 focus:border-red-600 outline-none text-sm w-40"
                />
                <button
                    onClick={handleFetch}
                    disabled={loading || !username.trim()}
                    className={`${tabClass(false)} text-sm disabled:opacity-50 whitespace-nowrap`}
                >
                    {loading ? (
                        <span className="flex items-center gap-2">
                            <span className="inline-block w-3 h-3 rounded-full border-2 border-neutral-400 border-t-white animate-spin" />
                            Loading…
                        </span>
                    ) : (
                        'Filter'
                    )}
                </button>
            </div>

            {error && <p className="text-red-400 text-xs mt-1">{error}</p>}

            {/* Pending confirmation panel */}
            {pendingFilms && (
                <div className="mt-2 rounded-lg border border-neutral-700 bg-neutral-900 overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 bg-neutral-800 border-b border-neutral-700">
                        <span className="text-sm font-medium text-white">
                            @{pendingUsername}
                            <span className="text-neutral-400 font-normal ml-2">
                                — {pendingFilms.length} films
                            </span>
                        </span>
                        <div className="flex gap-2">
                            <button
                                onClick={handleApply}
                                className="px-3 py-1 rounded bg-red-700 text-white text-xs hover:bg-red-600 transition"
                            >
                                {appliedFilters.some((f) => f.username === pendingUsername)
                                    ? 'Update'
                                    : appliedFilters.length > 0
                                      ? 'Add filter'
                                      : 'Apply filter'}
                            </button>
                            <button
                                onClick={() => setPendingFilms(null)}
                                className="px-3 py-1 rounded bg-neutral-700 text-neutral-300 text-xs hover:bg-neutral-600 transition"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                    <FilmList films={pendingFilms} className="overflow-y-auto max-h-64" />
                </div>
            )}

            {/* Applied filters panel */}
            {appliedFilters.length > 0 && !pendingFilms && (
                <div className="mt-2 rounded-lg border border-neutral-700 bg-neutral-900 overflow-hidden">
                    {/* Outer header */}
                    <div className="flex items-center justify-between px-3 py-2 bg-neutral-800 border-b border-neutral-700">
                        <button
                            onClick={() => setPanelCollapsed((c) => !c)}
                            className="flex items-center gap-1.5 text-sm font-medium text-white hover:text-neutral-300 transition"
                        >
                            {panelCollapsed ? (
                                <ChevronDown className="w-3.5 h-3.5 text-neutral-400" />
                            ) : (
                                <ChevronUp className="w-3.5 h-3.5 text-neutral-400" />
                            )}
                            {appliedFilters.length === 1
                                ? `@${appliedFilters[0].username}`
                                : `${appliedFilters.length} watchlists`}
                            <span className="text-neutral-400 font-normal">
                                · {effectiveCount} films
                            </span>
                        </button>
                        <div className="flex items-center gap-2">
                            {appliedFilters.length > 1 && (
                                <div className="flex rounded overflow-hidden border border-neutral-600 text-xs">
                                    <button
                                        onClick={() => handleSetMode('union')}
                                        className={`px-2 py-0.5 transition ${filterMode === 'union' ? 'bg-red-700 text-white' : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'}`}
                                    >
                                        Union
                                    </button>
                                    <button
                                        onClick={() => handleSetMode('intersect')}
                                        className={`px-2 py-0.5 transition ${filterMode === 'intersect' ? 'bg-red-700 text-white' : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'}`}
                                    >
                                        Intersect
                                    </button>
                                </div>
                            )}
                            <button
                                onClick={handleClearAll}
                                className="px-2 py-1 rounded bg-neutral-700 text-neutral-300 text-xs hover:bg-neutral-600 transition"
                            >
                                ✕ Clear
                            </button>
                        </div>
                    </div>

                    {/* Per-filter sections */}
                    {!panelCollapsed && (
                        <div className="max-h-48 overflow-y-auto">
                            {appliedFilters.map((filter, i) => (
                                <div
                                    key={filter.username}
                                    className={i < appliedFilters.length - 1 ? 'border-b border-neutral-700' : ''}
                                >
                                    <div className="flex items-center justify-between px-3 py-1.5 bg-neutral-800/50">
                                        <button
                                            onClick={() => toggleFilterCollapsed(filter.username)}
                                            className="flex items-center gap-1.5 text-xs text-neutral-300 hover:text-white transition"
                                        >
                                            {filter.collapsed ? (
                                                <ChevronDown className="w-3 h-3 text-neutral-500" />
                                            ) : (
                                                <ChevronUp className="w-3 h-3 text-neutral-500" />
                                            )}
                                            @{filter.username}
                                            <span className="text-neutral-500">
                                                — {filter.films.length} films
                                            </span>
                                        </button>
                                        <button
                                            onClick={() => handleRemoveFilter(filter.username)}
                                            className="text-neutral-500 hover:text-neutral-300 text-xs transition px-1"
                                            title={`Remove @${filter.username}`}
                                        >
                                            ✕
                                        </button>
                                    </div>
                                    {!filter.collapsed && <FilmList films={filter.films} />}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
