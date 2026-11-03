# CinemaCalendar

Cinema listings for Padova and London, built with React, TypeScript, Vite and Supabase.

## Run locally

Use Node.js 22 or newer. Keep your existing `.env`, or copy `.env.example` and fill it in.

```sh
npm ci
npm run dev
```

The app is served under `/CinemaCalendar/` (also used for GitHub Pages).

Production is published from `main` at https://luigirinaldi.github.io/CinemaCalendar/.
The `dev` branch is published at https://luigirinaldi.github.io/CinemaCalendar/dev/.
Pushing either branch rebuilds both versions into one Pages deployment. Dev pushes
trigger the deployment workflow on `main`, as required by the existing Pages
environment branch policy. Keep the Pages workflow (`.github/workflows/static.yml`)
and dev trigger (`.github/workflows/dev-preview.yml`) in sync on both branches.

## Checks

```sh
npm run typecheck
npm test
npm run lint
npm run build
```

`typecheck` includes scraper scripts, which the original frontend build did not check. Unit tests run offline. Read-only checks against cinema websites:

```sh
npm run test_scraper
npm run test_scraper -- riverside ica
```

These checks never connect to or write to the database. A failed import, HTTP request, parse or schema validation produces a nonzero exit status. A genuine empty programme is reported as `EMPTY`; set `SCRAPER_REQUIRE_SHOWINGS=1` to also fail when there are no upcoming screenings.

## Code map

- `src/App.tsx`: page composition and filter state.
- `src/components/CalendarFilters.tsx`: date/group controls.
- `src/components/ScreeningResults.tsx`: movie/cinema cards and booking links.
- `src/hooks/useCinemaData.ts`: loading, errors, retry and cancellation of obsolete requests.
- `src/api.ts`: Supabase selections and inferred response types.
- `src/lib/`: date boundaries, grouping and pagination.
- `scripts/cinemas/`: cinema-specific parsers.
- `scripts/http.ts`: timeouts, transient retries and bounded concurrency.
- `scripts/dates.ts`: source timezone interpretation.
- `scripts/database.ts`: transactional storage.

## Supabase data shape and request cost

The frontend requests screenings with embedded `film` and `cinema` objects through the existing foreign keys. `QueryData` infers types from the selection. No SQL migration, RPC or new database function is required.

There is one cinema-list request on initial load and one screening request per filter change for results fitting in one page. Extra pages are fetched only when needed. Switching between movie and cinema grouping makes no API call. The full film catalogue is no longer downloaded separately. Exact counts prevent unnecessary trailing requests and pagination also handles a server row cap smaller than the requested page size.

This reduces client-side lookups and initial requests; it is not a measured latency guarantee. Embedded film/cinema metadata is repeated per screening, so payload size can increase for very large ranges. The city dropdown uses the small cinema list; display grouping remains a local, memoized operation. React StrictMode can start and cancel an additional request during development.

Dates use the selected city's timezone. Today starts now; another selected day starts at midnight. The final selected day includes late screenings until 04:00 the following morning (exclusive). Custom date inputs use `YYYY-MM-DD`. Anytime preserves the original unbounded-date behavior, including historical rows. Add a city timezone to `cityZone` when expanding beyond Padova/London.

## Updating stored data

```sh
npm run get_data
```

**This command writes to Supabase and updates TMDB metadata.** It needs server credentials from `.env`. For one scraper, set `SCRAPER` to its filename and run `npx tsx scripts/scrapeUpload.ts`.

Each cinema is stored in a transaction. An advisory transaction lock serializes overlapping runs for the same cinema. Incoming films are deduplicated by title and URL; showings are deduplicated by film ID and timestamp. Existing duplicates, incorrect historical times and cancelled screenings are not automatically removed. Screen/room identity is not persisted by the current schema, so simultaneous screenings of the same film remain indistinguishable in storage.

See `CLEANUP_NOTES.md` for changes and verification limits.
