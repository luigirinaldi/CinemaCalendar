import test from 'node:test';
import assert from 'node:assert/strict';
import type { Page } from 'playwright-chromium';
import { chromium } from 'playwright-extra';
import type { Kysely } from 'kysely';
import type { DB } from '../scripts/database';
import {
    fetchFilmInfo,
    updateLetterboxdMeta,
} from '../scripts/letterboxd_meta';

test('Letterboxd verifies a film redirect and retains a resolved slug if ratings fail', async (t) => {
    t.mock.method(console, 'error', () => {});
    const page = {
        goto: async (url: string) => ({
            status: () => (url.includes('/csi/') ? 403 : 200),
        }),
        waitForURL: async (matches: (url: URL) => boolean) => {
            assert.equal(
                matches(new URL('https://letterboxd.com/login/')),
                false
            );
            assert.equal(
                matches(new URL('https://other.example/film/wrong/')),
                false
            );
            assert.equal(
                matches(new URL('https://letterboxd.com/film/correct/')),
                true
            );
        },
        url: () => 'https://letterboxd.com/film/correct/?source=tmdb',
    } as unknown as Page;
    assert.deepEqual(
        await fetchFilmInfo(page, {
            id: 10,
            title: 'Test',
            letterboxd_slug: null,
        }),
        { film_id: 10, slug: 'correct' }
    );
});

test('a blocked Letterboxd lookup cannot become a slug or a successful enrichment run', async (t) => {
    t.mock.method(console, 'error', () => {});
    t.mock.method(console, 'log', () => {});
    let closed = false;
    const page = {
        goto: async () => ({ status: () => 403 }),
    } as unknown as Page;
    t.mock.method(chromium, 'launch', async () => ({
        newContext: async () => ({ newPage: async () => page }),
        close: async () => {
            closed = true;
        },
    }));
    const query = {
        where: () => query,
        select: () => query,
        execute: async () => [{ id: 10, title: 'Test', letterboxd_slug: null }],
    };
    const db = { selectFrom: () => query } as unknown as Kysely<DB>;
    await assert.rejects(
        updateLetterboxdMeta(db, true),
        /failed for all 1 candidate films/
    );
    assert.equal(closed, true);
});
