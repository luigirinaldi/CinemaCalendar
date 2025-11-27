import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import path from 'path';
import { execSync } from 'child_process';

(async () => {
    if (process.argv[2] === 'help' || process.argv.length !== 4) {
        console.log(
            'npm run gen_types <scraper_name.ts> "<api_endpoint_url>"\n'
        );
        return;
    }

    const scraperName = process.argv[2];
    const url = process.argv[3];

    const TEMP_DIR = 'temp';
    const FILE_PATH = path.join(TEMP_DIR, 'temp.json');

    // fetch json
    const res = await fetch(url);
    const data = await res.json();

    // create temp folder
    mkdirSync(TEMP_DIR, { recursive: true });

    // write json to temp file
    writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
    console.log('+ donwloaded json file');

    // generate types
    const cmd = `npx quicktype --src ${FILE_PATH} --lang typescript --just-types --quiet --top-level ApiResponse`;
    const types = execSync(cmd).toString();
    console.log('generating types...');

    // prepend types to scraper file
    const scraperPath = path.join('scripts', 'cinemas', scraperName);
    const scraperFile = readFileSync(scraperPath).toString();
    const newFileContent = types + '\n\n' + scraperFile;

    writeFileSync(scraperPath, newFileContent);

    // cleanup temp folder
    rmSync(TEMP_DIR, { recursive: true, force: true });
})();
