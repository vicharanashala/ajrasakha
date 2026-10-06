export function parseToMs(str?: string, defaultDate?: string): number | null {
    if (!str || !str.trim()) return null;
    const s = str.trim();

    if (s.includes("-") || s.includes("/")) {
        const parsed = Date.parse(s.includes("T") ? s : s.replace(" ", "T"));
        if (!isNaN(parsed)) return parsed;
    }

    const parts = s.split(":").map(Number);
    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        if (defaultDate && (defaultDate.includes("-") || defaultDate.includes("/"))) {
            const dateStr = defaultDate.trim();
            const timeStr = `${String(parts[0]).padStart(2, "0")}:${String(parts[1]).padStart(2, "0")}:${String(parts[2] || 0).padStart(2, "0")}`;
            const combined = Date.parse(`${dateStr}T${timeStr}`);
            if (!isNaN(combined)) return combined;
        }
        const secs = (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
        return secs * 1000;
    }

    return null;
}

export function hmsDiff(start?: string, end?: string, defaultDate?: string): string {
    const sMs = parseToMs(start, defaultDate);
    const eMs = parseToMs(end, defaultDate);
    if (sMs === null || eMs === null || eMs < sMs) return "";

    const diffSecs = Math.floor((eMs - sMs) / 1000);
    const h = Math.floor(diffSecs / 3600);
    const m = Math.floor((diffSecs % 3600) / 60);
    const s = diffSecs % 60;

    const hh = String(h).padStart(2, "0");
    const mm = String(m).padStart(2, "0");
    const ss = String(s).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
}

export function isTimeEarlier(end?: string, start?: string, defaultDate?: string): boolean {
    if (!start || !end) return false;
    const sMs = parseToMs(start, defaultDate);
    const eMs = parseToMs(end, defaultDate);
    if (sMs === null || eMs === null) return false;
    return eMs < sMs;
}

export function isTimeInFuture(
    str?: string,
    defaultDate?: string,
    nowMs: number = Date.now(),
    graceMs: number = 5 * 60 * 1000,
): boolean {
    if (!str || !str.trim()) return false;
    const ms = parseToMs(str, defaultDate);
    if (ms === null || ms <= 86400000) return false;
    return ms > nowMs + graceMs;
}

export function getLocalDatetimeMax(bufferMs: number = 5 * 60 * 1000): string {
    const d = new Date(Date.now() + bufferMs);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
