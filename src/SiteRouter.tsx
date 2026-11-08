import { lazy, Suspense, useSyncExternalStore } from 'react';

const App = lazy(() => import('./App'));
const ScraperBuilder = lazy(() => import('./builder/ScraperBuilder'));
function subscribe(callback: () => void) {
    window.addEventListener('hashchange', callback);
    return () => window.removeEventListener('hashchange', callback);
}
export default function SiteRouter() {
    const hash = useSyncExternalStore(
        subscribe,
        () => window.location.hash,
        () => ''
    );
    return (
        <Suspense
            fallback={
                <p
                    role="status"
                    className="min-h-screen bg-neutral-950 p-8 text-neutral-300"
                >
                    Loading…
                </p>
            }
        >
            {hash === '#/add-cinema' ||
            new URLSearchParams(location.search).get('builderLogin') === '1' ? (
                <ScraperBuilder />
            ) : (
                <App />
            )}
        </Suspense>
    );
}
