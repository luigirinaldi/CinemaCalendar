import { createProgrammeScraper } from '../programmeScraper';
import { loadFlageyProgramme } from '../providers/flagey';
import { bruxellesCinema } from '../venues/bruxelles';

export const scraper = createProgrammeScraper({
    cinema: bruxellesCinema('flagey'),
    load: loadFlageyProgramme,
    parse: (films) => films,
});
