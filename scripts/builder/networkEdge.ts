import { isIP } from 'node:net';
import { gunzipSync, inflateSync, brotliDecompressSync } from 'node:zlib';
import { publicAddress, publicUrl } from './networkPolicy';
export { publicAddress, publicUrl } from './networkPolicy';

export interface EdgeConnection {
    read(buffer: Uint8Array): Promise<number | null>;
    write(buffer: Uint8Array): Promise<number>;
    close(): void;
}
export interface EdgeNetwork {
    resolveDns(hostname: string, type: 'A' | 'AAAA'): Promise<string[]>;
    connect(options: {
        hostname: string;
        port: number;
    }): Promise<EdgeConnection>;
    startTls(
        connection: EdgeConnection,
        options: { hostname: string; alpnProtocols: string[] }
    ): Promise<EdgeConnection>;
}
declare const Deno: EdgeNetwork;

const HEADER_LIMIT = 65536;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
function join(parts: Uint8Array[], size: number) {
    const result = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) {
        result.set(part, offset);
        offset += part.length;
    }
    return result;
}

/** Bounded HTTP/1.1 framing over a socket already pinned to a checked address. */
class SocketReader {
    private buffer = new Uint8Array(0);
    constructor(private connection: EdgeConnection) {}
    private async more() {
        const bytes = new Uint8Array(32768);
        const size = await this.connection.read(bytes);
        if (size === null) return false;
        if (!size) throw new Error('Empty socket read');
        this.buffer = join(
            [this.buffer, bytes.subarray(0, size)],
            this.buffer.length + size
        );
        return true;
    }
    async line(): Promise<string> {
        while (true) {
            for (let i = 0; i + 1 < this.buffer.length; i++) {
                if (this.buffer[i] !== 13 || this.buffer[i + 1] !== 10)
                    continue;
                if (i > HEADER_LIMIT)
                    throw new Error('Website header exceeds limit');
                const line = decoder.decode(this.buffer.subarray(0, i));
                this.buffer = this.buffer.slice(i + 2);
                return line;
            }
            if (this.buffer.length > HEADER_LIMIT)
                throw new Error('Website header exceeds limit');
            if (!(await this.more()))
                throw new Error('Truncated HTTP response');
        }
    }
    async exact(size: number): Promise<Uint8Array> {
        const parts: Uint8Array[] = [];
        let left = size;
        while (left) {
            if (!this.buffer.length && !(await this.more()))
                throw new Error('Truncated HTTP response body');
            const take = Math.min(left, this.buffer.length);
            parts.push(this.buffer.slice(0, take));
            this.buffer = this.buffer.slice(take);
            left -= take;
        }
        return join(parts, size);
    }
    async body(headers: Headers, maxBytes: number): Promise<Uint8Array> {
        const transfer = headers.get('transfer-encoding');
        const length = headers.get('content-length');
        if (transfer && length !== null)
            throw new Error('Ambiguous HTTP body framing');
        if (transfer && transfer.toLowerCase() !== 'chunked')
            throw new Error('Unsupported HTTP transfer encoding');
        if (length !== null) {
            if (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)))
                throw new Error('Invalid Content-Length');
            if (Number(length) > maxBytes)
                throw new Error('Website response exceeds size limit');
            return this.exact(Number(length));
        }
        const parts: Uint8Array[] = [];
        let size = 0;
        if (transfer) {
            for (let count = 0; count < 65536; count++) {
                const line = await this.line();
                if (!/^[a-f0-9]+(?:;[^\r\n]*)?$/i.test(line))
                    throw new Error('Invalid HTTP chunk size');
                const length = parseInt(line.split(';')[0], 16);
                if (!Number.isSafeInteger(length) || size + length > maxBytes)
                    throw new Error('Website response exceeds size limit');
                if (!length) {
                    let trailerBytes = 0;
                    while (true) {
                        const trailer = await this.line();
                        trailerBytes += trailer.length + 2;
                        if (trailerBytes > HEADER_LIMIT)
                            throw new Error('HTTP trailers exceed limit');
                        if (!trailer) return join(parts, size);
                    }
                }
                parts.push(await this.exact(length));
                size += length;
                if (decoder.decode(await this.exact(2)) !== '\r\n')
                    throw new Error('Invalid HTTP chunk terminator');
            }
            throw new Error('HTTP chunk count exceeds limit');
        }
        while (true) {
            size += this.buffer.length;
            if (size > maxBytes)
                throw new Error('Website response exceeds size limit');
            parts.push(this.buffer);
            this.buffer = new Uint8Array(0);
            if (!(await this.more())) return join(parts, size);
        }
    }
}

/** Native Deno sockets avoid the unsupported Node ClientRequest.lookup option.
 * TCP connects only to a validated IP; TLS still verifies the original hostname.
 */
