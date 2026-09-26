// Display helpers for the Admin Summary (TesterQuestionTypeSummaryView).

// The API sends achievement unrounded; it is rounded only here, for
// display, so values under 1% (e.g. 8 of 1,836 = 0.44%) show as 0.4%
// instead of 0%. Colour thresholds should keep using the raw number.
export function formatAchievementPct(value: number): string {
    return `${(Number.isFinite(value) ? value : 0).toFixed(1)}%`;
}

export interface PageSlice<T> {
    items: T[];
    /** The page actually shown - clamped into 1..totalPages. */
    page: number;
    totalPages: number;
    total: number;
    /** 1-based position of the first/last row shown; both 0 when empty. */
    rangeStart: number;
    rangeEnd: number;
}

// Client-side paging of an already-complete list (the By Tester rows come
// back whole from the API). An out-of-range page - e.g. after a refetch
// returns fewer rows - is clamped rather than showing an empty page.
export function paginate<T>(items: T[], page: number, pageSize: number): PageSlice<T> {
    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const current = Math.min(Math.max(1, page), totalPages);
    const start = (current - 1) * pageSize;
    const pageItems = items.slice(start, start + pageSize);
    return {
        items: pageItems,
        page: current,
        totalPages,
        total,
        rangeStart: total === 0 ? 0 : start + 1,
        rangeEnd: start + pageItems.length,
    };
}
