# Piccolo Teatro Padova hybrid programme fixtures

Captured from the official public WordPress Cinema-category posts feed and the
linked film pages on 9 November 2026. No LiveTicket page is fetched by the scraper.

`posts.json` whitelists film identity, categories, publication/modification
timestamps and a public poster URL. The HTML fixtures contain only the matching
post's title/date header and poster. API publication times are deliberately
different from screening times. The 10 film posts contain 13 screenings.

Tests freeze the reference date to 9 November 2026. Missing years are resolved
only within 183 days of that reference, with a matching published weekday, recent
post metadata and an unambiguous Europe/Rome local time. Maintenance responses,
missing dates, extra unparsed date/time text and stale archives fail explicitly.
