import { createProgrammeScraper } from '../programmeScraper';
import {
    loadCineBoutiqueProgramme,
    parseCineBoutiqueProgramme,
} from '../providers/cineBoutique';
import { bruxellesCinema } from '../venues/bruxelles';

const booking = 'https://bruxellescinemagaleries.cine.boutique';
export const scraper = createProgrammeScraper({
    cinema: bruxellesCinema('galeries'),
    load: () => loadCineBoutiqueProgramme(booking),
    parse: (source) =>
        parseCineBoutiqueProgramme(source, 'bruxellescinemagaleries', booking),
});
