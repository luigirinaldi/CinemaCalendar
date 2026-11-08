# Hosting the cinema helper on Supabase

The frontend stays on GitHub Pages. The `scraper-builder` Edge Function handles
public HTTP discovery (including WordPress and embedded data), previews, location
search, fixture generation and draft pull requests. The local companion still
handles browser rendering and full repository checks before submission.

Hosted users sign in through GitHub and must have write access to the configured
repository. Discovery is not an anonymous public proxy. GitHub Actions runs
typechecking, regression tests, lint, build and the Edge bundle smoke test on draft
PRs. A successful hosted mapping check is explicitly labelled **CI pending**.

## 1. Land the shared runtime

The target branch must contain the builder runtime and CI changes from this
migration before the hosted helper can submit scrapers. In particular it needs
`scripts/configuredScraper.ts`, `scripts/embeddedAssignments.ts`, the `shared/`
modules and their dependencies. Generated scrapers import those files. The Edge
Function checks these prerequisites and leaves downloads available when the base
branch is not ready. It never commits unrelated service changes to a cinema PR.

## 2. Apply the helper-state migration

Use the existing Supabase project. The migration
[`20261108000100_scraper_builder.sql`](../../supabase/migrations/20261108000100_scraper_builder.sql)
creates three isolated tables and an atomic rate-limit RPC. It does not modify
cinema/screening data. RLS is enabled with no browser policies; only the function's
service role can access helper records.

Using your authenticated, linked Supabase CLI:

```sh
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push --dry-run
npx supabase db push
```

Review the dry run against your project's migration history. Alternatively apply
the supplied SQL through the Supabase SQL editor if the database is managed
manually; keep its migration history consistent with your normal deployment flow.

If the dry run reports **Remote migration versions not found in local migrations
directory**, first recover those already-applied files with
`npx supabase migration fetch --linked`, then rerun the dry run. Fetch can overwrite
the local migrations directory: back up pending local SQL files outside that
directory first, and restore them afterwards. For this helper, preserve
`20261108000100_scraper_builder.sql`. Fetch reads the remote history; it does not
apply SQL or mark existing migrations as reverted. Use history repair only after
investigating an actual incorrect history entry, rather than to work around a
missing local file.
If the history entry has no stored SQL, fetch produces an empty migration. That
restores version alignment for the existing project but does not reconstruct its
schema for a fresh database; recover the original schema separately before using
that history to initialize another project.

## 3. Configure GitHub OAuth and function secrets

For this repository, the simplest setup is:

