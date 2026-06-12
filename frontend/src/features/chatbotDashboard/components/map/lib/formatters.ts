/* ============================================================
   FORMATTERS - Number and text formatting utilities
============================================================ */

/**
 * Format large numbers with k/M suffixes
 * e.g., 1500 → "1.5k", 2500000 → "2.5M"
 */
export function fmt(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`;
  }
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1)}k`;
  }
  return `${n}`;
}