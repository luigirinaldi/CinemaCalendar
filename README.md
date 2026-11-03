# CinemaCalendar

Cinema listings for Padova and London, built with React, TypeScript, Vite and Supabase.

## Run locally

Use Node.js 22 or newer. Keep your existing `.env`, or copy `.env.example` and fill it in.

```sh
npm ci
npm run dev
```

The app is served under `/CinemaCalendar/` (also used for GitHub Pages).

## Location and sharing

Open the location button to search the available cities, choose a point on the map,
or use the browser's location permission. Nearby search supports a radius of 1–100 km
and includes tracked cinemas across city boundaries. The main map also supports
clicking to move the search centre and changing the radius. Cities are derived from
the cinema catalogue; adding a city does not require changing the picker.

Location and display preferences are remembered in local storage on this browser.
Shared links contain only the city (`?city=london`) or an approximate point and radius
(`?near=51.507,-0.128,25`), plus any relevant date selection. Grouping, compact/full
mode and table sorting stay out of new links. Explicit shared locations override
saved locations; older links are still accepted. Storage being disabled does not
prevent searching or sharing. Coordinates in links are rounded to three decimals.

Nearby search requires valid cinema coordinates. Unmapped cinemas remain available
through city search. Adding cities in other time zones also requires extending the
existing `cityZone` mapping in `src/lib/dates.ts`; this change does not add database
timezone metadata or change the current London/Rome date rules.

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
- `src/components/CalendarFilters.tsx`: date and view controls.
- `src/components/ScreeningResults.tsx`: movie and cinema cards.
- `src/components/CatalogViews.tsx`: adapts the embedded screening data for the table and map views from `main`.
- `src/api.ts`: paginated, typed Supabase queries with embedded film/cinema/TMDB data.
- `src/hooks/useCinemaData.ts`: loading, cancellation, error and retry handling.
- `src/hooks/useScreeningFilters.ts`: local Letterboxd and year filtering.
- `src/catalogPresentation.ts`: poster URLs and view types.
- `src/letterboxdApi.ts`: Letterboxd watchlist requests.
- `src/lib/`: timezone-aware date bounds, conservative grouping, pagination and URL state.
- `scripts/cinemas/`: cinema-specific parsers.
- `scripts/http.ts`: timeouts, transient retries and bounded concurrency.
- `scripts/dates.ts`: source timezone interpretation.
- `scripts/database.ts`: transactional storage.

## Supabase data shape and request cost

The application requests screenings with embedded `film`, `cinema` and TMDB metadata through the existing foreign keys. `QueryData` infers types from the selection. No SQL migration, RPC or new database function is required. The data hook, date helpers and grouping rules from `dev` drive all four views; poster, table, map, year and Letterboxd features from `main` use that same dataset.

There is one cinema-list request on initial load and one screening request per filter change for results fitting in one page. Extra pages are fetched only when needed. Switching between movie and cinema grouping makes no API call. The full film catalogue is no longer downloaded separately. Exact counts prevent unnecessary trailing requests and pagination also handles a server row cap smaller than the requested page size.

This reduces client-side lookups and initial requests; it is not a measured latency guarantee. Embedded film/cinema metadata is repeated per screening, so payload size can increase for very large ranges. The city dropdown uses the small cinema list; display grouping remains a local, memoized operation. React StrictMode can start and cancel an additional request during development.

Dates use the selected city's timezone. Today starts now; another selected day starts at midnight. The final selected day includes late screenings until 04:00 the following morning (exclusive). Custom date inputs use `YYYY-MM-DD`. Anytime preserves the unbounded-date behavior, including historical rows. Add a city timezone to `cityZone` when expanding beyond Padova/London. Legacy `main` URLs using `dateRange=range` open the custom-range controls.

## Updating stored data

```sh
npm run get_data
```

**This command writes to Supabase and updates TMDB metadata.** It needs server credentials from `.env`. For one scraper, set `SCRAPER` to its filename and run `npx tsx scripts/scrapeUpload.ts`.

Each cinema is stored in a transaction. An advisory transaction lock serializes overlapping runs for the same cinema. Incoming films are deduplicated by title and URL; showings are deduplicated by film ID and timestamp. Storage preserves `dev`'s insert-only behavior: existing showings are not deleted based on a potentially incomplete programme. Historical duplicates, rescheduled/cancelled showings and wrong stored times require separate review. Screen/room identity is not persisted by the current schema, so simultaneous screenings of the same film remain indistinguishable in storage. `npm run get_data -- --dry-run` compares programmes without writing data or updating metadata.

See `CLEANUP_NOTES.md` for changes and verification limits.
