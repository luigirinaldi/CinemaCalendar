import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Braces,
    Check,
    ExternalLink,
    Film,
    Github,
    MousePointer2,
    Search,
} from 'lucide-react';
import {
    ScraperConfigSchema,
    emptyConfig,
    type Discovery,
    type ScraperConfig,
    type FieldMapping,
    type ValidationResult,
} from '../../shared/scraperConfig';
import { builderApi, hostedBuilder, type BuilderStatus } from './api';
import CinemaLocationSearch from './CinemaLocationSearch';
import FieldOptions from './FieldOptions';
import DateWorkbench from './DateWorkbench';
import './builder.css';
import {
    scraperFilename,
    selectionDocument,
    suggestJsonMapping,
    type SelectionMessage,
} from './mapping';

function sourceKey(source: {
    url: string;
    embeddedJson?: string;
    embeddedAssignment?: string;
}) {
    return JSON.stringify([
        source.url,
        source.embeddedJson ?? '',
        source.embeddedAssignment ?? '',
    ]);
}

const inputClass =
    'mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white focus:border-red-500 focus:outline-none';
const buttonClass =
    'inline-flex items-center justify-center gap-2 rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40';
const panelClass =
    'rounded-xl border border-neutral-800 bg-neutral-900 p-5 sm:p-6';
type MappingKey =
    | 'title'
    | 'filmUrl'
    | 'director'
    | 'poster'
    | 'start'
    | 'date'
    | 'booking';
const mappings: [MappingKey, string, string][] = [
    ['title', 'Film title', 'Required; relative to each film'],
    ['filmUrl', 'Film detail link', 'Optional'],
    ['director', 'Director', 'Optional'],
    ['poster', 'Poster', 'Optional'],
    ['start', 'Screening time', 'Required; relative to each screening'],
    ['date', 'Screening date', 'Optional if time includes a complete date'],
    ['booking', 'Booking link', 'Optional; relative to each screening'],
];

