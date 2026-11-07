import { createProgrammeScraper } from '../programmeScraper';
import { parseNovaProgramme, programmeHtml } from '../providers/bruxelles';
import { bruxellesCinema } from '../venues/bruxelles';

export const scraper = createProgrammeScraper({
    cinema: bruxellesCinema('nova'),
    load: () =>
        programmeHtml('https://www.nova-cinema.org/spip.php?page=seances'),
    parse: parseNovaProgramme,
});
