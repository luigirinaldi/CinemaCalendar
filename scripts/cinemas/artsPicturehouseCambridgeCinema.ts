import { createProgrammeScraper } from '../programmeScraper';
import {
    loadPicturehouseProgramme,
    parsePicturehouseProgramme,
} from '../providers/picturehouse';

const website =
    'https://www.picturehouses.com/cinema/Arts-Picturehouse-Cambridge';
export const scraper = createProgrammeScraper({
    cinema: {
        name: 'Arts Picturehouse Cambridge',
        location: 'Cambridge',
        website,
        // Sources: ../cinema-locations.md
        coordinates: { lat: '52.20288', lng: '0.1235' },
        defaultLanguage: 'en-GB',
    },
    load: () => loadPicturehouseProgramme('002'),
    parse: (source) => parsePicturehouseProgramme(source, '002', website),
});
