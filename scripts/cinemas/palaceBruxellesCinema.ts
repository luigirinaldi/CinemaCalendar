import { createProgrammeScraper } from '../programmeScraper';
import { loadPalaceProgramme } from '../providers/bruxelles';
import { bruxellesCinema } from '../venues/bruxelles';

export const scraper = createProgrammeScraper({
    cinema: bruxellesCinema('palace'),
    load: loadPalaceProgramme,
    parse: (films) => films,
});
