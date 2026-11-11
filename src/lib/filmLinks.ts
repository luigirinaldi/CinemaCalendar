export function letterboxdFilmUrl(
    slug: string | null | undefined,
    tmdbId: number | null | undefined
): string | null {
    if (slug?.trim())
        return `https://letterboxd.com/film/${encodeURIComponent(slug.trim())}/`;
    return tmdbId != null && Number.isSafeInteger(tmdbId) && tmdbId > 0
        ? `https://letterboxd.com/tmdb/${tmdbId}/`
        : null;
}
