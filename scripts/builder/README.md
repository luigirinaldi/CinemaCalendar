# Cinema scraper builder (beta)

An unlinked onboarding page at `/CinemaCalendar/#/add-cinema` (or
`/CinemaCalendar/dev/#/add-cinema` in a dev Pages build). The regular cinema page
does not link to it. GitHub Pages hosts the interface. Production builds use the
Supabase `scraper-builder` Edge Function; development defaults to the Node
companion service. See [hosting instructions](HOSTING.md) for deployment, isolated
state tables, OAuth configuration and the split between live mapping checks and
GitHub Actions. The local workflow below retains browser inspection and full
repository checks before submission.

## Local setup

Use Node 22 or newer and the repository's installed dependencies. In separate
terminals, run:

```sh
npm run dev
npm run scraper_builder
```

The companion service watches its source files and reloads after changes. If an
older non-watching service is already running, stop it with Ctrl+C and run the
command again. Refresh the studio after a service restart to renew its session.
Temporary validation checkouts are excluded from the watcher.

Open `http://localhost:5173/CinemaCalendar/#/add-cinema`. The Vite server proxies
`/builder-api` to the companion service at `127.0.0.1:8788`. Match any custom frontend
origin/port in `BUILDER_PAGE_URL`. Both localhost and 127.0.0.1 are accepted locally.
If using GitHub login, open the exact hostname configured in the OAuth callback.

Basic inspection and generated API/static HTML scrapers use HTTP and HTML parsing;
they do not launch a browser. For pages whose programme is populated by JavaScript,
enable **Inspect JavaScript requests** and inspect again. This optional mode needs
a browser. If Playwright's bundled browser is missing, the launcher automatically
tries installed Chrome, then Edge. To install the bundled browser instead:

```sh
npx playwright install chromium
```

Set `BUILDER_BROWSER_CHANNEL=chrome` (or `msedge`) in your ignored `.env` to choose
an installed browser explicitly; restart the companion service after changing it.
The public Supabase URL and publishable key already
used by the site are needed for the duplicate check. Database passwords and service
role keys are not used by the builder.

## Workflow

1. Paste the cinema's **programme** URL, rather than a general homepage where
   possible. Fast discovery reads HTML, advertised JSON links and literal inline
   `fetch`/`axios.get` URLs (at most five endpoints), plus JSON embedded in script
   tags (JSON-LD, `__NEXT_DATA__` and other literal JSON data). You may also paste a direct API
   URL. It does not execute JavaScript or inspect external bundles. Optional browser
   inspection observes live GET requests instead. Both offer public JSON responses,
   ranked by film-related fields. Discovery does not bypass login or
   CAPTCHA and does not call private/POST APIs.
   Both modes also check the domain's `/wp-json/` index (reusing an advertised
   index when available), list its REST namespaces in the inspection notes and
   probe at most five advertised GET collection routes related to films, events,
   screenings or programmes. Literal routes only are followed; routes requiring
   IDs or mandatory arguments are skipped, and 401/403 responses stay unavailable.
   Namespaces indicate registered API extensions, not a complete plugin inventory.
   Index metadata itself is not offered as a film-programme candidate.
   Programme JSON responses may be up to 16 MB, including embedded posters. The
   page receives only a small sample (three entries per array, shortened long
   strings); live validation fetches the full programme. Failed API hints appear
   in the inspection notes. HTML previews remain limited to 2 MB; an oversized
   rendered page omits its preview while keeping APIs already discovered.
