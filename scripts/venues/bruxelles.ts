import type { Cinema } from '../types';

/** Venue addresses and coordinate sources are recorded in ../cinema-locations.md. */
export const BRUXELLES = {
    flagey: {
        name: 'Cineflagey',
        website: 'https://www.flagey.be/en/agenda/cinema',
        coordinates: { lat: '50.827831', lng: '4.372461' },
    },
    aventure: {
        name: 'Cinéma Aventure',
        website: 'https://www.cinema-aventure.be',
        coordinates: { lat: '50.8484688', lng: '4.3527074' },
    },
    palace: {
        name: 'Cinéma Palace',
        website: 'https://www.cinema-palace.be',
        coordinates: { lat: '50.84794', lng: '4.34833' },
    },
    galeries: {
        name: 'Cinéma Galeries',
        website: 'https://galeries.be/fr/',
        coordinates: { lat: '50.847498', lng: '4.3545281' },
    },
    cinematek: {
        name: 'CINEMATEK',
        website: 'https://cinematek.be',
        coordinates: { lat: '50.844193', lng: '4.360163' },
    },
    nova: {
        name: 'Cinéma Nova',
        website: 'https://www.nova-cinema.org',
        coordinates: { lat: '50.8483444', lng: '4.3560893' },
    },
    ritcs: {
        name: 'Cinema RITCS',
        website: 'https://www.cinemaritcs.be',
        coordinates: { lat: '50.8502176', lng: '4.3459479' },
    },
    vendome: {
        name: 'Cinéma Vendôme',
        website: 'http://www.cinema-vendome.be',
        coordinates: { lat: '50.837615', lng: '4.3630104' },
    },
    ugcBrouckere: {
        name: 'UGC De Brouckère',
        website: 'https://www.ugc.be/cinema.html?id=2',
        coordinates: { lat: '50.8517219', lng: '4.3523778' },
    },
    ugcToison: {
        name: 'UGC Toison d’Or',
        website: 'https://www.ugc.be/cinema.html?id=1',
        coordinates: { lat: '50.8377857', lng: '4.361029' },
    },
} satisfies Record<string, Pick<Cinema, 'name' | 'website' | 'coordinates'>>;

export function bruxellesCinema(key: keyof typeof BRUXELLES): Cinema {
    return {
        ...BRUXELLES[key],
        location: 'Bruxelles',
        defaultLanguage: 'fr-BE',
    };
}
