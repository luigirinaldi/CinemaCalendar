import { createProgrammeScraper } from '../programmeScraper';
import { parseRitcsProgramme, programmeHtml } from '../providers/bruxelles';
import { bruxellesCinema } from '../venues/bruxelles';

export const scraper = createProgrammeScraper({
    cinema: bruxellesCinema('ritcs'),
    load: () => programmeHtml('https://www.cinemaritcs.be/'),
    parse: parseRitcsProgramme,
});
