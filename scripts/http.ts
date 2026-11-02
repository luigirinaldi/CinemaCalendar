const RETRY_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const delay = (milliseconds: number) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds));

/** Cinema GETs and read-only GraphQL POSTs only; never use for booking writes. */
export async function fetchPage(
    url: string | URL,
    init: RequestInit = {},
    options: { attempts?: number; timeoutMs?: number } = {}
): Promise<Response> {
    const { attempts = 3, timeoutMs = 20_000 } = options;
    if (!Number.isInteger(attempts) || attempts < 1)
        throw new Error('attempts must be positive');
    for (let attempt = 0; attempt < attempts; attempt++) {
        let response: Response;
        try {
            const timeout = AbortSignal.timeout(timeoutMs);
            response = await fetch(url, {
                ...init,
                signal: init.signal
                    ? AbortSignal.any([init.signal, timeout])
                    : timeout,
            });
        } catch (error) {
            if (init.signal?.aborted || attempt === attempts - 1) throw error;
            await delay(300 * 2 ** attempt);
            continue;
        }
        if (response.ok) return response;
        const retryAfter = response.headers.get('retry-after');
        await response.body?.cancel();
        if (!RETRY_STATUSES.has(response.status) || attempt === attempts - 1)
            throw new Error(
                `HTTP ${response.status} from ${new URL(url).origin}${new URL(url).pathname}`
            );
        const seconds = Number(retryAfter);
        const wait = retryAfter
            ? Number.isFinite(seconds)
                ? seconds * 1000
                : Date.parse(retryAfter) - Date.now()
            : 300 * 2 ** attempt;
        await delay(
            Math.min(10_000, Math.max(0, Number.isFinite(wait) ? wait : 300))
        );
    }
    throw new Error('Request failed');
}

/** Bounded fan-out for cinema detail pages; preserves input ordering. */
export async function mapConcurrent<T, R>(
    items: T[],
    worker: (item: T, index: number) => Promise<R>,
    concurrency = 4
): Promise<R[]> {
    if (!Number.isInteger(concurrency) || concurrency < 1)
        throw new Error('concurrency must be positive');
    const results: R[] = new Array(items.length);
    let next = 0;
    await Promise.all(
        Array.from(
            { length: Math.min(concurrency, items.length) },
            async () => {
                while (next < items.length) {
                    const index = next++;
                    results[index] = await worker(items[index], index);
                }
            }
        )
    );
    return results;
}
