import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { gunzipSync, brotliDecompressSync, inflateSync } from 'node:zlib';

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_PROGRAMME_BYTES = 16 * 1024 * 1024;
export function publicAddress(address: string): boolean {
    if (isIP(address) === 4) {
        const [a, b] = address.split('.').map(Number);
        return !(
            a === 0 ||
            a === 10 ||
            a === 127 ||
            a >= 224 ||
            (a === 100 && b >= 64 && b <= 127) ||
            (a === 169 && b === 254) ||
            (a === 172 && b >= 16 && b <= 31) ||
            (a === 192 && [0, 168].includes(b)) ||
            (a === 198 && [18, 19, 51].includes(b)) ||
            (a === 203 && b === 0)
        );
    }
    if (isIP(address) === 6)
        return (
            /^[23][0-9a-f]{3}:/i.test(address) &&
            !address.toLowerCase().startsWith('2001:db8:')
        );
    return false;
}
export function publicUrl(input: string) {
    const url = new URL(input);
    const literal = url.hostname.replace(/^\[|\]$/g, '');
    if (isIP(literal) && !publicAddress(literal))
        throw new Error('Private network addresses are not allowed');
    if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        (url.port && !['80', '443'].includes(url.port))
    )
        throw new Error('Use a public HTTP(S) website on a standard port');
    if (
        url.hostname === 'localhost' ||
        /\.(?:localhost|local|internal)$/i.test(url.hostname)
    )
        throw new Error('Private network addresses are not allowed');
    url.hash = '';
    return url;
}

/** Validate every redirect and pin the checked address to prevent DNS rebinding. */
export async function publicFetch(
    input: string,
    redirects = 0
): Promise<Response> {
    return fetchPublicResponse(input, redirects, MAX_BYTES);
}

/** Programmes can contain embedded posters; retain a hard limit without rejecting them. */
export async function publicProgrammeFetch(input: string): Promise<Response> {
    return fetchPublicResponse(input, 0, MAX_PROGRAMME_BYTES);
}

async function fetchPublicResponse(
    input: string,
    redirects: number,
    maxBytes: number
): Promise<Response> {
    if (redirects > 5) throw new Error('Too many website redirects');
    const url = publicUrl(input);
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    const addresses = await lookup(hostname, { all: true });
    if (
        !addresses.length ||
        addresses.some((record) => !publicAddress(record.address))
    )
        throw new Error(
            'Website resolves to a private or unsupported network address'
        );
    const address = addresses[0];
    const result = await new Promise<{
        status: number;
        headers: http.IncomingHttpHeaders;
        body: Buffer;
    }>((resolve, reject) => {
        const request = (url.protocol === 'https:' ? https : http).request(
            url,
            {
                method: 'GET',
                headers: {
                    'user-agent': 'CinemaCalendar-ScraperBuilder/1.0',
                    accept: '*/*',
                    'accept-encoding': 'identity',
                },
                lookup: (_hostname, options, callback) =>
                    options.all
                        ? callback(null, [address])
                        : callback(null, address.address, address.family),
            },
            (response) => {
                const chunks: Buffer[] = [];
                let size = 0;
                response.on('data', (chunk: Buffer) => {
                    size += chunk.length;
                    if (size > maxBytes)
                        request.destroy(
                            new Error(
                                `Website response exceeds ${maxBytes / 1024 / 1024} MB`
                            )
                        );
                    else chunks.push(chunk);
                });
                response.on('error', reject);
                response.on('end', () =>
                    resolve({
                        status: response.statusCode ?? 502,
                        headers: response.headers,
                        body: Buffer.concat(chunks),
                    })
                );
            }
        );
        request.setTimeout(12000, () =>
            request.destroy(new Error('Website request timed out'))
        );
        const deadline = setTimeout(
            () => request.destroy(new Error('Website request timed out')),
            12000
        );
        request.once('close', () => clearTimeout(deadline));
        request.on('error', reject);
        request.end();
    });
    if (
        [301, 302, 303, 307, 308].includes(result.status) &&
        result.headers.location
    )
        return fetchPublicResponse(
            new URL(result.headers.location, url).href,
            redirects + 1,
            maxBytes
        );
    let body = result.body;
    const encoding = result.headers['content-encoding'];
    if (encoding === 'gzip')
        body = gunzipSync(body, { maxOutputLength: maxBytes });
    if (encoding === 'br')
        body = brotliDecompressSync(body, { maxOutputLength: maxBytes });
    if (encoding === 'deflate')
        body = inflateSync(body, { maxOutputLength: maxBytes });
    const headers = new Headers();
    for (const [key, value] of Object.entries(result.headers))
        if (
            value != null &&
            ![
                'set-cookie',
                'content-length',
                'content-encoding',
                'transfer-encoding',
                'connection',
            ].includes(key)
        )
            headers.set(key, Array.isArray(value) ? value.join(', ') : value);
    const response = new Response(
        [204, 205, 304].includes(result.status) ? null : new Uint8Array(body),
        { status: result.status, headers }
    );
    Object.defineProperty(response, 'url', { value: url.href });
    return response;
}
