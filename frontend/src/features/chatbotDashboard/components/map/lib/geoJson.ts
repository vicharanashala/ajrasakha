/* ============================================================
   GEOJSON - URLs, caches, and fetch utilities for map data
============================================================ */

export const STATES_URL =
  "https://raw.githubusercontent.com/geohacker/india/master/state/india_state.geojson";
export const DISTRICTS_URL =
  "https://raw.githubusercontent.com/geohacker/india/master/district/india_district.geojson";

// In-memory caches for GeoJSON data
let statesCache: unknown = null;
let districtsCache: unknown = null;

/**
 * Fetch India states GeoJSON (cached)
 */
export async function fetchStates(): Promise<unknown> {
  if (statesCache) return statesCache;
  const res = await fetch(STATES_URL);
  statesCache = await res.json();
  return statesCache;
}

/**
 * Fetch India districts GeoJSON (cached)
 */
export async function fetchDistricts(): Promise<unknown> {
  if (districtsCache) return districtsCache;
  const res = await fetch(DISTRICTS_URL);
  districtsCache = await res.json();
  return districtsCache;
}

/**
 * Clear caches (useful for testing or refresh)
 */
export function clearGeoJsonCache(): void {
  statesCache = null;
  districtsCache = null;
}