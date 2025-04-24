import { fetchUpcomingCalendar } from './regentStreetCinema';
import { fetchUpcomingCalendar2 } from './theSpaceLimena';
import fs from 'fs';

async function main() {
  await fetchUpcomingCalendar();
  await fetchUpcomingCalendar2();

  // Write out the list of avalable cinemas
  fs.writeFile(
    './public/data/cinemas.json',
    JSON.stringify({ cinemas: ['regentStreetCinema','theSpaceLimena'] }),
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
