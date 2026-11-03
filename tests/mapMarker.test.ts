import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { cinemaMarkerElement } from '../src/lib/mapMarker';

test('cinema markers stay visible when favicon loading fails, with or without screenings', async () => {
    const window = new Window();
    try {
        for (const available of [false, true]) {
            const marker = cinemaMarkerElement(
                window.document as unknown as Document,
                'Porto Astra',
                'https://www.portoastra.it',
                available,
                3
            );
            const image = marker.querySelector('img')!;
            assert.match(marker.textContent!, /^PA/);
            assert.equal(image.style.display, 'none');
            image.dispatchEvent(new window.Event('load') as unknown as Event);
            assert.equal(image.style.display, 'block');
            image.dispatchEvent(new window.Event('error') as unknown as Event);
            assert.equal(marker.querySelector('img'), null);
            assert.equal(marker.textContent, available ? 'PA3' : 'PA');
            assert.ok(marker.style.background);
            assert.equal(
                marker.querySelectorAll('span').length,
                available ? 1 : 0
            );
        }
    } finally {
        await window.happyDOM.close();
    }
});

test('missing or malformed websites still produce safe, readable markers', async () => {
    const window = new Window();
    try {
        for (const website of [null, 'not a URL', 'javascript:alert(1)']) {
            const marker = cinemaMarkerElement(
                window.document as unknown as Document,
                'Fronte del Porto',
                website,
                true,
                0
            );
            assert.equal(marker.textContent, 'FD');
            assert.equal(marker.querySelector('img'), null);
        }
        const marker = cinemaMarkerElement(
            window.document as unknown as Document,
            '<script>alert(1)</script>',
            null,
            false,
            0
        );
        assert.equal(marker.children.length, 0);
    } finally {
        await window.happyDOM.close();
    }
});
