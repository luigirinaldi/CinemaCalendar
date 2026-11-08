import type { Page } from 'playwright-chromium';
import { parse } from 'node-html-parser';

export class ProgrammePageError extends Error {
    constructor(
        message: string,
        public readonly reason: 'access' | 'navigation' | 'programme',
        public readonly status: number | undefined,
        cause: unknown
    ) {
        super(message, { cause });
        this.name = 'ProgrammePageError';
    }
}

export function isProgrammeAccessCheck(html: string, status?: number): boolean {
    if (status === 401 || status === 403 || status === 429) return true;
    const root = parse(html);
    const title = root.querySelector('title')?.textContent.trim() || '';
    // Cloudflare's JavaScript detection script is also injected into normal pages.
    // Its URL alone is not evidence that the programme was replaced by a challenge.
    return (
        /^(?:Just a moment[.!…\s]*|Access denied(?:\s*[|–-].*)?|Attention Required!?\s*\|\s*Cloudflare)$/i.test(
            title
        ) ||
        root.querySelector(
            '#challenge-form, #challenge-running, #challenge-stage, .cf-error-details'
        ) !== null
    );
}

/** Wait for cinema data, not third-party trackers to stop making requests. */
export async function loadProgrammePage(
    page: Page,
    url: string,
    ready: () => boolean,
    label: string,
    timeoutMs = 30_000
): Promise<void> {
    let status: number | undefined;
    let navigated = false;
    try {
        const response = await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: timeoutMs,
        });
        status = response?.status();
        navigated = true;
        await page.waitForFunction(ready, undefined, { timeout: timeoutMs });
    } catch (cause) {
        const html = await page.content().catch(() => '');
        if (isProgrammeAccessCheck(html, status)) {
            throw new ProgrammePageError(
                `${label} access denied${status ? ` (HTTP ${status})` : ''}. The website's access check did not complete; existing stored screenings are retained.`,
                'access',
                status,
                cause
            );
        }
        throw new ProgrammePageError(
            `${label} did not expose the expected programme data at ${url}`,
            navigated ? 'programme' : 'navigation',
            status,
            cause
        );
    }
}
