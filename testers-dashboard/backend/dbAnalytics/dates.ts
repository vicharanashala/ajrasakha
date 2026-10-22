// Calendar-date helpers for Database Logs Analytics. Dates are "YYYY-MM-DD"
// strings in IST (the app is India-only and the server stores testDate as
// the IST calendar day). No year cap - any real date is valid.

// Today's IST calendar date. The +5:30 offset is fixed rather than read from
// TZ/Intl so it can't shift on redeploy.
export function getTodayISTDate(now: Date = new Date()): string {
    return new Date(now.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// Whole days added to (or, negative, subtracted from) a "YYYY-MM-DD" date,
// in UTC so DST can never shift it by a day.
export function addDays(iso: string, days: number): string {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt.toISOString().slice(0, 10);
}

// Inclusive date window; an open end is undefined.
export interface DbDateWindow {
    start?: string;
    end?: string;
}

// The window a Date Range selection covers: today, the last 7/30 days ending
// today, or a custom start/end. Null when it doesn't filter ("all", or
// "custom" with neither date).
export function dbDateWindow(
    dateRange: string,
    customStart: string | undefined,
    customEnd: string | undefined,
    now: Date = new Date(),
): DbDateWindow | null {
    if (!dateRange || dateRange === 'all') return null;
    if (dateRange === 'custom') {
        if (!customStart && !customEnd) return null;
        return { start: customStart || undefined, end: customEnd || undefined };
    }
    const today = getTodayISTDate(now);
    if (dateRange === 'today') return { start: today, end: today };
    if (dateRange === '7days') return { start: addDays(today, -6), end: today };
    if (dateRange === '30days') return { start: addDays(today, -29), end: today };
    return null;
}

// The equal-length window immediately before the selected one, for the
// "vs previous period" comparison. Null when there is nothing well-defined
// to compare against: All Dates, or a custom range open at either end.
export function dbPreviousPeriodWindow(
    dateRange: string,
    customStart: string | undefined,
    customEnd: string | undefined,
    now: Date = new Date(),
): Required<DbDateWindow> | null {
    if (dateRange === 'custom' && (!customStart || !customEnd)) return null;
    const current = dbDateWindow(dateRange, customStart, customEnd, now);
    if (!current?.start || !current.end) return null;
    const lengthDays =
        Math.round((Date.parse(`${current.end}T00:00:00Z`) - Date.parse(`${current.start}T00:00:00Z`)) / 86_400_000) + 1;
    if (lengthDays < 1) return null;
    const end = addDays(current.start, -1);
    return { start: addDays(end, -(lengthDays - 1)), end };
}