export function createEdgePublicFetch(
    network: EdgeNetwork,
    maxBytes = 16 * 1024 * 1024,
    timeoutMs = 12000
) {
    return async function request(
        input: string,
        redirects = 0
    ): Promise<Response> {
        if (redirects > 5) throw new Error('Too many website redirects');
        const url = publicUrl(input);
        const hostname = url.hostname.replace(/^\[|\]$/g, '');
        let connection: EdgeConnection | undefined;
        let expired = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const checkDeadline = () => {
            if (expired) throw new Error('Website request timed out');
        };
        const operation = async () => {
            const addresses = isIP(hostname)
                ? [hostname]
                : (
                      await Promise.allSettled([
                          network.resolveDns(hostname, 'A'),
                          network.resolveDns(hostname, 'AAAA'),
                      ])
                  ).flatMap((result) =>
                      result.status === 'fulfilled' ? result.value : []
                  );
            checkDeadline();
            if (
                !addresses.length ||
                addresses.some((address) => !publicAddress(address))
            )
                throw new Error(
                    'Website resolves to a private or unsupported network address'
                );
            connection = await network.connect({
                hostname: addresses[0],
                port:
                    Number(url.port) || (url.protocol === 'https:' ? 443 : 80),
            });
            if (expired) {
                connection.close();
                checkDeadline();
            }
            if (url.protocol === 'https:') {
                connection = await network.startTls(connection, {
                    hostname,
                    alpnProtocols: ['http/1.1'],
                });
                if (expired) {
                    connection.close();
                    checkDeadline();
                }
            }
            const outgoing = encoder.encode(
                `GET ${url.pathname}${url.search} HTTP/1.1\r\nHost: ${url.host}\r\nUser-Agent: CinemaCalendar-ScraperBuilder/1.0\r\nAccept: */*\r\nAccept-Encoding: identity\r\nConnection: close\r\n\r\n`
            );
            for (let written = 0; written < outgoing.length; ) {
                const size = await connection.write(outgoing.subarray(written));
                if (size <= 0) throw new Error('HTTP request write failed');
                written += size;
            }
            const reader = new SocketReader(connection);
            let status = 0;
            let headers = new Headers();
            for (let count = 0; count < 6; count++) {
                const first = await reader.line();
                const match = /^HTTP\/1\.[01] ([1-5]\d{2})(?: .*)?$/.exec(
                    first
                );
                if (!match) throw new Error('Invalid HTTP status line');
                status = Number(match[1]);
                headers = new Headers();
                let headerBytes = first.length;
                while (true) {
                    const line = await reader.line();
                    headerBytes += line.length + 2;
                    if (headerBytes > HEADER_LIMIT)
                        throw new Error('Website headers exceed limit');
                    if (!line) break;
                    const colon = line.indexOf(':');
                    if (colon < 1 || /^\s/.test(line))
                        throw new Error('Invalid HTTP header');
                    headers.append(
                        line.slice(0, colon),
                        line.slice(colon + 1).trim()
                    );
                }
                if (status >= 200) break;
                if (status === 101 || count === 5)
                    throw new Error('Unsupported HTTP informational response');
            }
            const location = headers.get('location');
            if ([301, 302, 303, 307, 308].includes(status) && location) {
                connection.close();
                connection = undefined;
                return { redirect: new URL(location, url).href };
            }
            let body = [204, 205, 304].includes(status)
                ? new Uint8Array(0)
                : await reader.body(headers, maxBytes);
            const encoding = headers.get('content-encoding')?.toLowerCase();
            if (encoding === 'gzip')
                body = new Uint8Array(
                    gunzipSync(body, { maxOutputLength: maxBytes })
                );
            else if (encoding === 'deflate')
                body = new Uint8Array(
                    inflateSync(body, { maxOutputLength: maxBytes })
                );
            else if (encoding === 'br')
                body = new Uint8Array(
                    brotliDecompressSync(body, { maxOutputLength: maxBytes })
                );
            else if (encoding && encoding !== 'identity')
                throw new Error('Unsupported HTTP content encoding');
            for (const header of [
                'set-cookie',
                'content-length',
                'content-encoding',
                'transfer-encoding',
                'connection',
            ])
                headers.delete(header);
            const response = new Response(
                [204, 205, 304].includes(status) ? null : new Uint8Array(body),
                { status, headers }
            );
            Object.defineProperty(response, 'url', { value: url.href });
            return { response };
        };
        try {
            const result = await Promise.race([
                operation(),
                new Promise<never>((_, reject) => {
                    timer = setTimeout(() => {
                        expired = true;
                        try {
                            connection?.close();
                        } catch {
                            /* already closed */
                        }
                        reject(new Error('Website request timed out'));
                    }, timeoutMs);
                }),
            ]);
            if (result.redirect) {
                if (timer) clearTimeout(timer);
                return request(result.redirect, redirects + 1);
            }
            return result.response!;
        } finally {
            if (timer) clearTimeout(timer);
            try {
                connection?.close();
            } catch {
                /* already closed */
            }
        }
    };
}

export const publicFetch = (input: string, redirects = 0) =>
    createEdgePublicFetch(Deno, 2 * 1024 * 1024)(input, redirects);
export const publicProgrammeFetch = (input: string) =>
    createEdgePublicFetch(Deno)(input);
