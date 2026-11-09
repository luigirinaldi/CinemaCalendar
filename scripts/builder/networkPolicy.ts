import { isIP } from 'node:net';

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
