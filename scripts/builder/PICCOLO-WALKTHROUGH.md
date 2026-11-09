# Adding Piccolo through the helper

The helper can combine film metadata from a public API with screening times on
each film's HTML page. This walkthrough uses Piccolo Teatro Padova; it does not
require writing TypeScript or paying for an agent.

1. Inspect `https://www.piccolo-padova.it/`. Use the official site rather than
   LiveTicket: its server-side requests return a Cloudflare HTTP 403.
2. Under **JSON data**, choose the cinema-category WordPress posts candidate.
   Discovery filters cinema posts rather than theatre posts. The helper suggests
   `title.rendered` for the film title, `link` for the film URL, and
   `rttpg_featured_image_url.full.0` for the poster. Keep **Read HTML as plain
   text** enabled for the rendered title. Publication and modification dates are
   not screening dates.
3. Fill in the cinema information. Use `Europe/Rome` for the timezone and `it-IT`
   for the language. The venue is Piccolo Teatro Padova, Via Asolo 2, Paltana;
   coordinates are `45.3827253`, `11.8520657`.
4. Enable **Follow film detail pages for screening times**. Leave the film
   container as `article`, the freshness field as `modified`, and the maximum
   linked films as `20`. The freshness field checks that yearless schedules are
   current; it never supplies a screening timestamp.
5. Click **Load film page preview**. Use **Pick showings** and select the paragraph
   containing the dates near the film title. Its selector should be
   `header .data-evento p`, relative to the film container. You can also type that
   selector directly.
6. Enable **One screening per line (split HTML line breaks)**. This sets the
   screening time to `$self` and clears the separate date field. A paragraph can
   contain several screenings separated by `<br>`; each line becomes one session.
7. Choose the **Italian without year** date example. This sets the format to
   `cccc d MMMM 'ore' HH.mm`, date language to `it-IT`, and enables **Infer a
   missing year from the printed weekday**. Leave the separate date field empty:
   the same full text should not be mapped twice.
8. Click **Preview mapped screenings**, then compare the output against the site.
   The live programme checked on 9 November 2026 returned 10 films and 13 sessions.
   Programme totals will change over time.
9. Click **Generate & validate**. Review and download the generated scraper and
   fixture test. Piccolo already has a scraper in this repository, so duplicate
   checks block submitting a second copy; preview and file download still work.

Year inference is deliberately limited: a line must include its weekday, day,
month and time, and identify exactly one matching date within 183 days of the
run. The API freshness timestamp must also be within 183 days. Ambiguous dates,
stale programmes and ambiguous daylight-saving times fail rather than silently
guessing. Captured fixture tests freeze the reference date so they remain
reproducible.

Linked pages must belong to the API or cinema website origin. Each must contain
exactly one matching film container. The helper bounds requests and refuses a
programme exceeding the configured film limit instead of truncating it.
