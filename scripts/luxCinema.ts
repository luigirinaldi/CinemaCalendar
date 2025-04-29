import fs from 'fs';
import ICAL from 'ical.js';
import type { CinemaShowing, FilmShowing } from '../src/types';

async function fetchAndParseICS(url: string, parseEvent:Function, filter: boolean = false) : Promise<FilmShowing[]> {
  const res = await fetch(url);
  const icsText = await res.text();

  const jcalData = ICAL.parse(icsText);
  const comp = new ICAL.Component(jcalData);
  let vevents = comp.getAllSubcomponents('vevent');
  
  // filter out past showings
  if (filter) {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // zero out time to get beginning of today
    console.log(today);
    vevents = vevents.filter(vevent => {
        const event = new ICAL.Event(vevent);
        return event.startDate.toJSDate() >= today;
    });
  };

  const events:FilmShowing[] = vevents.map(vevent => {
    const event = new ICAL.Event(vevent);
    return parseEvent(event, vevent);
});

return events;
}

/**
 * Choose how to parse the event data into FilmShowing objects.
 * This function is called for each event in the ICS file.
 * @param event - The event object created from the vevent component. 
 * 
 * ### Common properties:
 * - _summary_ - The event's title or summary.
 * - _description_ - Detailed description of the event.
 * - _location_ - Where the event takes place.
 * - _startDate_ - An ```ICAL.Time``` object representing the event's start.
 * - _endDate_ - An ```ICAL.Time``` object representing the event's end.
 * - _duration_ - An ```ICAL.Duration``` object if duration is specified instead of end date.
 * - _uid_ - Unique identifier for the event.
 * - _organizer_ - The organizer's contact information.
 * - _status_ - The event's status (e.g., "CONFIRMED", "CANCELLED").
 * - _categories_ - Array of categories or tags associated with the event.
 * - _component_ - Accesses the underlying ICAL.Component for advanced manipulations.
 * 
 * @returns A FilmShowing object with the parsed data.
 */
function parseEvent(event: ICAL.Event): FilmShowing {
  const res = event.summary.split(/[\s–-][\s–-]/, 2); // regex matches every word in { ,–,-}^2
  const title = res[0];
  const desc = res[res.length - 1];
  const durations = desc ? desc.match(/(?<=[\(+])\d+(?=′)/) : null; // regex matches (x′) where x is a number
  let duration:number = 0;
  durations?.forEach((minutes) => {duration += +minutes;}); // The '+' operator converts the string to a number
  return {
    name: title,
    tmdbId: event.uid,
    startTime: event.startDate.toString(),
    duration: duration
  };
}

export async function scraper() : Promise<CinemaShowing[]> {
  return [{
    cinema: 'LuxPadova',
    location: 'Padova',
    showings: await fetchAndParseICS(
      'http://www.movieconnection.it/?plugin=all-in-one-event-calendar&controller=ai1ec_exporter_controller&action=export_events&no_html=true',
      parseEvent,
      true
    )
  }];
}
