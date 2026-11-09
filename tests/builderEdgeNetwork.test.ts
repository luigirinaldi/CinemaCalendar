import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import {
    createEdgePublicFetch,
    type EdgeConnection,
    type EdgeNetwork,
} from '../scripts/builder/networkEdge';

const encode = (value: string) => new TextEncoder().encode(value);
function socket(bytes: Uint8Array, fragment = 3) {
    let offset = 0;
    let written = '';
    let closed = false;
    const connection: EdgeConnection = {
        async read(buffer) {
            if (offset === bytes.length) return null;
            const length = Math.min(
                fragment,
                buffer.length,
                bytes.length - offset
            );
            buffer.set(bytes.subarray(offset, offset + length));
            offset += length;
            return length;
        },
        async write(buffer) {
            const length = Math.min(7, buffer.length);
            written += new TextDecoder().decode(buffer.subarray(0, length));
            return length;
        },
        close() {
            closed = true;
        },
    };
    return {
        connection,
        get written() {
            return written;
        },
        get closed() {
            return closed;
        },
    };
}
function fixture(responses: Uint8Array[]) {
    const sockets = responses.map((bytes) => socket(bytes));
    const connected: { hostname: string; port: number }[] = [];
    const tls: { hostname: string; alpnProtocols: string[] }[] = [];
    const network: EdgeNetwork = {
        async resolveDns(_host, type) {
            return type === 'A' ? ['93.184.215.14'] : [];
        },
        async connect(options) {
            connected.push(options);
            return sockets[connected.length - 1].connection;
        },
        async startTls(connection, options) {
            tls.push(options);
            return connection;
        },
    };
    return { network, sockets, connected, tls };
}

test('native Edge client pins TCP to the checked IP while preserving TLS verification and Host', async () => {
    const context = fixture([
        encode(
            'HTTP/1.1 200 OK\r\nContent-Length: 5\r\nSet-Cookie: private=1\r\n\r\nhello'
        ),
    ]);
    const response = await createEdgePublicFetch(context.network)(
        'https://cinema.example/programme?day=1'
    );
    assert.equal(await response.text(), 'hello');
    assert.equal(response.url, 'https://cinema.example/programme?day=1');
    assert.deepEqual(context.connected, [
        { hostname: '93.184.215.14', port: 443 },
    ]);
    assert.deepEqual(context.tls, [
        { hostname: 'cinema.example', alpnProtocols: ['http/1.1'] },
    ]);
    assert.match(
        context.sockets[0].written,
        /^GET \/programme\?day=1 HTTP\/1.1\r\nHost: cinema.example\r\n/
    );
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(context.sockets[0].closed, true);
});

test('native Edge client handles interim responses, fragmented chunks/trailers and compressed bodies', async () => {
    const chunked = fixture([
        encode(
            'HTTP/1.1 103 Early Hints\r\nLink: </a>\r\n\r\nHTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n2;ext=1\r\nhe\r\n3\r\nllo\r\n0\r\nX-Trailer: ignored\r\n\r\n'
        ),
    ]);
    assert.equal(
        await (
            await createEdgePublicFetch(chunked.network)(
                'http://cinema.example/'
            )
        ).text(),
        'hello'
    );
    assert.equal(chunked.tls.length, 0);
    const payload = gzipSync('hello compressed');
    const header = encode(
        `HTTP/1.1 200 OK\r\nContent-Encoding: gzip\r\nContent-Length: ${payload.length}\r\n\r\n`
    );
    const bytes = new Uint8Array(header.length + payload.length);
    bytes.set(header);
    bytes.set(payload, header.length);
    const compressed = fixture([bytes]);
    const result = await createEdgePublicFetch(compressed.network)(
        'https://cinema.example/'
    );
    assert.equal(await result.text(), 'hello compressed');
    assert.equal(result.headers.get('content-encoding'), null);
});

test('native Edge client validates every redirect and blocks private DNS before opening sockets', async () => {
    const context = fixture([
        encode('HTTP/1.1 302 Found\r\nLocation: /films\r\n\r\n'),
        encode('HTTP/1.1 200 OK\r\n\r\nclose delimited'),
    ]);
    const result = await createEdgePublicFetch(context.network)(
        'https://cinema.example/'
    );
    assert.equal(result.url, 'https://cinema.example/films');
    assert.equal(await result.text(), 'close delimited');
    assert.equal(
        context.sockets.every((socket) => socket.closed),
        true
    );
    const privateRedirect = fixture([
        encode(
            'HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1/private\r\n\r\n'
        ),
    ]);
    await assert.rejects(
        createEdgePublicFetch(privateRedirect.network)(
            'https://cinema.example/'
        ),
        /Private network/
    );
    assert.equal(privateRedirect.connected.length, 1);
    const mixed = fixture([]);
    mixed.network.resolveDns = async (_hostname, type) =>
        type === 'A' ? ['93.184.215.14'] : ['::1'];
    await assert.rejects(
        createEdgePublicFetch(mixed.network)('https://cinema.example/'),
        /private or unsupported/
    );
    assert.equal(mixed.connected.length, 0);
});

test('native Edge client rejects truncated, ambiguous, oversized or malformed framing and closes connections', async () => {
    for (const body of [
        'HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nhi',
        'HTTP/1.1 200 OK\r\nContent-Length: 1\r\nTransfer-Encoding: chunked\r\n\r\n',
        'HTTP/1.1 200 OK\r\nContent-Length: 500\r\n\r\n',
        'HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\nnot-hex\r\n',
        'HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n1\r\naXX',
        'HTTP/1.1 200 OK\r\nContent-Length: 1\r\nContent-Length: 2\r\n\r\na',
        'HTTP/1.1 101 Switching Protocols\r\n\r\n',
    ]) {
        const context = fixture([encode(body)]);
        await assert.rejects(
            createEdgePublicFetch(
                context.network,
                100
            )('https://cinema.example/')
        );
        assert.equal(context.sockets[0].closed, true);
    }
    const large = fixture([
        encode('HTTP/1.1 200 OK\r\n\r\n' + 'x'.repeat(101)),
    ]);
    await assert.rejects(
        createEdgePublicFetch(large.network, 100)('https://cinema.example/'),
        /size limit/
    );
});

test('native Edge deadline closes a stalled connection and late connects cannot leak sockets', async () => {
    const stalled = fixture([new Uint8Array(0)]);
    stalled.sockets[0].connection.read = () => new Promise(() => {});
    await assert.rejects(
        createEdgePublicFetch(
            stalled.network,
            100,
            10
        )('https://cinema.example/'),
        /timed out/
    );
    assert.equal(stalled.sockets[0].closed, true);
    const late = fixture([new Uint8Array(0)]);
    let finish: (connection: EdgeConnection) => void = () => {};
    late.network.connect = () =>
        new Promise((resolve) => {
            finish = resolve;
        });
    await assert.rejects(
        createEdgePublicFetch(late.network, 100, 10)('https://cinema.example/'),
        /timed out/
    );
    finish(late.sockets[0].connection);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(late.sockets[0].closed, true);
});
