/**
 * Mock data for the public Impact dashboard. Replace these with a public
 * (unauthenticated) API later — the component reads only from this module, so
 * swapping in a fetch is a one-file change.
 */

export interface HeadlineStat {
  id: string;
  label: string;
  value: number;
  /** Optional unit shown after the number (e.g. "hrs"). */
  suffix?: string;
  /** Short supporting line under the number. */
  caption: string;
}

export const headlineStats: HeadlineStat[] = [
  { id: "questions", label: "Questions Answered", value: 128450, caption: "Verified by agri experts" },
  { id: "experts", label: "Expert Agronomists", value: 3120, caption: "Across the network" },
  { id: "states", label: "States & UTs Covered", value: 28, caption: "Pan-India reach" },
  { id: "crops", label: "Crops Supported", value: 142, caption: "Field & horticulture" },
  { id: "response", label: "Avg. Response Time", value: 6, suffix: "hrs", caption: "Median resolution" },
  { id: "languages", label: "Languages", value: 11, caption: "Regional coverage" },
];

/** Questions resolved per month (trend). Single measure over time. */
export interface TrendPoint {
  month: string;
  questions: number;
}

export const questionsTrend: TrendPoint[] = [
  { month: "Aug", questions: 6120 },
  { month: "Sep", questions: 7010 },
  { month: "Oct", questions: 8340 },
  { month: "Nov", questions: 9120 },
  { month: "Dec", questions: 10480 },
  { month: "Jan", questions: 11890 },
  { month: "Feb", questions: 12650 },
  { month: "Mar", questions: 13980 },
  { month: "Apr", questions: 15220 },
  { month: "May", questions: 16340 },
  { month: "Jun", questions: 17510 },
  { month: "Jul", questions: 18990 },
];

/** Top crops by volume of questions. Ranked magnitude → single-hue bars. */
export interface RankedItem {
  name: string;
  value: number;
}

export const topCrops: RankedItem[] = [
  { name: "Wheat", value: 21850 },
  { name: "Paddy", value: 19420 },
  { name: "Cotton", value: 14380 },
  { name: "Sugarcane", value: 11240 },
  { name: "Tomato", value: 9860 },
  { name: "Soybean", value: 8410 },
  { name: "Groundnut", value: 6730 },
];

/** Advisory questions grouped by agronomy domain. */
export const domainSplit: RankedItem[] = [
  { name: "Plant Protection", value: 38 },
  { name: "Nutrient Management", value: 24 },
  { name: "Weed Management", value: 16 },
  { name: "Irrigation", value: 12 },
  { name: "Seed & Sowing", value: 10 },
];

/** A few high-coverage states for the reach section. */
export const topStates: RankedItem[] = [
  { name: "Madhya Pradesh", value: 18240 },
  { name: "Uttar Pradesh", value: 16980 },
  { name: "Maharashtra", value: 15110 },
  { name: "Punjab", value: 12470 },
  { name: "Karnataka", value: 10230 },
  { name: "Rajasthan", value: 8940 },
];

/** Timestamp used for the "last updated" line — refreshed on load. */
export const lastUpdated = new Date();
