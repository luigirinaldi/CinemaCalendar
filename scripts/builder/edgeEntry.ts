import { createEdgeHandler } from './edgeHandler';
import { createEdgeStore } from './edgeStore';

// Kept outside the app build; buildEdge.mjs emits a self-contained Deno module.
declare const Deno: {
    env: { get(name: string): string | undefined };
    serve(handler: (request: Request) => Promise<Response>): unknown;
};
const required = (name: string) => {
    const value = Deno.env.get(name);
    if (!value) throw new Error(`Missing Edge Function secret: ${name}`);
    return value;
};
const page = new URL(required('BUILDER_PAGE_URL'));
if (
    page.protocol !== 'https:' &&
    !['localhost', '127.0.0.1'].includes(page.hostname)
)
    throw new Error('BUILDER_PAGE_URL must use HTTPS');
const callback = new URL(page);
callback.hash = '';
callback.search = '?builderLogin=1';
const url = required('SUPABASE_URL');
const secret = required('BUILDER_SESSION_KEY');
Deno.serve(
    createEdgeHandler({
        store: createEdgeStore(
            url,
            required('SUPABASE_SERVICE_ROLE_KEY'),
            secret
        ),
        supabaseUrl: url,
        publicKey: required('SUPABASE_ANON_KEY'),
        rateSalt: secret,
        origins: (Deno.env.get('BUILDER_ALLOWED_ORIGINS') || page.origin)
            .split(',')
            .map((origin) => new URL(origin.trim()).origin),
        settings: {
            clientId: Deno.env.get('BUILDER_GITHUB_CLIENT_ID') || '',
            clientSecret: Deno.env.get('BUILDER_GITHUB_CLIENT_SECRET') || '',
            callbackUrl: callback.href,
            owner: Deno.env.get('BUILDER_GITHUB_OWNER') || 'luigirinaldi',
            repo: Deno.env.get('BUILDER_GITHUB_REPO') || 'CinemaCalendar',
            base: Deno.env.get('BUILDER_GITHUB_BASE') || 'dev',
        },
    })
);
