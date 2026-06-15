/* ============================================================
   GEOJSON - URLs, caches, and fetch utilities for map data
============================================================ */

import telanganaState from "../../../../../geojson/State.json"

// export const STATES_URL =
//  "/geojson/State.json";
// export const DISTRICTS_URL =
//   "/geojson/District.json";

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
// export async function fetchStates(): Promise<unknown> {
//   if (statesCache) return statesCache;
//   const res = await fetch(STATES_URL);
//   statesCache = await res.json();
//   return statesCache;
// }

export async function fetchStates(): Promise<unknown> {
  if (statesCache) return statesCache;

  const res = await fetch(STATES_URL);

  const data = await res.json();

  const telanganaExists = data.features.some(
    (feature: any) =>
      feature.properties?.NAME_1?.toLowerCase() ===
      "telangana",
  );

  if (!telanganaExists) {
    data.features.push(telanganaState);
  }

  statesCache = data;

  return statesCache;
}

/**
 * Fetch India districts GeoJSON (cached)
 */

const TELANGANA_DISTRICTS = new Set([
  'Adilabad',
  'Hyderabad',
  'Karimnagar',
  'Khammam',
  'Medak',
  'Nalgonda',
  'Nizamabad',
  'Rangareddi',
  'Warangal',
]);
// export async function fetchDistricts(): Promise<unknown> {
//   if (districtsCache) return districtsCache;
//   const res = await fetch(DISTRICTS_URL);
//   districtsCache = await res.json();
//   return districtsCache;
// }

export async function fetchDistricts(): Promise<unknown> {
  if (districtsCache) return districtsCache;

  const res = await fetch(DISTRICTS_URL);

  const data = await res.json();

  data.features.forEach((feature: any) => {
    const districtName =
      feature.properties?.NAME_2;

    if (
      TELANGANA_DISTRICTS.has(
        districtName,
      )
    ) {
      feature.properties.NAME_1 =
        'Telangana';
    }
  });

  districtsCache = data;

  return districtsCache;
}

/**
 * Clear caches (useful for testing or refresh)
 */
export function clearGeoJsonCache(): void {
  statesCache = null;
  districtsCache = null;
}