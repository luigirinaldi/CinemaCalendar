import { createProgrammeScraper } from '../programmeScraper';
import { loadLightProgramme, parseLightProgramme } from '../providers/light';

const website = 'https://cambridge.thelight.co.uk';
export const scraper = createProgrammeScraper({
    cinema: {
        name: 'The Light Cambridge',
        location: 'Cambridge',
        website,
        // Sources: ../cinema-locations.md
        coordinates: { lat: '52.1905', lng: '0.13714' },
        defaultLanguage: 'en-GB',
    },
    load: () => loadLightProgramme(website),
    parse: (source) => parseLightProgramme(source, website),
});
