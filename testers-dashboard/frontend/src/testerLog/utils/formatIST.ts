const IST_FORMATTER = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
});

/**
 * Renders an ISO timestamp (or any Date-parseable string) in IST, e.g.
 * "19 Sep 2026, 6:05 PM". Falls back to the raw value when it isn't a
 * parseable date, since several of these fields also hold plain text
 * like "NA".
 */
export function formatDateTimeIST(value?: string): string {
    if (!value) return "";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    const parts = IST_FORMATTER.formatToParts(date);
    const get = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((p) => p.type === type)?.value ?? "";

    return `${get("day")} ${get("month")} ${get("year")}, ${get("hour")}:${get("minute")} ${get("dayPeriod")}`;
}
