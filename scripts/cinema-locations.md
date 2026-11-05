# Cinema location metadata

Coordinates added or corrected on 3 November 2026, in decimal WGS84 latitude and
longitude. These are venue locations for maps and distance searches, not individual
auditorium entrances. Address sources were checked against the cinema identity to
avoid matching another venue with the same name.

| Cinema                  | Venue address                            | Latitude, longitude    | Verification sources                                                                                                                                                                                                                                          |
| ----------------------- | ---------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fronte del Porto        | Via Santa Maria Assunta 20, Padova       | 45.38365, 11.8656      | [Cinema](https://www.frontedelportopadova.it/), [Comune di Padova](https://www.comune.padova.it/vivere-il-comune/luoghi/sala-cinema-fronte-del-porto-una-sala-comune-quartiere-4-sud-est). Same complex as Porto Astra; reuse its existing venue coordinates. |
| Ciné Lumière            | 17 Queensberry Place, London SW7 2DT     | 51.49453, -0.17715     | [Institut français](https://www.institut-francais.org.uk/visit-contact-us/), [OSM-derived coordinates](https://mapcarta.com/N7930695624)                                                                                                                      |
| Lux Cinema              | Viale Felice Cavallotti 9, Padova        | 45.3909316, 11.8705986 | [Operator](https://www.movieconnection.it/contatti/), [Cinema listing and OSM directions](https://www.oraricinema.com/cinema/padova/cinema-lux/)                                                                                                              |
| Prince Charles Cinema   | 7 Leicester Place, London WC2H 7BY       | 51.51149, -0.13012     | [Cinema FAQ](https://princecharlescinema.com/faq/), [OSM-derived coordinates](https://mapcarta.com/W180594287)                                                                                                                                                |
| RegentStreetCinema      | 307 Regent Street, London W1B 2HW        | 51.51683, -0.14277     | [Cinema](https://www.regentstreetcinema.com/find-us/), [Coordinates](https://locatecinemas.com/cinemas/united-kingdom/greater-london/regent-street-cinema-london-7ca78292/)                                                                                   |
| Rex Cinema              | Via Sant'Osvaldo 2, Padova               | 45.391194, 11.8919322  | [Cinema](https://www.cinemarex.it/dove-siamo), [Cinema listing and OSM directions](https://www.oraricinema.com/cinema/padova/cinema-rex/)                                                                                                                     |
| Riverside Studios       | 101 Queen Caroline Street, London W6 9BN | 51.48879, -0.22783     | [Venue address](https://mapcarta.com/N11435284025), [Cinema feature coordinates](https://mapcarta.com/W97398691). Use the cinema feature rather than the adjacent theatre/restaurant point.                                                                   |
| The Space Cinema Limena | Via Vincenzo Stefano Breda 11, Limena    | 45.46348, 11.84804     | [Cinema](https://www.thespacecinema.it/cinema/limena/al-cinema), [OSM-derived coordinates](https://mapcarta.com/W372995696)                                                                                                                                   |
| ICA                     | The Mall, London SW1Y 5AH                | 51.506346, -0.130931   | [ICA](https://www.ica.art/visit-contact), [Venue coordinates](https://cloud.expcinema.org/site/en/venues/institute-contemporary-arts). Replaces an incorrectly positioned coordinate pair in an unsupported degree-symbol format.                             |

The Space remains under the existing Padova catalogue grouping, although the venue
is in Limena. Nearby search uses its actual coordinates. Fronte del Porto and Porto
Astra retain separate catalogue identities despite sharing a building.

Scrapers pass these fields to the cinema upsert in `scripts/database.ts` during a
successful scrape/store run. Editing these files does not update existing Supabase
rows immediately. No database update was performed while adding this metadata.

Cambridge venues added on 4 November 2026:

| Cinema                      | Venue address                                          | Latitude, longitude | Verification sources                                                                                                                                  |
| --------------------------- | ------------------------------------------------------ | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arts Picturehouse Cambridge | 38–39 St Andrew's Street, Cambridge CB2 3AR            | 52.20288, 0.1235    | [Official venue](https://www.picturehouses.com/cinema/Arts-Picturehouse-Cambridge/information), [OSM cinema point](https://mapcarta.com/N20922159)    |
| The Light Cambridge         | Cambridge Leisure Park, Clifton Way, Cambridge CB1 7DY | 52.1905, 0.13714    | [Leisure park venue listing](https://www.cambridgeleisure.co.uk/en/play-listing/the-light-cinema), [OSM cinema point](https://mapcarta.com/N24672063) |
| Everyman Cambridge          | Unit 42, Grand Arcade, Cambridge CB2 3BJ               | 52.204, 0.1218      | [Official venue](https://www.everymancinema.com/venues-list/g02am-everyman-cambridge/), coordinates from that page's `MovieTheater` JSON-LD           |
