# Scrapers

Bruxelles's ten venues, public API findings, HTML fallbacks, map coordinates and current source limitations are documented in [bruxelles-sources.md](bruxelles-sources.md). Run `npm run test_scraper -- Bruxelles` for read-only live checks.

- `validateScraper.ts`: read-only live checks, optional filename filters, schema validation and summary counts. Does not store results.
- `scrapeAll.ts`: loads each `*Cinema.ts` scraper, limits parallel execution, validates results, stores each cinema transactionally and updates TMDB metadata. Closes the DB pool even when a scraper fails; reports failures with a nonzero exit status.
- `scrapeUpload.ts`: stores one scraper selected by `SCRAPER`.
- `http.ts`: checked HTTP requests with a timeout and limited retries for transient failures; bounded detail-page concurrency.
- `dates.ts`: date parsing in the cinema's timezone.
- `types.ts`: shared runtime validation and inferred types.

A scraper exports `scraper(): Promise<CinemaShowings>`. It must report failures by throwing, not by returning an empty array. A cinema with no scheduled films can return `{ cinema, showings: [] }`. Unknown optional metadata should remain undefined. Never substitute the current time for an unknown screening time.

Run `npm run typecheck` and `npm test` before live checks. `npm run test_scraper -- lux` checks matching scraper names without modifying Supabase. Live output can contain warnings for entries without published times or optional metadata; the summary separately counts all and upcoming screenings.

`npm run get_data` and `npm run get_tmdb_id` save complete console logs to timestamped files in `.scraper-debug/` (ignored by Git). TMDB enrichment also saves a timestamped JSON report listing unmatched films separately from failed requests. An unmatched event or double bill may have no single TMDB entry. HTTP/API and database failures produce a nonzero exit status; successful matches are still saved when other lookups fail. To retry metadata without scraping cinemas, run `npm run get_tmdb_id`.

TMDB responses are validated and limited to supported database columns. Lookups use four workers, request pacing, bounded retries for transient failures (including 429), correctly encoded query parameters and screening-title cleanup. Duplicate lookups share results within a run.

Close-UP and BFI can serve access-check pages, including HTTP 403 responses. Browser navigation uses `domcontentloaded` followed by an explicit wait for calendar data or film links; it does not wait for analytics requests to become idle. Challenge detection checks the document title and challenge form, rather than the presence of Cloudflare JavaScript (which can also appear on normal HTTP 200 film pages). Close-UP retains its successful calendar browser context for detail pages refused over HTTP. BFI loads detail pages sequentially with the installed browser's real user agent, accepts global lexical programme data and safely reads supported inline JSON assignments when the data is not exposed on `window`. A completed BFI film page with its verified no-search context and empty booking widget means no published sessions; this response omits the search arrays entirely, and must not stop the run. Unknown or changed response shapes still fail. Optional metadata is parsed from loaded HTML without per-field browser waits. Required missing/changed data and actual access refusals both fail the scrape and retain stored screenings, but are reported separately. BFI saves failed-page HTML and a JSON diagnostic report under `.scraper-debug/bfi/`; the console prints the exact path. A successful live run still depends on the venue allowing the browser session. `npm run test_scraper -- closeUp bfi` checks both without database writes.

Fronte del Porto uses paginated WordPress ACF programme fields; publication dates are not showtimes. Lux uses paginated Tribe Events results. Riverside discovers its current stream endpoint from the listing page rather than keeping the old endpoint hardcoded. Institute/ICA/Close-UP detail requests are bounded to four at a time.

## Standard scraper structure

New scrapers can use `createProgrammeScraper` from `programmeScraper.ts`. Keep venue metadata and the exported `scraper` in `cinemas/`; keep reusable chain/platform loaders and pure parsers in `providers/`. Files in `cinemas/` are automatically discovered by local runners and the CI matrix, so helpers and templates belong outside that directory.

```ts
export const scraper = createProgrammeScraper({
    cinema: CINEMA,
    load: () => loadProgramme(CINEMA.website),
    parse: (source) => parseProgramme(source),
});
```

First inspect the official site's public feeds and network requests, including WordPress REST/plugin routes when applicable. Prefer a venue's structured listings feed over HTML selectors. Use `fetchPage` for timeouts, checked statuses and transient retries; use `mapConcurrent` for bounded detail requests. Validate source structure with Zod before parsing. Follow actual pagination or published schedule bounds, and fail if a required response/field disappears. Only a valid, explicitly empty programme should return no films. Pure parsers should accept captured or minimal representative data so tests run offline. An HTML adapter can use the same contract when no suitable feed exists.

The factory validates the final `CinemaShowings`, merges entries by title and stable film URL (the database identity), removes duplicate performances and sorts showtimes without changing parser inputs. Preserve explicit offsets; convert unzoned times using the venue's IANA timezone. Keep session-specific URLs on showings, and do not guess unknown metadata or showtimes.

## Cambridge, UK

Checked on 4 November 2026. All three venues expose public structured feeds used by their own websites; none requires a WordPress adapter, API key or browser at runtime.

| Scraper                              | Official source and approach                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `artsPicturehouseCambridgeCinema.ts` | [Arts Picturehouse](https://www.picturehouses.com/cinema/Arts-Picturehouse-Cambridge): read-only POST to `/api/get-movies-ajax`, `cinema_id=002`, `start_date=show_all_dates`. Responses can contain grouped films/sessions from other venues: filter each session by `CinemaId`, not the film's top-level venue.                                                                                                                                          |
| `lightCambridgeCinema.ts`            | [The Light](https://cambridge.thelight.co.uk/cinema): discover the miniguide script URL from the page and parse its `__gfminiguidedata` JSON assignment without executing JavaScript. Combine full date keys and session times in Europe/London. Native sessions use the film page's booking panel, so their booking link points to that page.                                                                                                             |
| `everymanCambridgeCinema.ts`         | [Everyman](https://www.everymancinema.com/venues-list/g02am-everyman-cambridge/): `/api/gatsby-source-boxofficeapi/` feeds, theater `G02AM`. Discover all on-sale dates from `scheduledMovies`, fetch that schedule range, and join `movies` metadata in batches of 50 with two workers. Runtime is in seconds. The API has no canonical CMS film permalink, so film links use the stable venue listings page; showing links use the supplied ticket URLs. |

These are public website feeds rather than versioned API contracts. Schema failures propagate instead of reporting an empty programme. Keep representative parser tests and rerun read-only live checks when their formats change. Do not scrape a third-party showtimes aggregator as the source of record.

Run `npm run test_scraper -- Cambridge` to check all three without updating Supabase. The initial successful live check returned 75 films/259 screenings at Picturehouse, 43/313 at The Light and 58/276 at Everyman (271 upcoming); counts change as programmes are updated.
