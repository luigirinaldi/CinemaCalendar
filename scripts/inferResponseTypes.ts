import { readFileSync, writeFileSync } from "fs";
import { ScraperFunction } from './types';

// num is an array so it is passed by reference
async function inferTypesRecur(response: any[], num = [0]) : Promise<string> {
    let typeSpec = `interface type${num} = {`;
    const attrs = new Set() as Set<string>;
    response.forEach(obj => Object.keys(obj).forEach(key => attrs.add(key)));
    const types = new Map();
    response.forEach(obj => attrs.forEach(key => {
        if (types.has(key)) { // TO MODIFY
            const value = obj[key];
            if (typeof value === 'object' && value !== null) {
                num[0]++;
                let typ = `type${num[0]}`;
                if (value[0] !== undefined) { // value is an array
                    typ += '[]';
                }
                types.set(key, {name:key, value:typ});
                typeSpec = inferTypesRecur(value,num) + typeSpec;
            } else if (value === undefined) {
                types.set(key, {name: key+'?'});
            } else if (value === null) {
                types.set(key, {name: key, value: null, nullable: true});
            } else if (typeof value === 'number') {
                types.set(key, {name: key, value: 'number',
                    domain: value>0 ? 'positive' : value<0 ? 'negative' : 'zero',
                    float: Math.trunc(value) == value
                });
            } else if (typeof value === 'boolean') {
                types.set(key, {name: key, value: 'boolean'});
            } else if (typeof value === 'string') {
                types.set(key, {name: key, value: 'string', range: new Set([value]),
                    repeats: false
                });
            } else {
                throw new Error('Unexpected type, report to Github issues.');
            }
        } else {
            const value = obj[key];
            if (typeof value === 'object' && value !== null) {
                num[0]++;
                let typ = `type${num[0]}`;
                if (value[0] !== undefined) { // value is an array
                    typ += '[]';
                }
                types.set(key, {name:key, value:typ});
                typeSpec = inferTypesRecur(value,num) + typeSpec;
            } else if (value === undefined) {
                types.set(key, {name: key+'?'});
            } else if (value === null) {
                types.set(key, {name: key, value: null, nullable: true});
            } else if (typeof value === 'number') {
                types.set(key, {name: key, value: 'number',
                    domain: value>0 ? 'positive' : value<0 ? 'negative' : 'zero',
                    float: Math.trunc(value) == value
                });
            } else if (typeof value === 'boolean') {
                types.set(key, {name: key, value: 'boolean'});
            } else if (typeof value === 'string') {
                types.set(key, {name: key, value: 'string', range: new Set([value]),
                    repeats: false
                });
            } else {
                throw new Error('Unexpected type, report to Github issues.');
            }
        }
    }));
    [...types].forEach(key => {
        if 
    })
    return typeSpec + '}\n\n'
}

async function main() : Promise<undefined> {
    const args = process.argv.slice(2) as string[];
    const scraperName = args[0];
    const module = await import('./cinemas/' + scraperName); // dynamic import
    if (typeof module.scraper !== 'function') {
        throw new Error(`❌ No 'scraper' function found in ${scraperName}`);
    }
    console.log(`☑️ Loaded scraper from ${scraperName}`);
    const scraperFun = module.scraper as ScraperFunction;
    console.warn(
        '[Warning] Ensure the scraper returns the full JSON obj with all attributes.\n',
        ' |------  Else, add the return and re-run this command.'
    );
    const rawResult = await scraperFun() as {}[];
    const types = await inferTypesRecur(rawResult);
    const oldFile = readFileSync(scraperName, "utf8");
    const newFile = types + oldFile;
    writeFileSync(scraperName, newFile);
}

main();