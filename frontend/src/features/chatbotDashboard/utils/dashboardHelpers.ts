// ─── Types ────────────────────────────────────────────────────────────────────

export interface DailyEntry {
  day: string;
  count: number;
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Formats a number using the Indian numbering system.
 * e.g. 482000 → "4.82 L", 1200 → "1.2k", 45 → "45"
 */
export function formatIndian(n: number): string {
  if (n >= 100000) return `${(n / 100000).toFixed(2)} L`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

/**
 * Calculates the percentage change between the older half and recent half
 * of a DAU (Daily Active Users) array.
 * Returns a human-readable delta string and direction indicator.
 */
export function calcDelta(
  dauArray: DailyEntry[],
  vsLabel = 'last month',
): { text: string; dir: 'up' | 'down' | 'neutral' } {
  if (!dauArray || dauArray.length < 4) {
    return { text: 'Not enough data', dir: 'neutral' };
  }

  const mid = Math.floor(dauArray.length / 2);
  const olderHalf = dauArray.slice(0, mid);
  const recentHalf = dauArray.slice(mid);

  const olderAvg = olderHalf.reduce((s, d) => s + d.count, 0) / olderHalf.length;
  const recentAvg = recentHalf.reduce((s, d) => s + d.count, 0) / recentHalf.length;

  if (olderAvg === 0) return { text: 'New data', dir: 'up' };

  const pctChange = Math.round(((recentAvg - olderAvg) / olderAvg) * 100);

  if (pctChange > 0) return { text: `+${pctChange}% vs ${vsLabel}`, dir: 'up' };
  if (pctChange < 0) return { text: `${pctChange}% vs ${vsLabel}`, dir: 'down' };
  return { text: `Stable vs ${vsLabel}`, dir: 'neutral' };
}