1. Open [GitHub's new OAuth app form](https://github.com/settings/applications/new).
   Use **CinemaCalendar scraper helper** as the application name,
   `https://luigirinaldi.github.io/CinemaCalendar/` as the homepage, and
   `https://luigirinaldi.github.io/CinemaCalendar/dev/?builderLogin=1` as the
   authorization callback URL. Click **Register application**.
2. On the resulting application page, copy the **Client ID**, then click
   **Generate a new client secret**. Keep the generated secret private.
3. If `.env.builder-edge` has been prepared locally, open that ignored file and
   fill in `BUILDER_GITHUB_CLIENT_ID` and `BUILDER_GITHUB_CLIENT_SECRET`. Its
   other settings and random encryption key are already filled in. Save it,
   then upload the settings from the repository terminal:

    ```sh
    npx supabase secrets set --env-file .env.builder-edge
    ```

    If you are setting up a fresh checkout without that file, create an ignored
    `.env.builder-edge` using the settings and key-generation command below.

4. Deploy with `npm run deploy:builder-edge`. Dependencies and smoke tests need
   not be rerun if they have already passed in this checkout.

These are a **GitHub OAuth app's** credentials, not a personal access token or a
Supabase API key. Secret values belong in the ignored file or the Supabase
dashboard, not a chat message or a committed file.

Choose a canonical helper URL, for example:

```text
https://luigirinaldi.github.io/CinemaCalendar/dev/#/add-cinema
```

Register a GitHub OAuth application. Set its homepage to the site and its
authorization callback to the same page path, without a fragment, with
`?builderLogin=1`:

```text
https://luigirinaldi.github.io/CinemaCalendar/dev/?builderLogin=1
```

The callback loads the helper, which exchanges the one-time code using its
original browser session. OAuth state and PKCE are checked server-side. Do not use
the local companion's `/builder-api/auth/callback` URL for hosted mode. Multiple
site builds can share a backend, but sign-in returns to its configured canonical
page. Use a separate OAuth application for the local callback if needed.

Set these **Edge Function secrets** in the Supabase dashboard or CLI:

```text
BUILDER_PAGE_URL="https://luigirinaldi.github.io/CinemaCalendar/dev/#/add-cinema"
BUILDER_ALLOWED_ORIGINS=https://luigirinaldi.github.io
BUILDER_GITHUB_CLIENT_ID=<GitHub OAuth client ID>
BUILDER_GITHUB_CLIENT_SECRET=<GitHub OAuth client secret>
BUILDER_GITHUB_OWNER=luigirinaldi
BUILDER_GITHUB_REPO=CinemaCalendar
BUILDER_GITHUB_BASE=dev
BUILDER_SESSION_KEY=<64 random hexadecimal characters>
```

Generate the encryption key locally:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

For CLI configuration, put those entries in an ignored file, then run
`npx supabase secrets set --env-file <file>`. Never use `VITE_` for private
credentials. Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` to deployed functions.

Sessions expire after four hours. Their OAuth token and state are encrypted with
AES-GCM and bound to a hashed opaque session ID. The browser stores only its opaque
session credential, never the GitHub provider token. Rotating the encryption key
invalidates existing sessions. Validation records expire after ten minutes.
Expired records are cleaned during rate-limit calls; no paid scheduler is needed.

## 4. Build and deploy

```sh
npm ci
npm run build:builder-edge
npx --yes deno run --no-config --allow-env --allow-read scripts/builder/edgeSmoke.mjs
npm run deploy:builder-edge
```

The last command rebuilds and deploys **only** `scraper-builder` using the
Management API, without Docker. The Supabase CLI needs an authenticated account
or `SUPABASE_ACCESS_TOKEN`. The generated function module is ignored by Git;
`buildEdge.mjs` bundles the existing parser/discovery code with pinned lockfile
dependencies and excludes Playwright and the local subprocess/check modules.
The existing Letterboxd function is not changed or redeployed.

`verify_jwt = false` is intentional for this function: authentication uses its
own opaque sessions and GitHub authorization. A Supabase publishable/anonymous
key is not treated as a user login. Hosted requests require an allowed frontend
Origin and sensitive operations require repository write access, checked again
on each request. Network requests retain the existing public-address validation,
DNS pinning, redirect checks, timeouts and response bounds.

## 5. Frontend deployment and verification

Production builds automatically use
`${VITE_SUPABASE_URL}/functions/v1/scraper-builder`. Existing Pages builds already
supply the public Supabase URL and site key. For the normal hosted deployment,
there is no extra frontend setting to add: the builder changes must be committed
and pushed to `dev`, then the existing **Deploy production and dev to Pages**
workflow publishes that build. The hosted helper is at
`https://luigirinaldi.github.io/CinemaCalendar/dev/#/add-cinema` once that workflow
finishes. Publishing the backend alone does not update the website.

To use the hosted backend while
running Vite locally, set an explicit override in your ignored `.env`:

```text
VITE_SCRAPER_BUILDER_URL=https://YOUR_PROJECT_REF.supabase.co/functions/v1/scraper-builder
```

Also allow that local frontend origin in `BUILDER_ALLOWED_ORIGINS` if testing this
way; restart Vite after changing environment settings. With no override,
`npm run dev` continues to use the local companion. An explicit Node companion URL
still works. No cross-site cookies are required for hosted mode.

After deployment:

1. Open the helper, sign in, and check that the callback returns to the helper.
2. Inspect a public programme, preview a localized date and generate files.
3. Compare the mapped screenings against the cinema's website. Hosted previews
   refetch the source; they do not reuse a process-local HTML snapshot.
4. When intentionally adding a real cinema, create its draft PR, wait for GitHub
   Actions, and review before marking it ready. There is no automatic merge or
   ingestion.

## Limits and recovery

- JavaScript rendering requires the local companion; there is no remote browser
  subscription or model service in this deployment.
- Mapping previews cover one response. Hosted validation also checks all configured
  JSON pagination pages; full repository checks run in CI.
- Hosted duplicate checks cover the public catalogue and repository filenames.
  They do not download every scraper source to infer unpublished venue aliases;
  review those in the PR.
- Database locks serialize operations across workers. Atomic validation claims
  prevent concurrent submission. A repeated successful submission returns its
  existing PR. If a GitHub write partially succeeds, the error identifies the
  deterministic recovery branch; check it before generating a fresh validation.
- Sessions are limited to 30 operations per minute; bootstrap is bounded globally
  and by a salted IP hash. Photon searches are globally limited to one per second.
  These limits live in Postgres rather than per-worker memory.
- The shared TypeScript syntax parser makes the minified function bundle about
  4 MB. Local Deno startup and parser tests pass, but hosted CPU/memory behaviour
  should be checked with representative cinema pages after deployment. Supabase
  quotas still apply; no claim of unlimited free use is made.
