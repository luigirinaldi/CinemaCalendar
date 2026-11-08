import test from 'node:test';
import assert from 'node:assert/strict';
import type { Page } from 'playwright-chromium';
import {
    isProgrammeAccessCheck,
    loadProgrammePage,
    ProgrammePageError,
} from '../scripts/browserProgramme';

const normal = `<title>Buy cinema tickets for 24 Hour Party People | BFI Southbank</title>
<h1>24 Hour Party People</h1><script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script>`;

test('Cloudflare JavaScript detection on a normal film page is not an access refusal', () => {
    assert.equal(isProgrammeAccessCheck(normal, 200), false);
    assert.equal(
        isProgrammeAccessCheck(
            '<h1>A film about how to verify you are human</h1>'
        ),
        false
    );
    assert.equal(
        isProgrammeAccessCheck('<title>Just a moment...</title>', 200),
        true
    );
    assert.equal(
        isProgrammeAccessCheck(
            '<title>Film</title><form id="challenge-form"></form>',
            200
        ),
        true
    );
    assert.equal(
        isProgrammeAccessCheck(
            '<title>Attention Required! | Cloudflare</title>',
            200
        ),
        true
    );
    assert.equal(isProgrammeAccessCheck(normal, 403), true);
});

test('HTTP 200 missing programme data is classified separately from a real access check', async () => {
    const page = (html: string): Page =>
        ({
            goto: async () => ({ status: () => 200 }),
            waitForFunction: async () => {
                throw new Error('Programme timeout');
            },
            content: async () => html,
        }) as unknown as Page;
    await assert.rejects(
        loadProgrammePage(
            page(normal),
            'https://cinema.test/film',
            () => false,
            'Film'
        ),
        (error: unknown) =>
            error instanceof ProgrammePageError &&
            error.reason === 'programme' &&
            error.status === 200 &&
            !error.message.includes('access denied')
    );
    await assert.rejects(
        loadProgrammePage(
            page('<title>Just a moment...</title>'),
            'https://cinema.test/film',
            () => false,
            'Film'
        ),
        (error: unknown) =>
            error instanceof ProgrammePageError &&
            error.reason === 'access' &&
            error.status === 200
    );
});
