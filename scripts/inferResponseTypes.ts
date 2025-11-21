import { readFileSync, writeFileSync } from "fs";
import { ScraperFunction } from './types';
import path from 'path';

type elem = {name: string, value: Set<string>, domain?: string, float?: boolean, range?: Set<string>, repeats?: number};

// num is an array so it is passed by reference
async function inferTypesRecur(response: any[], num = [0], types:any) : Promise<string> {
    let typeSpec = `type type${num}`;
    const attrs = new Set() as Set<string>;
    if (typeof response !== 'object' || response === null) {
        inferType(types, response, num);
        const obj = types.get('obj');
        const _type_ = obj ? [...obj.value][0] : 'any';
        typeSpec += ` : ${_type_};`
    }
    if (response[0]==undefined) { // {}, not array

    } else { // array
        response.forEach(obj => Object.keys(obj).forEach(key => attrs.add(key)));
        response.forEach(obj => attrs.forEach(key => {
            typeSpec = inferType(types, obj, key, num) + typeSpec;
        }));
    }

    typeSpec += ' = {';
    types.forEach(_type_ => {
        if (_type_.range && _type_.repeats !== undefined && _type_.repeats > response.length - 10) {
            _type_.value.delete('string');
            _type_.range.forEach(str => _type_.value.add(str));
        }
        const domain = _type_.domain ? _type_.domain : '';
        const float = _type_.float===undefined ? '' : _type_.float ? 'float' : 'int';
        const comment = (domain+float).length > 0 ? ` // number_domain:${domain} number_type:${float}` : '';
        typeSpec += `\n\t${_type_.name} : ${[..._type_.value].join('|')};${comment}`;
    })
    return typeSpec + '}\n\n'
}

function inferType(types:Map<string, {}>, key:string, value:any, num:number[]) {
    if (types.has(key)) {
        const _type_ = types.get(key) as {name: string, value: Set<string>, domain?: string, float?: boolean, range?: Set<string>, repeats?: number};
        switch (typeof value) {
            case 'object':
                if (value === null) {
                    _type_.value.add('null');
                } else {
                    // skip, for now             
                }
                break;
            case 'undefined':
                _type_.name = key+'?';
                break;
            case 'number':
                _type_.value.add('number');
    
                switch (_type_.domain) {
                    case 'positive':
                        _type_.domain = value > 0 ? 'positive' : value < 0 ? 'T' : 'non-negative';
                        break;
                    case 'negative':
                        _type_.domain = value > 0 ? 'T' : value < 0 ? 'negative' : 'non-positive';
                        break;
                    case 'zero':
                        _type_.domain = value > 0 ? 'non-negative' : value < 0 ? 'non-positive' : 'zero';
                        break;
                    case 'non-negative':
                        _type_.domain = value > 0 ? 'non-negative' : value < 0 ? 'T' : 'non-negative';
                        break;
                    case 'non-positive':
                        _type_.domain = value > 0 ? 'T' : value < 0 ? 'non-positive' : 'non-positive';
                        break;
                    case 'T':
                        break;
                    default: // undefined
                        _type_.domain = value > 0 ? 'positive' : value < 0 ? 'negative' : 'zero';
                    
                }
                _type_.float ||= Math.trunc(value) == value;
                break;
            case 'boolean':
                _type_.value.add('boolean');
                break;
            case 'string':
                _type_.value.add('string');
                if (_type_.range && _type_.repeats) {
                    if (_type_.range.has(value)) {
                        _type_.repeats++;
                    }
                    _type_.range.add(value);
                } else {
                    _type_.range = new Set([value]);
                    _type_.repeats = 0;
                }
                break;
            default:
                throw new Error('Unexpected type, report to Github issues.');
        }
    } else {
        switch (typeof value) {
            case 'object':
                if (value === null) {
                    return {value: new Set(['null'])};
                } else {
                    num[0]++;
                    let typ = '';
                    while (value[0] !== undefined) { // value is an array
                        typ += '[]';
                        value = value[0];
                    }
                    if (typeof value != 'object' || value === null) {
                        return {value: new Set([(value === null ? 'null' : typeof value) + typ])};
                    }
                    typ = `type${num[0]}` + typ;
                    return {name:key, value: new Set([typ])};
                    return inferTypesRecur(value, num, types);                
                }
            case 'undefined':
                return {name: key+'?', value: new Set()};
            case 'number':
                return {value: new Set(['number']),
                    domain: value>0 ? 'positive' : value<0 ? 'negative' : 'zero',
                    float: Math.trunc(value) == value
                };
            case 'boolean':
                return {value: new Set(['boolean'])};
            case 'string':
                return {value: new Set(['string']), range: new Set([value]),
                    repeats: 0
                };
            default:
                throw new Error('Unexpected type, report to Github issues.');
        }
    }
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
    const pathToScraper = path.join('./scripts', 'cinemas',scraperName);
    const oldFile = readFileSync(pathToScraper, "utf8");
    const newFile = types + oldFile;
    writeFileSync(pathToScraper, newFile);
}

main();