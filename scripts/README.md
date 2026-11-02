# Scrapers

- `validateScraper.ts`: read-only live checks, optional filename filters, schema validation and summary counts. Does not store results.
- `scrapeAll.ts`: loads each `*Cinema.ts` scraper, limits parallel execution, validates results, stores each cinema transactionally and updates TMDB metadata. Closes the DB pool even when a scraper fails; reports failures with a nonzero exit status.
- `scrapeUpload.ts`: stores one scraper selected by `SCRAPER`.
- `http.ts`: checked HTTP requests with a timeout and limited retries for transient failures; bounded detail-page concurrency.
- `dates.ts`: date parsing in the cinema's timezone.
- `types.ts`: shared runtime validation and inferred types.

A scraper exports `scraper(): Promise<CinemaShowings>`. It must report failures by throwing, not by returning an empty array. A cinema with no scheduled films can return `{ cinema, showings: [] }`. Unknown optional metadata should remain undefined. Never substitute the current time for an unknown screening time.

Run `npm run typecheck` and `npm test` before live checks. `npm run test_scraper -- lux` checks matching scraper names without modifying Supabase. Live output can contain warnings for entries without published times or optional metadata; the summary separately counts all and upcoming screenings.

`npm run get_data` and `npm run get_tmdb_id` save complete console logs to timestamped files in `.scraper-debug/` (ignored by Git). TMDB enrichment also saves a timestamped JSON report listing unmatched films separately from failed requests. An unmatched event or double bill may have no single TMDB entry. HTTP/API and database failures produce a nonzero exit status; successful matches are still saved when other lookups fail. To retry metadata without scraping cinemas, run `npm run get_tmdb_id`.

TMDB responses are validated and limited to supported database columns. Lookups use four workers, request pacing, bounded retries for transient failures (including 429), correctly encoded query parameters and screening-title cleanup. Duplicate lookups share results within a run. Close-UP can currently refuse its calendar endpoint with HTTP 403; this is reported as a failed scraper and existing stored screenings are retained.

Fronte del Porto uses paginated WordPress ACF programme fields; publication dates are not showtimes. Lux uses paginated Tribe Events results. Riverside discovers its current stream endpoint from the listing page rather than keeping the old endpoint hardcoded. Institute/ICA/Close-UP detail requests are bounded to four at a time.
