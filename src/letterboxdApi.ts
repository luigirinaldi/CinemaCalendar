export type LetterboxdFilm = {
    slug: string;
    title: string;
    year: number | null;
};

// VITE_FUNCTIONS_URL overrides the functions endpoint (useful for local dev).
// Falls back to the standard Supabase functions URL derived from VITE_SUPABASE_URL.
export const fetchLetterboxdList = async (
    username: string
): Promise<LetterboxdFilm[]> => {
    const functionsUrl =
        import.meta.env.VITE_FUNCTIONS_URL ??
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

    const res = await fetch(`${functionsUrl}/letterboxd-list`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY}`,
        },
        body: JSON.stringify({ username }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
    }
    const { films } = await res.json();
    return films as LetterboxdFilm[];
};
