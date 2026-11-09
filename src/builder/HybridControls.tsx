import type { ScraperConfig } from '../../shared/scraperConfig';

export default function HybridControls({
    config,
    onChange,
    sampleUrl,
    setSampleUrl,
    loadSample,
    busy,
}: {
    config: ScraperConfig;
    onChange: (config: ScraperConfig) => void;
    sampleUrl: string;
    setSampleUrl: (url: string) => void;
    loadSample: () => void;
    busy: boolean;
}) {
    const input =
        'mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm';
    return (
        <div className="space-y-3 border-y border-neutral-800 py-4 text-sm text-neutral-400">
            <label className="flex items-start gap-2">
                <input
                    type="checkbox"
                    checked={!!config.details}
                    disabled={!!config.embeddedJson}
                    onChange={(event) => {
                        const empty = { path: '', attribute: '' };
                        onChange({
                            ...config,
                            details: event.target.checked
                                ? {
                                      root: 'article',
                                      freshnessPath: 'modified',
                                      maxFilms: 20,
                                  }
                                : undefined,
                            render: false,
                            showings: '',
                            start: empty,
                            date: empty,
                            booking: empty,
                            splitScreeningLines: false,
                        });
                    }}
                />
                <span>Follow film detail pages for screening times</span>
            </label>
            <p className="text-xs">
                Use this when the API contains film names and links, while the
                dates appear only on each film’s page. Film metadata uses JSON
                paths; screening fields below use HTML selectors.
            </p>
            {config.details && (
                <>
                    <label className="block">
                        Detail-page film container
                        <input
                            className={input}
                            value={config.details.root}
                            placeholder="article"
                            onChange={(event) =>
                                onChange({
                                    ...config,
                                    details: {
                                        ...config.details!,
                                        root: event.target.value,
                                    },
                                })
                            }
                        />
                    </label>
                    <label className="block">
                        API freshness field for yearless dates
                        <input
                            className={input}
                            value={config.details.freshnessPath ?? ''}
                            placeholder="modified"
                            onChange={(event) =>
                                onChange({
                                    ...config,
                                    details: {
                                        ...config.details!,
                                        freshnessPath: event.target.value,
                                    },
                                })
                            }
                        />
                    </label>
                    <p className="text-xs">
                        This field only checks that the film information is
                        current. It is never used as a screening time.
                    </p>
                    <label className="block">
                        Maximum linked films per run
                        <input
                            type="number"
                            min="1"
                            max="50"
                            className={input}
                            value={config.details.maxFilms}
                            onChange={(event) =>
                                onChange({
                                    ...config,
                                    details: {
                                        ...config.details!,
                                        maxFilms: Number(event.target.value),
                                    },
                                })
                            }
                        />
                    </label>
                    <label className="block">
                        Example film page
                        <input
                            type="url"
                            className={input}
                            value={sampleUrl}
                            placeholder="A film detail link from the API"
                            onChange={(event) =>
                                setSampleUrl(event.target.value)
                            }
                        />
                    </label>
                    <button
                        type="button"
                        disabled={busy || !sampleUrl}
                        className="rounded border border-neutral-700 px-3 py-2 text-sm disabled:opacity-40"
                        onClick={loadSample}
                    >
                        Load film page preview
                    </button>
                    <p className="text-xs">
                        Select a screening element in the preview, then map its
                        date/time. Preview checks one API response; validation
                        follows all configured pages and refuses to truncate the
                        film list.
                    </p>
                </>
            )}
        </div>
    );
}
