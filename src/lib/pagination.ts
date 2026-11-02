/** Advance by the rows actually returned, including when the server cap is lower. */
export async function fetchAllPages<T>(
    fetchPage: (
        from: number,
        to: number
    ) => Promise<{ data: T[]; count: number | null }>,
    pageSize = 1000
): Promise<T[]> {
    const rows: T[] = [];
    while (true) {
        const { data, count } = await fetchPage(
            rows.length,
            rows.length + pageSize - 1
        );
        rows.push(...data);
        if (data.length === 0 || (count !== null && rows.length >= count))
            return rows;
        // Without a count an empty page is required: a short page may be a server cap.
    }
}
