import { createProgrammeScraper } from '../programmeScraper';
import { parseCinematekProgramme, programmeHtml } from '../providers/bruxelles';
import { bruxellesCinema } from '../venues/bruxelles';

export const scraper = createProgrammeScraper({
    cinema: bruxellesCinema('cinematek'),
    load: () => programmeHtml('https://cinematek.be/programme/calendrier'),
    parse: parseCinematekProgramme,
});
