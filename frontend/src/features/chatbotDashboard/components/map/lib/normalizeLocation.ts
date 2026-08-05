/* ============================================================
   NORMALIZE LOCATION - Shared location normalizer and alias map
============================================================ */

export const LOCATION_ALIASES: Record<string, string> = {
  "baramula": "baramulla",
  "ladakh leh": "leh",
  "naini tal": "nainital",
  "dehra dun": "dehradun",
  "belgaum": "belagavi",
  "mysore": "mysuru",
  "tumkur": "tumakuru",
  "bagalkot": "bagalkote",
  "chikmagalur": "chikkamagaluru",
  "chamrajnagar": "chamarajanagara",
  "chamarajanagar": "chamarajanagara",
  "vishakhapatnam": "visakhapatnam",
  "anantapur": "ananthapuramu",
  "sahibzada ajit singh nagar": "s a s nagar",
  "s a s nagar": "s a s nagar",
  "sas nagar": "s a s nagar",
  "mohali": "s a s nagar",
  "nawanshahr": "shahid bhagat singh nagar",
  "aurangabad": "chhatrapati sambhajinagar",
  "gondiya": "gondia",
  "keonjhar": "kendujhar",
  "chittaurgarh": "chittorgarh",
  "kanpur": "kanpur nagar",
};

export function normalizeLocation(str?: string | null): string {
  if (!str) return "";
  const cleaned = String(str)
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/\bdistrict\b/g, "")
    .replace(/[-_.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return LOCATION_ALIASES[cleaned] || cleaned;
}
