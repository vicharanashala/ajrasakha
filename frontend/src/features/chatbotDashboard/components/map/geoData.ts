const STATES_URL =
  "https://raw.githubusercontent.com/geohacker/india/master/state/india_state.geojson";
const DISTRICTS_URL =
  "https://raw.githubusercontent.com/geohacker/india/master/district/india_district.geojson";

let statesCache: any = null;
let districtsCache: any = null;

export async function fetchStates() {
  if (statesCache) return statesCache;
  const res = await fetch(STATES_URL);
  statesCache = await res.json();
  return statesCache;
}
export async function fetchDistricts() {
  if (districtsCache) return districtsCache;
  const res = await fetch(DISTRICTS_URL);
  districtsCache = await res.json();
  return districtsCache;
}