2. Fill in the cinema name, city, public website, coordinates, language and IANA
   timezone. Use **Search location** with the cinema name plus city, or a public
   street address. Choose a result to fill latitude and longitude (and city when
   empty), and use **Check on map** to verify the venue. Coordinates stay editable;
   a result is never selected automatically. Searches are sent through the companion
   service to [Photon](https://github.com/komoot/photon), using OpenStreetMap data;
   no browser or API key is needed. Requests are explicit (no typeahead), cached for
   24 hours in service memory and limited to one per second. The public demo is for
   moderate use and has no availability guarantee; configure a public Photon-compatible
   `BUILDER_GEOCODER_URL` before higher-volume hosting. No database writes occur.
   Keep the existing calendar's city timezone mapping in
   `src/lib/dates.ts` consistent when adding a city in a new timezone.
3. For an API, select the film array and map paths relative to a film and then to a
   screening. `$` selects the response itself. Configure pagination explicitly;
   WordPress's `x-wp-totalpages` header is recognized. Reaching the page bound fails
   rather than accepting a partial programme.
4. If no usable API exists, choose **Select on page**. Click the repeated film
   container, screening rows, title, datetime and links. Alt-click selects the parent
   container when a row has no empty space to click. Selectors remain editable.
   `$self` reads the selected row itself. The preview is a sanitized snapshot with
   scripts, external resources and navigation disabled, so it may not visually
   match the original site. Dates require an explicit year by default. Leave the format empty for
   ISO timestamps or supply a Luxon format, `unix-ms` or `unix-seconds`. HTML found
   through fast inspection generates an HTTP scraper. HTML selected after browser
   inspection enables **Render JavaScript when scraping**; this setting is saved
   in the generated scraper and used consistently by live validation.
   Each field has **Where to read & text cleanup** controls: read from a film,
   screening, whole document, or containing HTML section. For a date heading above
   several film cards, choose **Containing HTML section**, enter its selector
   (e.g. `.programme-day`), and map the heading relative to that section.
   Cleanup collapses whitespace, keeps text before/after literal delimiters, and
   applies ordered literal replacements. Missing delimiters fail explicitly.
   For example, keep the text after `Ore ` and replace `.` with `:` for `Ore 20.30`.
   The **Dates & times** sandbox offers editable examples and immediate parsing:
   `5 Novembre 2026` plus `20:30` uses `d MMMM yyyy HH:mm`, date language `it-IT`.
   Date language is separate from film language. Time must be explicit. The
   optional **Italian without year** example enables weekday-based year inference
   within 183 days; it rejects missing weekdays, stale API metadata and ambiguous
   results. The default policy still requires an explicit year.
   **Preview mapped screenings** checks a single response without catalogue access,
   TypeScript checks or test runs, so it works before cinema metadata is filled in.
   It reuses the inspected HTML for up to 15 minutes when URL/rendering mode match;
   otherwise it fetches the source. It reports errors or film/screening totals and
   up to ten films with local times. Full validation checks pagination too.
   Under **JSON data**, embedded sources have a script selector. The generated
   scraper fetches the page and reads that JSON again on every run; it does not
   freeze the discovery sample. Static JavaScript assignments such as
   `window.data = {...}`, `window['data'] = [...]`, or `const programme = [...]`
   are also detected. Select the assignment by name (e.g. `window.data`) or leave
   the assignment field blank for a JSON-only script. The parser accepts literal
   objects/arrays, single-quoted strings, unquoted keys, trailing commas and
   `JSON.parse` of a literal string. It never runs page code. Computed expressions,
   function calls, spreads, and assignments modified later in the same script are
   rejected rather than returning a partial initial value. Only top-level data
   assignments are candidates; data assembled inside functions requires a custom
   scraper. For scripts without an ID, review
   the structural selector carefully because layout changes can invalidate it.
5. **Generate & validate** checks the live output and upcoming screenings, searches
   the read-only public cinema catalogue and existing scraper files for duplicates,
   and generates a standard scraper plus a captured fixture test. In a temporary
   ignored checkout it runs both TypeScript checks, **all** unit tests including the
   new fixture, and lint on the generated files. It never imports arbitrary supplied
   source code or executes database ingestion. Downloadable files and check failures
   are shown on the page.
6. Review the extracted titles, local showtimes and generated mappings. When GitHub
   is configured and checks passed, open a pull request. Each cinema gets its own
   `cinema/<filename>-<random>` branch based on `dev`. A shared `new-cinemas` branch
   would mix independent submissions, so it is not used. The builder never merges
   automatically or pushes to the base branch.

The generic parser supports JSON film/screening arrays, static or rendered HTML
programmes, and public JSON film collections with linked HTML screening pages.
**Follow film detail pages for screening times** combines API metadata with HTML
selectors. Line splitting handles several sessions in one paragraph; the date
workbench also offers guarded weekday-based year inference. See the
[Piccolo walkthrough](PICCOLO-WALKTHROUGH.md) for a complete example.
Sites requiring authenticated APIs, POST/GraphQL bodies, several nested
collections, calendar navigation or date rules outside the workbench still
need a custom scraper. A successful fixture proves reproducibility, not that a human
selected the correct semantic field: the output review remains necessary.
The helper is marked beta. There is no model service, API key, or paid agent in
this workflow. An agent could later assist with custom source generation, while
retaining the same checks and human review.

## GitHub login and pull requests

Local discovery, generation, validation and downloads work without GitHub login.
To enable publishing, register a GitHub OAuth app under your GitHub developer
settings. For the default local configuration use:

- Homepage: `http://localhost:5173/CinemaCalendar/`
- Authorization callback: `http://localhost:5173/builder-api/auth/callback`

Add `BUILDER_GITHUB_CLIENT_ID` and `BUILDER_GITHUB_CLIENT_SECRET` to your ignored
`.env`, then restart the service. See `.env.example` for repository, branch, callback
and frontend settings. Never prefix the secret with `VITE_`. The current OAuth scope
is `public_repo`, intended for this public repository. A different private-repository
integration needs an appropriately scoped GitHub App or OAuth configuration.

Sign-in uses session-bound state and S256 PKCE. Access tokens remain in service memory
and the browser receives only an HttpOnly session cookie. They are not written into
browser storage, source files or logs. Restarting the service clears sessions.
Only GitHub accounts with write access to the configured repository can publish.

Before submitting, the service checkout must have been **clean during validation**,
remain clean, and match the current remote base branch commit. Commit/push the builder
implementation through your normal development process before using it to submit a
new scraper. Changes to the draft invalidate the UI's validation; server validation
records are bound to the session and expire after ten minutes. Submission rechecks
duplicates and the base SHA, and commits only the validated generated files.
If GitHub creates the branch but the PR request fails, the error includes the branch
name so it can be recovered manually.

PR build checks now include `dev`, running typechecking, tests, lint and build.
Adding a scraper does not immediately insert a cinema into Supabase; regular scraper
ingestion happens after the change has been reviewed and merged.

## Hosting later

Use a Node host/container capable of running Chromium, with a checkout of the
repository and its dependencies. Set `VITE_SCRAPER_BUILDER_URL` at frontend build
time to its HTTPS `/builder-api` URL, and configure the frontend URL, OAuth callback
and repository in the service environment. Prefer a same-site reverse proxy for
cookie authentication. The current cookie policy is SameSite=Lax; a cross-site host
needs a deliberate session/cookie deployment design rather than merely changing a URL.

The service binds only to loopback by default. Non-loopback hosting requires GitHub
OAuth and an HTTPS frontend, and authenticated users for discovery and validation.
It checks the frontend Origin and CSRF header, serializes expensive jobs, restricts
fetches to public HTTP(S) addresses with pinned DNS and checked redirects, and bounds
response sizes, requests, page navigation, pagination and subprocess time. Add hosting
rate limits and resource isolation before making a service publicly available. An
unlinked page is not access control. No hosted service or OAuth app is provisioned by
the repository change itself.
