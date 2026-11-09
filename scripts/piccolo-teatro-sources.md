# Piccolo Teatro Padova

Verified on 9 November 2026. Venue: Piccolo Teatro Don Bosco, Via Asolo 2, Paltana,
Padova. The catalogue name is **Piccolo Teatro Padova**.

- Official site: https://www.piccolo-padova.it/
- Address/map: https://www.piccolo-padova.it/dove-siamo/
- OpenStreetMap venue: https://www.openstreetmap.org/way/131801344
  (`Teatro Piccolo Don Bosco`, Via Asolo 2), centre 45.3827253, 11.8520657.
  The similarly named Tom Benetollo theatre in Stanga is a different venue.
- Public API index: https://www.piccolo-padova.it/wp-json/
- Discover the category ID using `/wp-json/wp/v2/categories?slug=cinema`;
  the current ID is 2. Follow all pages of `/wp-json/wp/v2/posts?categories=2`.
- Example film: https://www.piccolo-padova.it/il-tempo-di-anne/
- Public booking page: https://www.liveticket.it/piccoloteatropadova

The API provides film titles, detail URLs, category membership and poster URLs.
Its `date` and `modified` fields are CMS timestamps, not showtimes. They are used
only to reject stale archives. Some embedded media records require authentication;
the public `rttpg_featured_image_url.full[0]` or the film page's poster avoids that
dependency. No private custom-field endpoints are used.

Each detail page currently puts screening dates in `header .data-evento`, with
Italian weekdays/months and `<br>` separators. Parse all entries, verify the post
identity/title, and reject any leftover date/time text instead of silently taking
the first session. Only posts in the Cinema category are fetched; theatre, live
music and other categories are excluded.

For yearless dates, accept exactly one candidate year within ±183 calendar days
of the run date whose weekday agrees with the source. Also require recent API
metadata and reject ambiguous/nonexistent DST times. This handles December/January
rollover without converting old archive dates to future screenings. A changed
schedule format fails rather than returning fabricated times.

LiveTicket's page currently presents a Cloudflare browser access check to server
requests. Its structured-looking schedule is therefore not a reliable HTTP source
for the scraper. The hybrid scraper does not request it; it remains the human
booking link when the official film page has no more specific booking link.

Validate without database writes using `npm run test_scraper -- piccolo`.
The regular `npm run get_data` imports the venue and its screenings into Supabase;
that separate ingestion step is required before it appears in the map/catalogue.
