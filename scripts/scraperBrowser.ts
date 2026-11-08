import {
    chromium,
    type Browser,
    type LaunchOptions,
} from 'playwright-chromium';

/** Reuse an installed browser when the Playwright-specific download is absent. */
export async function launchScraperBrowser(
    channel = process.env.BUILDER_BROWSER_CHANNEL,
    launch: (options: LaunchOptions) => Promise<Browser> = (options) =>
        chromium.launch(options)
) {
    const channels = channel ? [channel] : [undefined, 'chrome', 'msedge'];
    for (const candidate of channels) {
        try {
            return await launch({ channel: candidate });
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            if (
                !/Executable doesn't exist|distribution .*not found|browser.*not found/i.test(
                    message
                )
            )
                throw error;
        }
    }
    throw new Error(
        'JavaScript inspection needs a browser. Install Chromium with npx playwright install chromium, or set BUILDER_BROWSER_CHANNEL=chrome (or msedge) to use an installed browser, then restart the service. Basic HTTP inspection works without a browser.'
    );
}
