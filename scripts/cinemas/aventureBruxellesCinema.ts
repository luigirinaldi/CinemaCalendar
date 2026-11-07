import { createProgrammeScraper } from '../programmeScraper';
import { parseAventureProgramme, programmeHtml } from '../providers/bruxelles';
import { bruxellesCinema } from '../venues/bruxelles';

export const scraper = createProgrammeScraper({
    cinema: bruxellesCinema('aventure'),
    load: () =>
        programmeHtml('https://www.cinema-aventure.be/catalogue/?view=table'),
    parse: parseAventureProgramme,
});
