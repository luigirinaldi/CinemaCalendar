import type { BuilderSession } from './github';
import type {
    ScraperConfig,
    ValidationResult,
} from '../../shared/scraperConfig';

export interface StoredValidation {
    id: string;
    session_id: string;
    config: ScraperConfig;
    result: ValidationResult;
    base_sha: string;
    expires_at: string;
    state: 'ready' | 'submitting' | 'submitted' | 'failed';
    submitted?: { url: string; branch: string } | null;
}
export interface BuilderStore {
    rate(key: string, limit: number, seconds: number): Promise<void>;
    readSession(id: string): Promise<BuilderSession | null>;
    saveSession(id: string, session: BuilderSession): Promise<void>;
    lockSession(id: string, lock: string): Promise<boolean>;
    unlockSession(id: string, lock: string): Promise<void>;
    saveValidation(record: StoredValidation): Promise<void>;
    readValidation(
        id: string,
        session: string
    ): Promise<StoredValidation | null>;
    claimValidation(id: string, session: string): Promise<boolean>;
    finishValidation(
        id: string,
        state: 'submitted' | 'failed',
        submitted?: { url: string; branch: string }
    ): Promise<void>;
}

export async function hashToken(value: string): Promise<string> {
    return [
        ...new Uint8Array(
            await crypto.subtle.digest(
                'SHA-256',
                new TextEncoder().encode(value)
            )
        ),
    ]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
}
export async function sessionCipher(secret: string) {
    if (!/^[a-f0-9]{64}$/i.test(secret))
        throw new Error(
            'BUILDER_SESSION_KEY must contain 64 hexadecimal characters'
        );
    const key = await crypto.subtle.importKey(
        'raw',
        Uint8Array.from(secret.match(/../g)!, (pair) => parseInt(pair, 16)),
        'AES-GCM',
        false,
        ['encrypt', 'decrypt']
    );
    return {
        async seal(value: BuilderSession, id: string) {
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const bytes = new Uint8Array(
                await crypto.subtle.encrypt(
                    {
                        name: 'AES-GCM',
                        iv,
                        additionalData: new TextEncoder().encode(id),
                    },
                    key,
                    new TextEncoder().encode(JSON.stringify(value))
                )
            );
            return btoa(String.fromCharCode(...iv, ...bytes));
        },
        async open(value: string, id: string): Promise<BuilderSession> {
            const bytes = Uint8Array.from(atob(value), (char) =>
                char.charCodeAt(0)
            );
            return JSON.parse(
                new TextDecoder().decode(
                    await crypto.subtle.decrypt(
                        {
                            name: 'AES-GCM',
                            iv: bytes.slice(0, 12),
                            additionalData: new TextEncoder().encode(id),
                        },
                        key,
                        bytes.slice(12)
                    )
                )
            ) as BuilderSession;
        },
    };
}

/** Server credentials stay in the function. RLS denies access from site keys. */
export function createEdgeStore(
    url: string,
    serviceKey: string,
    secret: string,
    fetcher = fetch
): BuilderStore {
    if (!/^[a-f0-9]{64}$/i.test(secret))
        throw new Error(
            'BUILDER_SESSION_KEY must contain 64 hexadecimal characters'
        );
    const cipher = sessionCipher(secret);
    async function rest<T>(
        path: string,
        method = 'GET',
        body?: unknown
    ): Promise<T> {
        const response = await fetcher(
            `${url.replace(/\/$/, '')}/rest/v1/${path}`,
            {
                method,
                headers: {
                    apikey: serviceKey,
                    Authorization: `Bearer ${serviceKey}`,
                    'Content-Type': 'application/json',
                    Prefer: 'return=representation,resolution=merge-duplicates',
                },
                body: body === undefined ? undefined : JSON.stringify(body),
                signal: AbortSignal.timeout(12000),
            }
        );
        if (!response.ok)
            throw new Error(
                `Builder storage failed (HTTP ${response.status}); check the migration and service credentials`
            );
        return response.status === 204
            ? (undefined as T)
            : ((await response.json()) as T);
    }
    const sessionPath = (id: string) =>
        `scraper_builder_sessions?id=eq.${encodeURIComponent(id)}`;
    return {
        async rate(key, limit, seconds) {
            if (
                !(await rest<boolean>(
                    'rpc/scraper_builder_rate_limit',
                    'POST',
                    { bucket: key, max_calls: limit, window_seconds: seconds }
                ))
            )
                throw new Error('Builder rate limit reached. Try again later.');
        },
        async readSession(id) {
            const rows = await rest<{ payload: string }[]>(
                `${sessionPath(id)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=payload`
            );
            // Rotating the encryption key invalidates old sessions cleanly.
            return rows[0]
                ? (await cipher).open(rows[0].payload, id).catch(() => null)
                : null;
        },
        async saveSession(id, session) {
            await rest('scraper_builder_sessions', 'POST', {
                id,
                payload: await (await cipher).seal(session, id),
                expires_at: new Date(session.expires).toISOString(),
            });
        },
        async lockSession(id, lock) {
            const rows = await rest<unknown[]>(
                `${sessionPath(id)}&locked_until=lt.${encodeURIComponent(new Date().toISOString())}`,
                'PATCH',
                {
                    lock_id: lock,
                    locked_until: new Date(Date.now() + 150000).toISOString(),
                }
            );
            return rows.length === 1;
        },
        async unlockSession(id, lock) {
            await rest(
                `${sessionPath(id)}&lock_id=eq.${encodeURIComponent(lock)}`,
                'PATCH',
                { lock_id: null, locked_until: '1970-01-01T00:00:00Z' }
            );
        },
        async saveValidation(record) {
            await rest('scraper_builder_validations', 'POST', record);
        },
        async readValidation(id, session) {
            const rows = await rest<StoredValidation[]>(
                `scraper_builder_validations?id=eq.${encodeURIComponent(id)}&session_id=eq.${encodeURIComponent(session)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}`
            );
            return rows[0] ?? null;
        },
        async claimValidation(id, session) {
            const rows = await rest<unknown[]>(
                `scraper_builder_validations?id=eq.${encodeURIComponent(id)}&session_id=eq.${encodeURIComponent(session)}&state=eq.ready&expires_at=gt.${encodeURIComponent(new Date().toISOString())}`,
                'PATCH',
                { state: 'submitting' }
            );
            return rows.length === 1;
        },
        async finishValidation(id, state, submitted) {
            await rest(
                `scraper_builder_validations?id=eq.${encodeURIComponent(id)}`,
                'PATCH',
                { state, ...(submitted ? { submitted } : {}) }
            );
        },
    };
}