export default function ScraperBuilder() {
    const [status, setStatus] = useState<BuilderStatus | null>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState('');
    const [website, setWebsite] = useState('');
    const [useBrowser, setUseBrowser] = useState(false);
    const [discovery, setDiscovery] = useState<Discovery | null>(null);
    const [config, setConfig] = useState<ScraperConfig>(() => emptyConfig());
    const [validation, setValidation] = useState<ValidationResult | null>(null);
    const [reviewed, setReviewed] = useState(false);
    const [pr, setPr] = useState<{ url: string; branch: string } | null>(null);
    const [selected, setSelected] = useState<'items' | 'showings' | MappingKey>(
        'items'
    );
    const [selectionText, setSelectionText] = useState('');
    const [preview, setPreview] = useState<Awaited<
        ReturnType<typeof builderApi.preview>
    > | null>(null);
    const [previewError, setPreviewError] = useState('');
    const [codeTab, setCodeTab] = useState<'scraper' | 'test'>('scraper');
    const frame = useRef<HTMLIFrameElement>(null);
    const revision = useRef(0);
    const [nonce] = useState(() => crypto.randomUUID());
    const srcDoc = useMemo(
        () => (discovery ? selectionDocument(discovery.html, nonce) : ''),
        [discovery, nonce]
    );

    const connect = useCallback(async () => {
        try {
            setStatus(await builderApi.session());
            setError(
                new URLSearchParams(location.search).get('builderError') ?? ''
            );
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : 'Could not connect or finish sign-in. Check the builder configuration and try again.'
            );
        }
    }, []);
    useEffect(() => {
        void connect();
        const message = new URLSearchParams(location.search).get(
            'builderError'
        );
        if (message) setError(message);
    }, [connect]);
    const edit = useCallback((next: ScraperConfig) => {
        revision.current++;
        setConfig(next);
        setValidation(null);
        setReviewed(false);
        setPr(null);
        setPreview(null);
        setPreviewError('');
    }, []);
    useEffect(() => {
        function receive(event: MessageEvent) {
            if (busy) return;
            if (
                event.source !== frame.current?.contentWindow ||
                event.data?.type !== 'cinema-selection'
            )
                return;
            const message = event.data as SelectionMessage;
            if (
                ![
                    message.collection,
                    message.documentPath,
                    message.filmPath,
                    message.showingPath,
                ].every(
                    (value) => typeof value === 'string' && value.length < 500
                )
            )
                return;
            setSelectionText(message.text);
            const next = { ...config };
            if (selected === 'items' || selected === 'showings')
                next[selected] = message.collection;
            else {
                const screening = ['start', 'date', 'booking'].includes(
                    selected
                );
                const attribute =
                    selected === 'booking' || selected === 'filmUrl'
                        ? 'href'
                        : selected === 'poster'
                          ? 'src'
                          : message.attributes.datetime
                            ? 'datetime'
                            : '';
                next[selected] = {
                    ...config[selected],
                    path:
                        config[selected].scope === 'ancestor' &&
                        typeof message.ancestorPath === 'string' &&
                        message.ancestorPath.length < 500
                            ? message.ancestorPath
                            : config[selected].scope === 'page'
                              ? message.documentPath
                              : config[selected].scope === 'film'
                                ? message.filmPath
                                : screening
                                  ? message.showingPath
                                  : message.filmPath,
                    attribute,
                };
            }
            edit(next);
        }
        addEventListener('message', receive);
        return () => removeEventListener('message', receive);
    }, [config, selected, edit, busy]);
    const sendScope = useCallback(() => {
        frame.current?.contentWindow?.postMessage(
            {
                type: 'cinema-scope',
                film: config.items,
                showings: config.showings,
                ancestor:
                    selected !== 'items' && selected !== 'showings'
                        ? config[selected].ancestor
                        : '',
            },
            '*'
        );
    }, [config, selected]);
    useEffect(sendScope, [sendScope]);

    async function discover() {
        if (!status) return;
        setBusy(
            useBrowser
                ? 'Inspecting JavaScript and public API requests in a browser…'
                : 'Reading the programme and public API links…'
        );
        setError('');
        setValidation(null);
        setPr(null);
        try {
            const result = await builderApi.discover(
                status.csrf,
                website,
                useBrowser
            );
            setDiscovery(result);
            const candidate = result.candidates[0];
            edit({
                ...emptyConfig(result.url),
                mode: candidate ? 'json' : 'html',
                url: candidate?.url ?? result.url,
                embeddedJson: candidate?.embeddedJson ?? '',
                embeddedAssignment: candidate?.embeddedAssignment ?? '',
                render: candidate?.embeddedJson
                    ? !!result.rendered
                    : !candidate && !!result.rendered,
                items: candidate ? '$' : 'article',
                ...(candidate ? suggestJsonMapping(candidate.sample) : {}),
            });
        } catch (error) {
            setError(
                error instanceof Error ? error.message : 'Inspection failed'
            );
        } finally {
            setBusy('');
        }
    }
    async function validate() {
        if (!status) return;
        const parsed = ScraperConfigSchema.safeParse(config);
        if (!parsed.success) {
            setError(
                parsed.error.issues
                    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
                    .join('\n')
            );
            return;
        }
        setBusy(
            status.edge
                ? 'Checking live output, catalogue duplicates and repository filenames…'
                : 'Checking duplicates, live output, typechecking and all tests. This can take a minute…'
        );
        setError('');
        setReviewed(false);
        setPr(null);
        const checkedRevision = revision.current;
        try {
            const result = await builderApi.validate(status.csrf, parsed.data);
            if (checkedRevision === revision.current) setValidation(result);
            else
                setError(
                    'The mapping changed during validation. Run the checks again.'
                );
        } catch (error) {
            setError(
                error instanceof Error ? error.message : 'Validation failed'
            );
        } finally {
            setBusy('');
        }
    }
    async function previewMapping() {
        if (!status) return;
        const checkedRevision = revision.current;
        setBusy('Reading the mapped programme…');
        setPreview(null);
        setPreviewError('');
        try {
            const result = await builderApi.preview(status.csrf, config);
            if (checkedRevision === revision.current) setPreview(result);
        } catch (cause) {
            if (checkedRevision === revision.current)
                setPreviewError(
                    cause instanceof Error ? cause.message : 'Preview failed'
                );
        } finally {
            setBusy('');
        }
    }
    async function submit() {
        if (!status || !validation?.ok || !reviewed) return;
        setBusy('Creating a reviewed scraper branch and pull request…');
        setError('');
        try {
            setPr(await builderApi.submit(status.csrf, validation.id));
        } catch (error) {
            setError(
                error instanceof Error ? error.message : 'Submission failed'
            );
        } finally {
            setBusy('');
        }
    }
    function download(kind: 'scraper' | 'test') {
        const files = validation?.files;
        if (!files) return;
        const url = URL.createObjectURL(
            new Blob([files[kind]], { type: 'text/plain' })
        );
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = (
            kind === 'scraper' ? files.scraperPath : files.testPath
        )
            .split('/')
            .at(-1)!;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    function field(key: MappingKey, value: Partial<FieldMapping>) {
        edit({ ...config, [key]: { ...config[key], ...value } });
    }

    return (
        <div className="scraper-builder min-h-screen bg-neutral-950 text-neutral-100">
            <header className="border-b border-neutral-800">
                <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5">
                    <div className="flex items-center gap-3">
                        <Film className="h-7 w-7 text-red-500" />
                        <div>
                            <h1 className="text-xl font-bold">
                                Cinema scrapers{' '}
                                <span className="builder-beta">Beta</span>
                            </h1>
                            <p className="text-xs text-neutral-400">
                                CineView · Cinema onboarding
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                        <a
                            className="text-neutral-400 hover:text-white"
                            href={import.meta.env.BASE_URL}
                        >
                            Back to cinema listings
                        </a>
                        {status?.login ? (
                            <>
                                <span className="text-neutral-300">
                                    <Github className="mr-1 inline h-4 w-4" />
                                    {status.login}
                                </span>
                                <button
                                    onClick={async () => {
                                        await builderApi.logout(status.csrf);
                                        await connect();
                                    }}
                                    className="text-neutral-400 underline"
                                >
                                    Sign out
                                </button>
                            </>
                        ) : status?.githubConfigured ? (
                            <button
                                onClick={async () => {
                                    try {
                                        location.href = await builderApi.login(
                                            status.csrf
                                        );
                                    } catch (error) {
                                        setError(
                                            error instanceof Error
                                                ? error.message
                                                : 'Sign-in failed'
                                        );
                                    }
                                }}
                                className="rounded-lg border border-neutral-700 px-3 py-2"
                            >
                                <Github className="mr-2 inline h-4 w-4" />
                                Sign in with GitHub
                            </button>
                        ) : (
                            <span className="text-xs text-neutral-500">
                                {status?.edge
                                    ? 'Hosted helper · GitHub not configured'
                                    : 'Local editing · GitHub not configured'}
                            </span>
                        )}
                    </div>
                </div>
            </header>
            <main className="mx-auto max-w-7xl space-y-6 px-5 py-8">
                <div className="max-w-3xl">
                    <h2 className="text-2xl font-semibold tracking-tight">
                        Add a cinema
                    </h2>
                    <p className="mt-3 leading-relaxed text-neutral-400">
                        Enter its programme URL, choose the data to collect, and
                        check the screenings before generating a scraper.
                    </p>
                    <p role="note" className="builder-beta-note mt-4 text-sm">
                        Beta — check the results against the cinema’s website.
                        Some layouts still need a custom scraper, especially
                        programmes spread across detail pages or interactive
                        calendars.
                    </p>
                </div>
                <ol className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-neutral-400">
                    {[
                        'Discover',
                        'Map programme',
                        'Test & review',
                        'Open pull request',
                    ].map((label, index) => (
                        <li key={label} className="flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-neutral-700 text-xs">
                                {index + 1}
                            </span>
                            {label}
                        </li>
                    ))}
                </ol>
                {status?.edge && (
                    <p className="border-l border-neutral-700 pl-3 text-sm text-neutral-400">
                        Hosted mode: sign in with repository write access to
                        inspect sources. Browser rendering is available through
                        the local companion. Full repository checks run on draft
                        pull requests in GitHub Actions.
                    </p>
                )}
                {!status && !hostedBuilder && (
                    <div className={panelClass}>
                        <p className="text-sm text-neutral-300">
                            This page needs the local builder service for
                            website inspection and repository checks.
                        </p>
                        <pre className="my-3 rounded bg-neutral-950 p-3 text-sm">
                            npm run scraper_builder
                        </pre>
                        <button className={buttonClass} onClick={connect}>
                            Reconnect to local service
                        </button>
                    </div>
                )}
                {error && (
                    <div
                        role="alert"
                        className="whitespace-pre-wrap rounded-lg border border-red-900 bg-red-950/30 p-4 text-sm text-red-200"
                    >
                        {error}
                    </div>
                )}
                <section className={panelClass}>
                    <h3 className="mb-4 flex items-center gap-2 font-semibold">
                        <Search className="h-4 w-4 text-red-400" />
                        1. Discover the programme
                    </h3>
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            void discover();
                        }}
                        className="flex flex-col gap-3 sm:flex-row"
                    >
                        <label className="flex-1 text-sm text-neutral-400">
                            Cinema programme URL
                            <input
                                required
                                type="url"
                                value={website}
                                onChange={(event) =>
                                    setWebsite(event.target.value)
                                }
                                placeholder="https://cinema.example/whats-on"
                                className={inputClass}
                            />
                        </label>
                        <button
                            disabled={
                                !status ||
                                !!busy ||
                                (!!status.edge && !status.login)
                            }
                            className={`${buttonClass} sm:self-end`}
                        >
                            Find public API
                        </button>
                    </form>
                    <label className="mt-4 flex items-start gap-2 text-sm text-neutral-400">
                        <input
                            type="checkbox"
                            checked={useBrowser}
                            disabled={!!busy || !!status?.edge}
                            onChange={(event) =>
                                setUseBrowser(event.target.checked)
                            }
                            className="mt-1 accent-red-600"
                        />
                        <span>
                            Inspect JavaScript requests (slower). Enable if the
                            fast scan misses the programme or API.
                        </span>
                    </label>
                    {discovery && (
                        <details className="mt-4 text-sm text-neutral-400">
                            <summary className="cursor-pointer">
                                Inspection notes · {discovery.candidates.length}{' '}
                                public JSON responses found
                            </summary>
                            <ul className="mt-2 list-disc space-y-1 pl-5">
                                {discovery.warnings.map((warning) => (
                                    <li key={warning}>{warning}</li>
                                ))}
                            </ul>
                        </details>
                    )}
                </section>
                {discovery && (
                    <fieldset
                        disabled={!!busy}
                        className="min-w-0 space-y-6 border-0 p-0"
                    >
                        <section className={panelClass}>
                            <h3 className="mb-4 font-semibold">
                                2. Cinema details
                            </h3>
                            <CinemaLocationSearch
                                csrf={status?.csrf ?? ''}
                                name={config.cinema.name}
                                city={config.cinema.location}
                                coordinates={config.cinema.coordinates}
                                disabled={!status || !!busy}
                                onPick={(result) =>
                                    edit({
                                        ...config,
                                        cinema: {
                                            ...config.cinema,
                                            coordinates: {
                                                lat: result.lat,
                                                lng: result.lng,
                                            },
                                            location:
                                                config.cinema.location ||
                                                result.city,
                                        },
                                    })
                                }
                            />
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                <label className="text-sm text-neutral-400">
                                    Cinema name
                                    <input
                                        value={config.cinema.name}
                                        onChange={(event) =>
                                            edit({
                                                ...config,
                                                filename: scraperFilename(
                                                    event.target.value
                                                ),
                                                cinema: {
                                                    ...config.cinema,
                                                    name: event.target.value,
                                                },
                                            })
                                        }
                                        className={inputClass}
                                    />
                                </label>
                                <label className="text-sm text-neutral-400">
                                    City
                                    <input
                                        value={config.cinema.location}
                                        onChange={(event) =>
                                            edit({
                                                ...config,
                                                cinema: {
                                                    ...config.cinema,
                                                    location:
                                                        event.target.value,
                                                },
                                            })
                                        }
                                        className={inputClass}
                                    />
                                </label>
                                <label className="text-sm text-neutral-400">
                                    Cinema website
                                    <input
                                        type="url"
                                        value={config.cinema.website}
                                        onChange={(event) =>
                                            edit({
                                                ...config,
                                                cinema: {
                                                    ...config.cinema,
                                                    website: event.target.value,
                                                },
                                            })
                                        }
                                        className={inputClass}
                                    />
                                </label>
                                <label className="text-sm text-neutral-400">
                                    Timezone
                                    <input
                                        list="builder-zones"
                                        value={config.timezone}
                                        onChange={(event) =>
                                            edit({
                                                ...config,
                                                timezone: event.target.value,
                                            })
                                        }
                                        className={inputClass}
                                    />
                                    <datalist id="builder-zones">
                                        <option value="Europe/Rome" />
                                        <option value="Europe/London" />
                                        <option value="Europe/Paris" />
                                        <option value="America/New_York" />
                                    </datalist>
                                </label>
                                <label className="text-sm text-neutral-400">
                                    Default language
                                    <input
                                        placeholder="it-IT"
                                        value={config.cinema.defaultLanguage}
                                        onChange={(event) =>
                                            edit({
                                                ...config,
                                                cinema: {
                                                    ...config.cinema,
                                                    defaultLanguage:
                                                        event.target.value,
                                                },
                                            })
                                        }
                                        className={inputClass}
                                    />
                                </label>
                                <label className="text-sm text-neutral-400">
                                    Scraper filename
                                    <input
                                        value={config.filename}
                                        onChange={(event) =>
                                            edit({
                                                ...config,
                                                filename: event.target.value,
                                            })
                                        }
                                        className={inputClass}
                                    />
                                </label>
                                {(['lat', 'lng'] as const).map((key) => (
                                    <label
                                        key={key}
                                        className="text-sm text-neutral-400"
                                    >
                                        {key === 'lat'
                                            ? 'Latitude'
                                            : 'Longitude'}
                                        <input
                                            inputMode="decimal"
                                            value={
                                                config.cinema.coordinates[key]
                                            }
                                            onChange={(event) =>
                                                edit({
                                                    ...config,
                                                    cinema: {
                                                        ...config.cinema,
                                                        coordinates: {
                                                            ...config.cinema
                                                                .coordinates,
                                                            [key]: event.target
                                                                .value,
                                                        },
                                                    },
                                                })
                                            }
                                            className={inputClass}
                                        />
                                    </label>
                                ))}
                            </div>
                        </section>
                        <section className={panelClass}>
                            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                <h3 className="flex items-center gap-2 font-semibold">
                                    <Braces className="h-4 w-4 text-red-400" />
                                    Map the programme
                                </h3>
                                <div className="flex gap-2">
                                    {(['json', 'html'] as const).map((mode) => (
                                        <button
                                            key={mode}
                                            aria-pressed={config.mode === mode}
                                            onClick={() =>
                                                edit({
                                                    ...config,
                                                    ...Object.fromEntries(
                                                        mappings.map(
                                                            ([key]) => [
                                                                key,
                                                                {
                                                                    path: '',
                                                                    attribute:
                                                                        '',
                                                                },
                                                            ]
                                                        )
                                                    ),
                                                    mode,
                                                    embeddedJson:
                                                        mode === 'json'
                                                            ? (discovery
                                                                  .candidates[0]
                                                                  ?.embeddedJson ??
                                                              '')
                                                            : '',
                                                    embeddedAssignment:
                                                        mode === 'json'
                                                            ? (discovery
                                                                  .candidates[0]
                                                                  ?.embeddedAssignment ??
                                                              '')
                                                            : '',
                                                    render:
                                                        (mode === 'html' ||
                                                            !!discovery
                                                                .candidates[0]
                                                                ?.embeddedJson) &&
                                                        !!discovery.rendered,
                                                    items:
                                                        mode === 'json'
                                                            ? '$'
                                                            : 'article',
                                                    showings: '',
                                                    dateFormat: '',
                                                    ...(mode === 'json' &&
                                                    discovery.candidates[0]
                                                        ? suggestJsonMapping(
                                                              discovery
                                                                  .candidates[0]
                                                                  .sample
                                                          )
                                                        : {}),
                                                    url:
                                                        mode === 'html'
                                                            ? discovery.url
                                                            : (discovery
                                                                  .candidates[0]
                                                                  ?.url ??
                                                              config.url),
                                                    pagination: null,
                                                })
                                            }
                                            className={`rounded-lg border px-3 py-2 text-sm ${config.mode === mode ? 'border-red-600 bg-red-950' : 'border-neutral-700'}`}
                                        >
                                            {mode === 'json'
                                                ? 'JSON data'
                                                : 'Select on page'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="grid items-start gap-6 lg:grid-cols-2">
                                <div className="space-y-4">
                                    {config.mode === 'json' &&
                                        discovery.candidates.length > 0 && (
                                            <label className="block text-sm text-neutral-400">
                                                Detected JSON sources
                                                <select
                                                    className={inputClass}
                                                    value={
                                                        discovery.candidates.some(
                                                            (c) =>
                                                                sourceKey(c) ===
                                                                sourceKey(
                                                                    config
                                                                )
                                                        )
                                                            ? sourceKey(config)
                                                            : ''
                                                    }
                                                    onChange={(event) => {
                                                        const candidate =
                                                            discovery.candidates.find(
                                                                (item) =>
                                                                    sourceKey(
                                                                        item
                                                                    ) ===
                                                                    event.target
                                                                        .value
                                                            );
                                                        if (candidate)
                                                            edit({
                                                                ...config,
                                                                ...suggestJsonMapping(
                                                                    candidate.sample
                                                                ),
                                                                url: candidate.url,
                                                                embeddedAssignment:
                                                                    candidate.embeddedAssignment ??
                                                                    '',
                                                                embeddedJson:
                                                                    candidate.embeddedJson ??
                                                                    '',
                                                                render:
                                                                    !!candidate.embeddedJson &&
                                                                    !!discovery.rendered,
                                                                pagination:
                                                                    null,
                                                            });
                                                    }}
                                                >
                                                    <option value="" disabled>
                                                        Choose a response
                                                    </option>
                                                    {discovery.candidates.map(
                                                        (item) => (
                                                            <option
                                                                key={sourceKey(
                                                                    item
                                                                )}
                                                                value={sourceKey(
                                                                    item
                                                                )}
                                                            >
                                                                {item.embeddedJson
                                                                    ? `Embedded: ${item.embeddedAssignment || item.embeddedJson}`
                                                                    : item.url}
                                                            </option>
                                                        )
                                                    )}
                                                </select>
                                            </label>
                                        )}
                                    <label className="block text-sm text-neutral-400">
                                        {config.mode === 'json'
                                            ? config.embeddedJson
                                                ? 'Page containing JSON'
                                                : 'Public GET API URL'
                                            : 'Programme page URL'}
                                        <input
                                            type="url"
                                            value={config.url}
                                            onChange={(event) =>
                                                edit({
                                                    ...config,
                                                    url: event.target.value,
                                                })
                                            }
                                            className={inputClass}
                                        />
                                    </label>
                                    {config.mode === 'json' && (
                                        <label className="block text-sm text-neutral-400">
                                            Embedded JSON script selector (blank
                                            for an API response)
                                            <input
                                                className={inputClass}
                                                value={
                                                    config.embeddedJson ?? ''
                                                }
                                                placeholder="script#__NEXT_DATA__"
                                                onChange={(event) =>
                                                    edit({
                                                        ...config,
                                                        embeddedJson:
                                                            event.target.value,
                                                        embeddedAssignment: '',
                                                        pagination: null,
                                                    })
                                                }
                                            />
                                            <span className="mt-1 block text-xs">
                                                Reads the selected script on
                                                each run. Static assignments are
                                                parsed without executing page
                                                code.
                                            </span>
                                        </label>
                                    )}
                                    {config.mode === 'json' &&
                                        config.embeddedJson && (
                                            <label className="block text-sm text-neutral-400">
                                                JavaScript assignment (blank for
                                                a JSON-only script)
                                                <input
                                                    className={inputClass}
                                                    value={
                                                        config.embeddedAssignment ??
                                                        ''
                                                    }
                                                    placeholder="window.data or programme"
                                                    onChange={(event) =>
                                                        edit({
                                                            ...config,
                                                            embeddedAssignment:
                                                                event.target
                                                                    .value,
                                                        })
                                                    }
                                                />
                                                <span className="mt-1 block text-xs">
                                                    Supports literal objects and
                                                    arrays, including single
                                                    quotes and unquoted keys,
                                                    and JSON.parse of a literal
                                                    string. Computed data needs
                                                    a custom scraper.
                                                </span>
                                            </label>
                                        )}
                                    {(config.mode === 'html' ||
                                        !!config.embeddedJson) && (
                                        <label className="flex items-start gap-2 text-sm text-neutral-400">
                                            <input
                                                type="checkbox"
                                                checked={config.render}
                                                disabled={!!status?.edge}
                                                onChange={(event) =>
                                                    edit({
                                                        ...config,
                                                        render: event.target
                                                            .checked,
                                                    })
                                                }
                                                className="mt-1 accent-red-600"
                                            />
                                            Render JavaScript when scraping this
                                            programme (requires a browser).
                                        </label>
                                    )}
                                    <p className="text-xs leading-relaxed text-neutral-500">
                                        {config.mode === 'json'
                                            ? 'Use dot paths relative to each film or screening. $ means the response itself. Suggestions are a starting point; review the sample.'
                                            : 'Pick the repeated film container first, then screening rows and their fields. Hold Alt while clicking to select the parent container. You can edit every selector. $self selects the chosen row itself.'}
                                    </p>
                                    {(['items', 'showings'] as const).map(
                                        (key) => (
                                            <label
                                                key={key}
                                                className="block text-sm text-neutral-300"
                                            >
                                                {key === 'items'
                                                    ? 'Film collection'
                                                    : 'Screening rows within each film'}
                                                <div className="flex gap-2">
                                                    <input
                                                        value={config[key]}
                                                        onChange={(event) =>
                                                            edit({
                                                                ...config,
                                                                [key]: event
                                                                    .target
                                                                    .value,
                                                            })
                                                        }
                                                        className={inputClass}
                                                    />
                                                    {config.mode === 'html' && (
                                                        <button
                                                            aria-pressed={
                                                                selected === key
                                                            }
                                                            onClick={() =>
                                                                setSelected(key)
                                                            }
                                                            className={`mt-1 rounded border px-3 ${selected === key ? 'border-red-500 text-red-300' : 'border-neutral-700'}`}
                                                        >
                                                            <MousePointer2 className="h-4 w-4" />
                                                            <span className="sr-only">
                                                                Pick {key}
                                                            </span>
                                                        </button>
                                                    )}
                                                </div>
                                            </label>
                                        )
                                    )}
                                    {mappings.map(([key, label, help]) => (
                                        <div
                                            key={key}
                                            className="block text-sm text-neutral-300"
                                        >
                                            {label}
                                            <span className="ml-2 text-xs text-neutral-500">
                                                {help}
                                            </span>
                                            <div className="flex gap-2">
                                                <input
                                                    aria-label={label}
                                                    value={config[key].path}
                                                    onChange={(event) =>
                                                        field(key, {
                                                            path: event.target
                                                                .value,
                                                        })
                                                    }
                                                    className={inputClass}
                                                />
                                                {config.mode === 'html' && (
                                                    <>
                                                        <input
                                                            aria-label={`${label} attribute`}
                                                            value={
                                                                config[key]
                                                                    .attribute
                                                            }
                                                            placeholder="text"
                                                            onChange={(event) =>
                                                                field(key, {
                                                                    attribute:
                                                                        event
                                                                            .target
                                                                            .value,
                                                                })
                                                            }
                                                            className={`${inputClass} max-w-24`}
                                                        />
                                                        <button
                                                            aria-pressed={
                                                                selected === key
                                                            }
                                                            onClick={() =>
                                                                setSelected(key)
                                                            }
                                                            className={`mt-1 rounded border px-3 ${selected === key ? 'border-red-500 text-red-300' : 'border-neutral-700'}`}
                                                        >
                                                            <MousePointer2 className="h-4 w-4" />
                                                            <span className="sr-only">
                                                                Pick {label}
                                                            </span>
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                            <FieldOptions
                                                value={config[key]}
                                                html={config.mode === 'html'}
                                                onChange={(value) =>
                                                    field(key, value)
                                                }
                                            />
                                        </div>
                                    ))}
                                    <DateWorkbench
                                        config={config}
                                        onChange={edit}
                                    />
                                    {config.mode === 'json' &&
                                        !config.embeddedJson && (
                                            <details className="text-sm text-neutral-400">
                                                <summary className="cursor-pointer">
                                                    API pagination
                                                </summary>
                                                <label className="mt-3 flex gap-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={
                                                            !!config.pagination
                                                        }
                                                        onChange={(event) =>
                                                            edit({
                                                                ...config,
                                                                pagination:
                                                                    event.target
                                                                        .checked
                                                                        ? {
                                                                              parameter:
                                                                                  'page',
                                                                              maxPages: 20,
                                                                              totalPagesPath:
                                                                                  '',
                                                                          }
                                                                        : null,
                                                            })
                                                        }
                                                    />
                                                    The API has multiple pages
                                                </label>
                                                {config.pagination && (
                                                    <div className="mt-3 grid gap-3">
                                                        <label>
                                                            Page parameter
                                                            <input
                                                                value={
                                                                    config
                                                                        .pagination
                                                                        .parameter
                                                                }
                                                                onChange={(
                                                                    event
                                                                ) =>
                                                                    edit({
                                                                        ...config,
                                                                        pagination:
                                                                            {
                                                                                ...config.pagination!,
                                                                                parameter:
                                                                                    event
                                                                                        .target
                                                                                        .value,
                                                                            },
                                                                    })
                                                                }
                                                                className={
                                                                    inputClass
                                                                }
                                                            />
                                                        </label>
                                                        <label>
                                                            Total pages path
                                                            (optional; WordPress
                                                            header is detected)
                                                            <input
                                                                value={
                                                                    config
                                                                        .pagination
                                                                        .totalPagesPath
                                                                }
                                                                onChange={(
                                                                    event
                                                                ) =>
                                                                    edit({
                                                                        ...config,
                                                                        pagination:
                                                                            {
                                                                                ...config.pagination!,
                                                                                totalPagesPath:
                                                                                    event
                                                                                        .target
                                                                                        .value,
                                                                            },
                                                                    })
                                                                }
                                                                className={
                                                                    inputClass
                                                                }
                                                            />
                                                        </label>
                                                        <label>
                                                            Maximum pages
                                                            <input
                                                                type="number"
                                                                min="2"
                                                                max="50"
                                                                value={
                                                                    config
                                                                        .pagination
                                                                        .maxPages
                                                                }
                                                                onChange={(
                                                                    event
                                                                ) =>
                                                                    edit({
                                                                        ...config,
                                                                        pagination:
                                                                            {
                                                                                ...config.pagination!,
                                                                                maxPages:
                                                                                    Number(
                                                                                        event
                                                                                            .target
                                                                                            .value
                                                                                    ),
                                                                            },
                                                                    })
                                                                }
                                                                className={
                                                                    inputClass
                                                                }
                                                            />
                                                        </label>
                                                    </div>
                                                )}
                                            </details>
                                        )}
                                </div>
                                <div className="sticky top-4 min-w-0 space-y-3">
                                    {config.mode === 'json' ? (
                                        <>
                                            <p className="text-sm text-neutral-400">
                                                {config.embeddedJson
                                                    ? 'JSON embedded in the page'
                                                    : 'Captured API response'}
                                            </p>
                                            <pre className="max-h-[650px] overflow-auto rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-xs text-neutral-300">
                                                {JSON.stringify(
                                                    discovery.candidates.find(
                                                        (item) =>
                                                            sourceKey(item) ===
                                                            sourceKey(config)
                                                    )?.sample ?? {},
                                                    null,
                                                    2
                                                )}
                                            </pre>
                                        </>
                                    ) : (
                                        <>
                                            <p className="text-sm text-neutral-300">
                                                Selecting:{' '}
                                                <strong className="text-red-300">
                                                    {selected}
                                                </strong>
                                            </p>
                                            <p className="text-xs text-neutral-500">
                                                Interactive, sanitized page
                                                preview. Scripts and external
                                                resources are removed.
                                            </p>
                                            <iframe
                                                ref={frame}
                                                title="Cinema page field selector"
                                                sandbox="allow-scripts"
                                                srcDoc={srcDoc}
                                                onLoad={sendScope}
                                                className="h-[650px] w-full rounded-lg border border-neutral-700 bg-white"
                                            />
                                            <p className="text-xs text-neutral-400">
                                                {selectionText ||
                                                    'Click an element to map its field.'}
                                            </p>
                                        </>
                                    )}
                                </div>
                            </div>
                            <div className="mt-6 border-t border-neutral-800 pt-5">
                                <button
                                    type="button"
                                    className={`${buttonClass} mr-3 mb-3`}
                                    disabled={!!busy || !status}
                                    onClick={previewMapping}
                                >
                                    Preview mapped screenings
                                </button>
                                <button
                                    onClick={validate}
                                    disabled={!!busy || !status}
                                    className={buttonClass}
                                >
                                    {status?.edge
                                        ? 'Generate & check live mapping'
                                        : 'Generate & validate scraper'}
                                </button>
                                <p className="mt-2 text-xs text-neutral-500">
                                    {status?.edge
                                        ? 'Checks live extraction, upcoming dates, catalogue duplicates and repository filenames. Typechecking, tests, lint and build run after draft PR creation. Cinema data is not written.'
                                        : 'Checks the public catalogue, live extraction, upcoming dates, typechecking, all tests and generated-file lint. No database writes.'}
                                </p>
                                <p className="mt-2 text-xs text-neutral-500">
                                    {status?.edge
                                        ? 'Hosted preview fetches the source again. '
                                        : 'Preview uses the captured page when available. '}
                                    It checks the mapping without catalogue
                                    access or repository checks. It covers one
                                    response; full validation also checks API
                                    pagination.
                                </p>
                                {previewError && (
                                    <p
                                        role="alert"
                                        className="mt-3 whitespace-pre-wrap text-sm text-red-300"
                                    >
                                        {previewError}
                                    </p>
                                )}
                                {preview && (
                                    <div
                                        className="mt-4 text-sm"
                                        aria-live="polite"
                                    >
                                        <p>
                                            {preview.films} films ·{' '}
                                            {preview.screenings} screenings.
                                            Showing up to 10 films; times below
                                            use {config.timezone}.
                                        </p>
                                        {!preview.screenings && (
                                            <p>
                                                No screenings matched. Check the
                                                collection and screening
                                                selectors.
                                            </p>
                                        )}
                                        <ul className="mt-3 divide-y divide-neutral-800">
                                            {preview.preview.map(
                                                (film, index) => (
                                                    <li
                                                        className="py-2"
                                                        key={index}
                                                    >
                                                        <strong>
                                                            {film.title}
                                                        </strong>
                                                        <div className="mt-1 text-neutral-400">
                                                            {film.times
                                                                .map((time) =>
                                                                    new Intl.DateTimeFormat(
                                                                        config.dateLocale ||
                                                                            config
                                                                                .cinema
                                                                                .defaultLanguage,
                                                                        {
                                                                            timeZone:
                                                                                config.timezone,
                                                                            dateStyle:
                                                                                'medium',
                                                                            timeStyle:
                                                                                'short',
                                                                        }
                                                                    ).format(
                                                                        new Date(
                                                                            time
                                                                        )
                                                                    )
                                                                )
                                                                .join(' · ')}
                                                        </div>
                                                    </li>
                                                )
                                            )}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        </section>
                    </fieldset>
                )}
                {busy && (
                    <p
                        role="status"
                        className="rounded-lg border border-neutral-700 bg-neutral-900 p-4 text-sm text-neutral-300"
                    >
                        {busy}
                    </p>
                )}
                {validation && (
                    <section className={panelClass}>
                        {validation.repositoryChecks === 'pending' && (
                            <p
                                role="note"
                                className="builder-beta-note mb-4 text-sm"
                            >
                                Repository checks are pending. Downloads are
                                available; a successful live check allows a
                                draft PR. Wait for GitHub Actions and review the
                                results before marking it ready.
                            </p>
                        )}
                        <h3 className="mb-4 font-semibold">
                            3. Test results & review
                        </h3>
                        <ul className="space-y-3">
                            {validation.checks.map((check, index) => (
                                <li
                                    key={index}
                                    className="rounded-lg bg-neutral-950 p-3"
                                >
                                    <p
                                        className={`text-sm font-medium ${check.ok ? 'text-emerald-400' : 'text-red-400'}`}
                                    >
                                        {check.ok ? (
                                            <Check className="mr-2 inline h-4 w-4" />
                                        ) : (
                                            '× '
                                        )}
                                        {check.name}
                                    </p>
                                    <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap text-xs text-neutral-400">
                                        {check.detail}
                                    </pre>
                                </li>
                            ))}
                        </ul>
                        {validation.preview.length > 0 && (
                            <div className="mt-5 grid gap-3 sm:grid-cols-2">
                                {validation.preview.map((film, i) => (
                                    <div
                                        key={i}
                                        className="rounded-lg border border-neutral-800 p-4"
                                    >
                                        <p className="font-medium">
                                            {film.title}
                                        </p>
                                        <ul className="mt-2 space-y-1 text-xs text-neutral-400">
                                            {film.times
                                                .slice(0, 8)
                                                .map((time) => (
                                                    <li key={time}>
                                                        {new Date(
                                                            time
                                                        ).toLocaleString(
                                                            'en-GB',
                                                            {
                                                                timeZone:
                                                                    config.timezone,
                                                            }
                                                        )}{' '}
                                                        · {config.timezone}
                                                    </li>
                                                ))}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                        )}
                        {validation.files && (
                            <div className="mt-5">
                                <div className="mb-2 flex flex-wrap items-center gap-3">
                                    {(['scraper', 'test'] as const).map(
                                        (kind) => (
                                            <button
                                                key={kind}
                                                className={`text-sm ${kind === codeTab ? 'text-white underline underline-offset-4' : 'text-neutral-500'}`}
                                                onClick={() => setCodeTab(kind)}
                                            >
                                                {kind === 'scraper'
                                                    ? validation.files!
                                                          .scraperPath
                                                    : validation.files!
                                                          .testPath}
                                            </button>
                                        )
                                    )}
                                    <button
                                        onClick={() => download(codeTab)}
                                        className="ml-auto text-sm text-neutral-300 underline"
                                    >
                                        Download file
                                    </button>
                                </div>
                                <pre className="max-h-96 overflow-auto rounded-lg bg-neutral-950 p-4 text-xs text-neutral-300">
                                    {validation.files[codeTab]}
                                </pre>
                            </div>
                        )}
                        {validation.ok && (
                            <div className="mt-6 space-y-4 border-t border-neutral-800 pt-5">
                                <label className="flex items-start gap-3 text-sm text-neutral-300">
                                    <input
                                        type="checkbox"
                                        checked={reviewed}
                                        onChange={(event) =>
                                            setReviewed(event.target.checked)
                                        }
                                        className="mt-1 accent-red-600"
                                    />
                                    I checked the extracted film titles, local
                                    showtimes and generated mappings.
                                </label>
                                <p className="text-sm text-neutral-400">
                                    Submission creates a separate cinema branch
                                    and a pull request into{' '}
                                    <strong>
                                        {status?.repository}:{status?.base}
                                    </strong>
                                    . The scraper is reviewed before merging.
                                </p>
                                <button
                                    className={buttonClass}
                                    disabled={
                                        !reviewed ||
                                        !status?.login ||
                                        !!busy ||
                                        !!pr
                                    }
                                    onClick={submit}
                                >
                                    <Github className="h-4 w-4" />
                                    {status?.edge
                                        ? 'Create draft scraper pull request'
                                        : 'Create scraper pull request'}
                                </button>
                                {!status?.githubConfigured && (
                                    <p className="text-sm text-neutral-500">
                                        GitHub sign-in requires an OAuth app
                                        configured on the local service. You can
                                        download the validated files meanwhile;
                                        see scripts/builder/README.md.
                                    </p>
                                )}
                                {pr && (
                                    <a
                                        href={pr.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 text-sm text-emerald-400"
                                    >
                                        Open pull request{' '}
                                        <ExternalLink className="h-4 w-4" />
                                    </a>
                                )}
                            </div>
                        )}
                    </section>
                )}
            </main>
        </div>
    );
}
