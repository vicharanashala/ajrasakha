/* ============================================================
   SEEDED RANDOM - Deterministic pseudo-random number generator
   Used for generating consistent mock data based on names/IDs
============================================================ */

/**
 * Creates a seeded random number generator
 * Same seed always produces the same sequence of numbers
 */
export function seeded(seed: string): () => number {
  let h = 2166136261; // FNV offset basis
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619); // FNV prime
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
}