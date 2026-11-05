import { createProgrammeScraper } from '../programmeScraper';
import {
    loadEverymanProgramme,
    parseEverymanProgramme,
} from '../providers/everyman';

const website =
    'https://www.everymancinema.com/venues-list/g02am-everyman-cambridge/';
export const scraper = createProgrammeScraper({
    cinema: {
        name: 'Everyman Cambridge',
        location: 'Cambridge',
        website,
        // Sources: ../cinema-locations.md
        coordinates: { lat: '52.204', lng: '0.1218' },
        defaultLanguage: 'en-GB',
    },
    load: () => loadEverymanProgramme('G02AM'),
    parse: (source) => parseEverymanProgramme(source, 'G02AM', website),
});
