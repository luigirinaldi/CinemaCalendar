import { createProgrammeScraper } from '../programmeScraper';
import { parseVendomeProgramme, programmeHtml } from '../providers/bruxelles';
import { bruxellesCinema } from '../venues/bruxelles';

export const scraper = createProgrammeScraper({
    cinema: bruxellesCinema('vendome'),
    load: () =>
        programmeHtml('http://www.cinema-vendome.be/les_films/horaires'),
    parse: (source) => parseVendomeProgramme(source),
});
