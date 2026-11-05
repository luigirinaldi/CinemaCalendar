import type { Page } from 'playwright-chromium';

/** Wait for cinema data, not third-party trackers to stop making requests. */
export async function loadProgrammePage(
    page: Page,
    url: string,
    ready: () => boolean,
    label: string,
    timeoutMs = 30_000
): Promise<void> {
    let status: number | undefined;
    try {
        const response = await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: timeoutMs,
        });
        status = response?.status();
        await page.waitForFunction(ready, undefined, { timeout: timeoutMs });
    } catch (cause) {
        const html = await page.content().catch(() => '');
        if (
            status === 401 ||
            status === 403 ||
            status === 429 ||
            /<title>\s*(?:Just a moment|Access denied)|cf-chl-|challenge-platform|verify you are human/i.test(
                html
            )
        ) {
            throw new Error(
                `${label} access denied${status ? ` (HTTP ${status})` : ''}. The website's access check did not complete; existing stored screenings are retained.`,
                { cause }
            );
        }
        throw new Error(
            `${label} did not expose the expected programme data at ${url}`,
            { cause }
        );
    }
}
