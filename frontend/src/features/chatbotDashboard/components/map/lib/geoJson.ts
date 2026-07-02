/* ============================================================
   GEOJSON - URLs, caches, and fetch utilities for map data
============================================================ */

import states from "../../../../../geojson/State.json";
import districtPatches from "../../../../../geojson/District.json";

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

  data.features.forEach((feature: any) => {
    const stateName = feature.properties?.NAME_1;

    if (stateName === "Orissa") {
      feature.properties.NAME_1 = "Odisha";
    }

    if (stateName === "Uttaranchal") {
      feature.properties.NAME_1 = "Uttarakhand";
    }

    if (stateName === "Jammu and Kashmir") {
      feature.properties.NAME_1 = "Jammu And Kashmir"
      feature.geometry = states["Jammu And Kashmir"].geometry;
    }
  });

  const telanganaExists = data.features.some(
    (feature: any) => feature.properties?.NAME_1?.toLowerCase() === "telangana",
  );

  const ladakhExists = data.features.some(
    (feature: any) => feature.properties?.NAME_1?.toLowerCase() === "ladakh",
  );

  if (!telanganaExists) {
    data.features.push(states["Telangana"]);
  }

  if (!ladakhExists) {
    data.features.push(states["Ladakh"]);
  }

  statesCache = data;

  return statesCache;
}

/**
 * Fetch India districts GeoJSON (cached)
 */

const TELANGANA_DISTRICTS = new Set([
  "Adilabad",
  "Hyderabad",
  "Karimnagar",
  "Khammam",
  "Medak",
  "Nalgonda",
  "Nizamabad",
  "Rangareddi",
  "Warangal",
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

  // data.features.forEach((feature: any) => {
  //   const districtName =
  //     feature.properties?.NAME_2;

  //   const stateName =
  //     feature.properties?.NAME_1;

  //   // Telangana fix
  //   if (
  //     TELANGANA_DISTRICTS.has(
  //       districtName,
  //     )
  //   ) {
  //     feature.properties.NAME_1 =
  //       'Telangana';
  //   }

  //   // State renames
  //   if (stateName === 'Orissa') {
  //     feature.properties.NAME_1 =
  //       'Odisha';
  //   }

  //   if (stateName === 'Uttaranchal') {
  //     feature.properties.NAME_1 =
  //       'Uttarakhand';
  //   }

  //   if(districtName === "Naini Tal"){
  //     feature.properties.NAME_2 = "Nainital"
  //   }
  // });

 data.features.forEach((feature: any) => {
  const districtName =
    feature.properties?.NAME_2;

  // const cleanedDistrictName =
  //   districtName
  //     ?.replace(/\([^)]*\)/g, "")
  //     .trim();

  const stateName =
    feature.properties?.NAME_1;

  // Remove brackets from all districts
  // feature.properties.NAME_2 =
  //   districtName;

  // Telangana fix
  if (
    TELANGANA_DISTRICTS.has(
      districtName,
    )
  ) {
    feature.properties.NAME_1 =
      "Telangana";
  }

    if (
    stateName === "Jammu and Kashmir"
  ) {
    feature.properties.NAME_1 =
      "Jammu And Kashmir";
  }

  // Jammu & Kashmir → Ladakh
  if (
    districtName === "Kargil" ||
    districtName === "Ladakh (Leh)"
  ) {
  try {

    feature.properties.NAME_1 =
      "Ladakh";
  } catch (e) {
    console.error(e);
  }
}
  

//   if (
//   districtName.includes("Kargil") ||
//   districtName.includes("Ladakh")
// ) {
//   console.log(
//     districtName,
//   );
// }

  // State renames
  if (stateName === "Orissa") {
    feature.properties.NAME_1 =
      "Odisha";
  }

  if (stateName === "Uttaranchal") {
    feature.properties.NAME_1 =
      "Uttarakhand";
  }



  // District renames
  if (
    districtName ===
    "Naini Tal"
  ) {
    feature.properties.NAME_2 =
      "Nainital";
  }

  if (
    districtName ===
    "Ladakh (Leh)"
  ) {
    feature.properties.NAME_2 =
      "Leh";
  }
  if( districtName === "Baramula"){
    feature.properties.NAME_2 = "Baramulla"
  }
  if(districtName === "Mysore"){
    feature.properties.NAME_2 = "Mysuru"
  }
});

  // Add missing districts
  data.features.push(districtPatches);

  districtsCache = data;

  return districtsCache;
}

/**
 * Clear caches (useful for testing or refresh)
 */
export function clearGeoJsonCache(): void {
 if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    statesCache = null;
    districtsCache = null;
  });
}
}
