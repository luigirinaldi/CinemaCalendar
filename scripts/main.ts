import { fetchUpcomingCalendar } from './regentStreetCinema';
import { fetchUpcomingCalendar2 } from './theSpaceLimena';
import { fetchUpcomingCalendar3 as fetchLuxPadova } from './luxPadova';
import fs from 'fs';

async function main() {
  await fetchUpcomingCalendar();
  await fetchUpcomingCalendar2();
  await fetchLuxPadova();

  // Write out the list of avalable cinemas
  fs.writeFile(
    './public/data/cinemas.json',
    JSON.stringify({ cinemas: ['regentStreetCinema','theSpaceLimena','luxPadova'] }),
    (err: any) => {
      if (err) {
        console.error('Error writing file: ', err);
        return;
      }
      console.log('JSON data has been successfully dumped to cinemas.json');
    }
  );
}

main();
