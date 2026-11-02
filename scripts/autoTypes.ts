import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import {
    InputData,
    jsonInputForTargetLanguage,
    quicktype,
} from 'quicktype-core';

(async () => {
    if (process.argv[2] === 'help' || process.argv.length !== 4) {
        console.log(
            'npm run gen_types <scraper_name.ts> "<api_endpoint_url>"\n'
        );
        return;
    }

    const scraperName = process.argv[2];
    const url = process.argv[3];

    // fetch json
    const res = await fetch(url);
    const data = await res.json();
    console.log('+ downloaded json');

    // generate types
    console.log('generating types...');
    const jsonInput = jsonInputForTargetLanguage('typescript');
    await jsonInput.addSource({
        name: 'ApiResponse',
        samples: [JSON.stringify(data)],
    });
    const inputData = new InputData();
    inputData.addInput(jsonInput);
    const { lines } = await quicktype({
        inputData,
        lang: 'typescript',
        rendererOptions: { 'just-types': 'true' },
    });
    const types = lines.join('\n');

    // prepend types to scraper file
    const scraperPath = path.join('scripts', 'cinemas', scraperName);
    const scraperFile = readFileSync(scraperPath).toString();
    const newFileContent = types + '\n\n' + scraperFile;

    writeFileSync(scraperPath, newFileContent);
})();
