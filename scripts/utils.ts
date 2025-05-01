import ICAL from 'ical.js';
import type { FilmShowing } from '../src/types';

export async function fetchAndParseICS(
  url: string,
  parseEvent: Function,
  filter: boolean = false
): Promise<FilmShowing[]> {
  const res = await fetch(url);
  const icsText = await res.text();

  const jcalData = ICAL.parse(icsText);
  const comp = new ICAL.Component(jcalData);
  let vevents = comp.getAllSubcomponents('vevent');

  // filter out past showings
  if (filter) {
    const today = new Date();
    today.setUTCHours(0,0,0,0); // Set time to midnight
    vevents = vevents.filter((vevent) => {
      const event = new ICAL.Event(vevent);
      return event.startDate.toJSDate() >= today;
    });
  }

  const events: FilmShowing[] = vevents.map((vevent) => {
    const event = new ICAL.Event(vevent);
    return parseEvent(event, vevent);
  });

  return events;
}