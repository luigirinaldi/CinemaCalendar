import {
    readdir,
    readFile,
    writeFile,
    mkdir,
    copyFile,
    symlink,
    rm,
} from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';
import type { ScraperConfig, GeneratedFiles } from '../../shared/scraperConfig';
import { fetchAllPages } from '../../src/lib/pagination';

import { sameCinema } from './cinemaIdentity';
export { sameCinema } from './cinemaIdentity';

export async function checkDuplicate(
    config: ScraperConfig,
    root: string,
    url: string,
    key: string
) {
    if (!url || !key)
        throw new Error(
            'Public Supabase catalogue settings are required to check for existing cinemas'
        );
    const client = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const rows = await fetchAllPages(async (from, to) => {
        const result = await client
            .from('new_cinemas')
            .select('id,name,location,website', { count: 'exact' })
            .order('id')
            .range(from, to)
            .abortSignal(AbortSignal.timeout(12000));
        if (result.error)
            throw new Error(`Catalogue check failed: ${result.error.message}`);
        return { data: result.data ?? [], count: result.count };
    });
    if (rows.some((row) => sameCinema(config, row)))
        throw new Error('This cinema already exists in the database');
    const files = await readdir(path.join(root, 'scripts/cinemas'));
    if (
        files.some(
            (file) => file.toLowerCase() === config.filename.toLowerCase()
        )
    )
        throw new Error('A scraper with that filename already exists');
    const testPath = path.join(
        root,
        'tests',
        config.filename.replace(/\.ts$/, '.test.ts')
    );
    try {
        await readFile(testPath);
        throw new Error('A test with that filename already exists');
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    for (const file of files.filter((name) => name.endsWith('.ts'))) {
        const source = ts.createSourceFile(
            file,
            await readFile(path.join(root, 'scripts/cinemas', file), 'utf8'),
            ts.ScriptTarget.Latest,
            true
        );
        const constants = new Map(
            source.statements
                .filter(ts.isVariableStatement)
                .flatMap((statement) =>
                    statement.declarationList.declarations.map(
                        (declaration) =>
                            [
                                declaration.name.getText(source),
                                declaration.initializer,
                            ] as const
                    )
                )
        );
        const literal = (node: ts.Expression | undefined): string =>
            node &&
            (ts.isStringLiteral(node) ||
                ts.isNoSubstitutionTemplateLiteral(node))
                ? node.text
                : node && ts.isIdentifier(node)
                  ? literal(constants.get(node.text))
                  : '';
        const object = constants.get('CINEMA');
        if (object && ts.isObjectLiteralExpression(object)) {
            const properties = Object.fromEntries(
                object.properties
                    .filter(ts.isPropertyAssignment)
                    .map((property) => [
                        property.name.getText(source),
                        literal(property.initializer),
                    ])
            );
            if (
                sameCinema(config, {
                    name: properties.name ?? '',
                    location: properties.location ?? '',
                    website: properties.website ?? '',
                })
            )
                throw new Error(`A scraper already exists: ${file}`);
        }
        const generated = constants.get('config');
        if (generated && source.text.includes('runConfiguredScraper')) {
            // Generated config is a JSON literal followed by a satisfies clause.
            const expression = ts.isSatisfiesExpression(generated)
                ? generated.expression
                : generated;
            try {
                const existing = JSON.parse(
                    expression.getText(source)
                ) as ScraperConfig;
                if (sameCinema(config, existing.cinema))
                    throw new Error(`A scraper already exists: ${file}`);
            } catch (error) {
                if (
                    error instanceof Error &&
                    error.message.startsWith('A scraper')
                )
                    throw error;
            }
        }
    }
}

export function command(
    cwd: string,
    executable: string,
    args: string[],
    timeout = 90000,
    outputLimit = 12000
) {
    return new Promise<string>((resolve, reject) => {
        const env = Object.fromEntries(
            Object.entries(process.env).filter(
                ([key]) => !/TOKEN|PASSWORD|SECRET|KEY|SUPABASE/i.test(key)
            )
        );
        const child = spawn(executable, args, {
            cwd,
            env,
            shell: false,
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let output = '';
        const collect = (chunk: Buffer) => {
            output = (output + chunk.toString()).slice(-outputLimit);
        };
        child.stdout.on('data', collect);
        child.stderr.on('data', collect);
        const timer = setTimeout(() => {
            child.kill();
            reject(new Error('Repository check timed out'));
        }, timeout);
        child.on('error', (error) => {
            clearTimeout(timer);
            reject(error);
        });
        child.on('exit', (code) => {
            clearTimeout(timer);
            if (code === 0) resolve(output);
            else reject(new Error(output || `Check exited with code ${code}`));
        });
    });
}

/** Generated files are checked in an ignored workspace, never in the live checkout. */
export async function checkGeneratedFiles(root: string, files: GeneratedFiles) {
    const temp = path.join(
        root,
        '.scraper-debug',
        'builder-runs',
        randomUUID()
    );
    if (
        path.dirname(temp) !== path.join(root, '.scraper-debug', 'builder-runs')
    )
        throw new Error('Invalid validation workspace');
    await mkdir(temp, { recursive: true });
    try {
        const names = (
            await command(
                root,
                'git',
                ['ls-files', '-co', '--exclude-standard'],
                90000,
                1000000
            )
        )
            .trim()
            .split(/\r?\n/)
            .filter(Boolean);
        for (const name of names) {
            if (
                name.startsWith('.env') ||
                name.startsWith('.scraper-debug/') ||
                name.startsWith('.git/') ||
                name.startsWith('node_modules/')
            )
                continue;
            const target = path.resolve(temp, name);
            if (!target.startsWith(temp + path.sep))
                throw new Error('Invalid repository path');
            await mkdir(path.dirname(target), { recursive: true });
            await copyFile(path.join(root, name), target);
        }
        await symlink(
            path.join(root, 'node_modules'),
            path.join(temp, 'node_modules'),
            process.platform === 'win32' ? 'junction' : 'dir'
        );
        for (const [name, content] of [
            [files.scraperPath, files.scraper],
            [files.testPath, files.test],
        ]) {
            const target = path.join(temp, name);
            await mkdir(path.dirname(target), { recursive: true });
            await writeFile(target, content);
        }
        // Keep incremental build state inside this validation workspace.
        for (const filename of ['tsconfig.app.json', 'tsconfig.node.json']) {
            const contents = await readFile(path.join(temp, filename), 'utf8');
            await writeFile(
                path.join(temp, filename),
                contents.replace(/\.\/node_modules\/\.tmp\//g, './.typecache/')
            );
        }
        await mkdir(path.join(temp, '.typecache'));
        await command(temp, process.execPath, [
            path.join(root, 'node_modules/typescript/bin/tsc'),
            '-b',
            '--force',
        ]);
        await command(temp, process.execPath, [
            path.join(root, 'node_modules/typescript/bin/tsc'),
            '-p',
            'tsconfig.scripts.json',
        ]);
        const tests = (await readdir(path.join(temp, 'tests')))
            .filter((name) => name.endsWith('.test.ts'))
            .map((name) => `tests/${name}`);
        const output = await command(temp, process.execPath, [
            path.join(root, 'node_modules/tsx/dist/cli.mjs'),
            '--tsconfig',
            'tsconfig.scripts.json',
            '--test',
            ...tests,
        ]);
        await command(temp, process.execPath, [
            path.join(root, 'node_modules/eslint/bin/eslint.js'),
            files.scraperPath,
            files.testPath,
        ]);
        return output;
    } finally {
        // This path is created above under the known ignored workspace root.
        await rm(temp, { recursive: true, force: true });
    }
}
