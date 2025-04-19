import { fetchUpcomingCalendar } from "./reagentStreetCinema"
import fs from 'fs';

async function main() {
  await fetchUpcomingCalendar();

  // Write out the list of avalable cinemas
  fs.writeFile('./public/data/cinemas.json', JSON.stringify({'cinemas':['regentStreetCinema']}), (err: any) => {
    if (err) {
      console.error('Error writing file: ', err);
      return;
    }
    console.log('JSON data has been successfully dumped to data.json');
  });

}

main()