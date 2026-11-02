# Cleanup and verification — 30–31 October 2026

## Delivered changes

- Split the original 696-line App into an 81-line page, components, a fetching hook and focused utilities. Retained the existing visual style and both grouping modes.
- Replaced separate full-film downloads and repeated array lookups with Supabase nested relation selections. Types are inferred directly from queries. Added pagination, server-side city/date filtering, request cancellation, loading/error/retry states and empty-data handling.
- Corrected weekday-based grouping (which merged dates a week apart), mutating sorts, missing React keys, invalid date input values, incomplete custom end dates, timezone handling and overly permissive film matching. Conflicting TMDB IDs never merge. Films without enough identifying metadata are conservatively kept separate.
- Added shared HTTP status checks, timeouts, transient retries and bounded request concurrency. Scraper validation failures now fail the command/CI instead of looking like successful empty results. Enabled standalone scraper typechecking and regression tests in build CI.
- Rebuilt unfinished Fronte del Porto code around actual WordPress ACF fields, including pagination and all published programme slots. Removed copied Rex assumptions. Slots without published times are logged and skipped.
- Lux: pagination, optional metadata/image handling, entity decoding, safer grouping and timezone conversion.
- Riverside: discovers the current stream endpoint from the site's listing page; reads current duration fields and booking links.
- Prince Charles: corrected month/year rollover, noon/midnight handling, HTTP retrieval and guaranteed browser cleanup.
- ICA/Close-UP: explicit London time, bounded detail requests, retention of listing data when metadata is unavailable. ICA handles untimed programme entries without aborting the whole scraper.
- Institut français: missing metadata and empty multi-date tables no longer cause the previous parsing failure; bounded detail requests.
- The Space: explicit token failure, Italian default language, timezone conversion and absolute/relative booking URL handling.
- Regent Street: GraphQL error detection, consistent string keys, and no invented “now” timestamp when a showing lacks a time.
- Database writer: consistent title+URL film identity, deduplication within incoming batches, same-cinema transaction locking and encoded password in the connection URL. No production database writes or schema changes were executed.
- Converted generated database types from UTF-16 to UTF-8, declared the directly used Kysely dependency, removed stale types/dead code, formatted source and added setup/documentation.

## Verification

- TypeScript: frontend and all scraper scripts pass.
- Offline regression tests: 17 pass.
- ESLint: passes without warnings.
- Vite production build: passes.
- Live read-only scrapers: all eleven returned schema-valid programmes after fixes. Counts below are observations from the checks, not a guarantee of completeness or future uptime.

| Cinema            | Films | Showings | Upcoming at check |
| ----------------- | ----: | -------: | ----------------: |
| Close-UP          |     4 |        4 |                 4 |
| Fronte del Porto  |   188 |      231 |                35 |
| ICA               |    65 |      125 |               123 |
| Institut français |    75 |      267 |               262 |
| Lux               |    18 |       18 |                15 |
| Porto Astra       |    18 |      137 |               137 |
| Prince Charles    |   298 |      685 |               685 |
| Regent Street     |    24 |       29 |                27 |
| Rex               |    45 |       48 |                48 |
| Riverside         |    38 |      172 |               172 |
| The Space         |    53 |      724 |               723 |

Checks span 30–31 October; websites and counts can change. ICA retains basic listing information when optional detail metadata is missing. Fronte del Porto includes historical posts; two future programme slots lacked published times and were explicitly skipped. Some Riverside/Institut entries have no duration metadata.

## Limits and rollout

A read-only check against the supplied Supabase endpoint failed with an upstream connection error. The real Supabase query builder was exercised with mocked HTTP responses, including joins, filters, pagination and errors, but live RLS/permissions and database writes remain unverified. No migration is needed assuming the foreign keys in `database.types.ts` match the deployed schema.

A full browser UI check could not run: Chromium was unavailable and its download failed. The app compiles and builds; browser interactions/visual layout have not been independently verified in this environment.

Previously stored duplicate rows, wrong timestamps, cancellations and changed booking links are not repaired by this source refactor. Storage remains insert-only for films/showings, and the schema does not distinguish simultaneous showings in different rooms. Review any historical cleanup separately rather than deleting records based on a potentially partial scrape.

Extract the source archive into your existing checkout, preserving your `.env` and `.git`. Run `npm ci`, the checks in README, and `npm run dev`. The archive excludes `.env`, `.git`, `node_modules` and generated build output; it includes `.env.example`. Existing local source changes present in the uploaded ZIP were used as the starting point.
