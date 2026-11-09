import { createProgrammeScraper } from '../programmeScraper';
import {
    loadPiccoloProgramme,
    parsePiccoloProgramme,
} from '../providers/piccoloTeatro';
import type { Cinema } from '../types';

const CINEMA: Cinema = {
    name: 'Piccolo Teatro Padova',
    location: 'Padova',
    website: 'https://www.piccolo-padova.it/',
    coordinates: { lat: '45.3827253', lng: '11.8520657' },
    defaultLanguage: 'it-IT',
};

export const scraper = createProgrammeScraper({
    cinema: CINEMA,
    load: () => loadPiccoloProgramme(),
    parse: parsePiccoloProgramme,
});
