/* ============================================================
   COLORS - Color ramp utilities for map visualization
============================================================ */

/**
 * Get color for a value based on a blue → cyan → green color ramp
 * Theme-aware (dark/light mode support)
 */
// export function colorFor(
//   value: number,
//   min: number,
//   max: number,
//   dark: boolean,
// ): string {
//   if (max === min) return dark ? "#3b82f6" : "#2563eb";
//   const t = (value - min) / (max - min);

//   // Blue → cyan → green ramp with more saturated colors
//   const ramp = dark
//     ? ["#1e3a8a", "#1d4ed8", "#0ea5e9", "#06b6d4", "#10b981"]
//     : ["#3b82f6", "#2563eb", "#1d4ed8", "#0891b2", "#0e7490"];

//   if (t < 0.2) return ramp[0];
//   if (t < 0.4) return ramp[1];
//   if (t < 0.65) return ramp[2];
//   if (t < 0.85) return ramp[3];
//   return ramp[4];
// }


export function colorFor(
  value: number,
  min: number,
  max: number,
  dark: boolean,
): string {
  if (max === min) {
    return "#22c55e";
  }

  const t = (value - min) / (max - min);

  // Red → Orange → Green

  if (t < 0.2)
    return "#dc2626"; // Dark Red

  if (t < 0.4)
    return "#ef4444"; // Red

  if (t < 0.6)
    return "#f97316"; // Orange

  if (t < 0.8)
    return "#84cc16"; // Light Green

  return "#16a34a"; // Dark Green
}