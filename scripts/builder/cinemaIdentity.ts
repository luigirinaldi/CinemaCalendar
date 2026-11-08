import type { ScraperConfig } from '../../shared/scraperConfig';

function normalized(value: string) {
    return value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}
function website(value: string | null) {
    try {
        const url = new URL(value ?? '');
        return (
            url.hostname.replace(/^www\./, '') +
            url.pathname.replace(/\/+$/, '')
        );
    } catch {
        return '';
    }
}
export function sameCinema(
    config: ScraperConfig,
    candidate: { name: string; location: string | null; website: string | null }
) {
    return (
        (normalized(config.cinema.name) === normalized(candidate.name) &&
            normalized(config.cinema.location) ===
                normalized(candidate.location ?? '')) ||
        (!!website(candidate.website) &&
            website(config.cinema.website) === website(candidate.website))
    );
}
