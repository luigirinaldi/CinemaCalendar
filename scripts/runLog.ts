import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { formatWithOptions } from 'node:util';

/** Keep complete console diagnostics even when terminal scrollback is truncated. */
export function startRunLog(name: string) {
    mkdirSync('.scraper-debug', { recursive: true });
    const path = `.scraper-debug/${name}-${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
    writeFileSync(path, '');
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
        const original = console[method].bind(console);
        console[method] = (...args: unknown[]) => {
            appendFileSync(
                path,
                formatWithOptions({ colors: false }, ...args) + '\n'
            );
            original(...args);
        };
    }
    console.log(`Complete run log: ${path}`);
    return path;
}
