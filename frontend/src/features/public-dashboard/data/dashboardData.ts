/**
 * Demo data for the public ACE dashboard. Illustrative placeholders for design
 * review — not live production figures. The UI reads only from this module, so
 * wiring a public (unauthenticated) API later is a one-file change.
 */

export interface StatItem {
  label: string;
  count: number;
  /** "int" → Indian-grouped integer; "float" with suffix → e.g. 41.2M. */
  suffix?: string;
}

export const heroStats: StatItem[] = [
  { label: "Agricultural questions processed", count: 18600000 },
  { label: "Validated Q&A pairs", count: 4120000 },
  { label: "Experts engaged", count: 3174 },
  { label: "States covered", count: 29 },
  { label: "Crops covered", count: 186 },
  { label: "Languages supported", count: 22 },
  { label: "Districts covered", count: 612 },
  { label: "Villages covered", count: 8420 },
  { label: "KVKs mapped", count: 731 },
  { label: "SAUs collaborated", count: 63 },
  { label: "Markets connected", count: 1284 },
  { label: "Dynamic tools integrated", count: 11 },
  { label: "Outreach events conducted", count: 962 },
];

export interface StateInfo {
  name: string;
  zone: string;
  crops: number;
  qas: number;
  experts: number;
  districts: number;
  kvks: number;
  saus: number;
  villages: number;
  queries: number;
  langs: string;
  dominant: string;
  markets: number;
  farmers: number;
  /** [Knowledge, Expert, Outreach, Data] density indices (0–100). */
  idx: [number, number, number, number];
}

export const states: StateInfo[] = [
  { name: "Punjab", zone: "Trans-Gangetic Plain", crops: 22, qas: 412000, experts: 284, districts: 23, kvks: 22, saus: 4, villages: 1240, queries: 186000, langs: "Punjabi, Hindi, English", dominant: "Wheat, Rice, Cotton", markets: 96, farmers: 612000, idx: [92, 88, 84, 90] },
  { name: "Uttar Pradesh", zone: "Upper & Middle Gangetic Plain", crops: 31, qas: 588000, experts: 412, districts: 75, kvks: 88, saus: 7, villages: 2100, queries: 264000, langs: "Hindi, Urdu", dominant: "Sugarcane, Wheat, Rice", markets: 210, farmers: 1480000, idx: [81, 76, 74, 79] },
  { name: "Maharashtra", zone: "Deccan Plateau", crops: 28, qas: 461000, experts: 356, districts: 36, kvks: 47, saus: 5, villages: 1660, queries: 198000, langs: "Marathi, Hindi", dominant: "Cotton, Soybean, Sugarcane", markets: 172, farmers: 1120000, idx: [85, 80, 72, 83] },
  { name: "Karnataka", zone: "Southern Plateau", crops: 24, qas: 328000, experts: 241, districts: 31, kvks: 32, saus: 4, villages: 980, queries: 142000, langs: "Kannada, Telugu", dominant: "Ragi, Coffee, Cotton", markets: 134, farmers: 742000, idx: [78, 74, 69, 75] },
  { name: "Tamil Nadu", zone: "Eastern Coastal Plain", crops: 20, qas: 296000, experts: 198, districts: 38, kvks: 30, saus: 3, villages: 860, queries: 118000, langs: "Tamil, English", dominant: "Rice, Sugarcane, Banana", markets: 118, farmers: 604000, idx: [74, 70, 66, 77] },
  { name: "Rajasthan", zone: "Western Arid Zone", crops: 18, qas: 214000, experts: 162, districts: 33, kvks: 41, saus: 2, villages: 1120, queries: 96000, langs: "Hindi, Rajasthani", dominant: "Bajra, Mustard, Guar", markets: 88, farmers: 498000, idx: [62, 58, 71, 60] },
  { name: "West Bengal", zone: "Lower Gangetic Plain", crops: 19, qas: 241000, experts: 176, districts: 23, kvks: 20, saus: 3, villages: 1340, queries: 104000, langs: "Bengali, Hindi", dominant: "Rice, Jute, Potato", markets: 96, farmers: 812000, idx: [70, 65, 80, 68] },
  { name: "Madhya Pradesh", zone: "Central Highlands", crops: 23, qas: 256000, experts: 189, districts: 52, kvks: 52, saus: 3, villages: 1480, queries: 112000, langs: "Hindi", dominant: "Soybean, Wheat, Gram", markets: 102, farmers: 690000, idx: [66, 61, 68, 64] },
  { name: "Gujarat", zone: "Western Dry Region", crops: 21, qas: 238000, experts: 171, districts: 33, kvks: 31, saus: 4, villages: 960, queries: 98000, langs: "Gujarati, Hindi", dominant: "Cotton, Groundnut, Cumin", markets: 110, farmers: 520000, idx: [71, 67, 64, 73] },
  { name: "Andhra Pradesh", zone: "Eastern Coastal Plain", crops: 19, qas: 211000, experts: 158, districts: 26, kvks: 27, saus: 3, villages: 820, queries: 88000, langs: "Telugu", dominant: "Rice, Chilli, Groundnut", markets: 92, farmers: 474000, idx: [68, 63, 60, 70] },
];

export interface Crop { name: string; pct: number; qa: number; maturity: string; }
export const crops: Crop[] = [
  { name: "Wheat", pct: 88, qa: 412000, maturity: "High" },
  { name: "Rice", pct: 84, qa: 398000, maturity: "High" },
  { name: "Cotton", pct: 71, qa: 264000, maturity: "Medium" },
  { name: "Sugarcane", pct: 76, qa: 281000, maturity: "High" },
  { name: "Soybean", pct: 63, qa: 196000, maturity: "Medium" },
  { name: "Mustard", pct: 58, qa: 164000, maturity: "Medium" },
  { name: "Groundnut", pct: 52, qa: 138000, maturity: "Medium" },
  { name: "Bajra", pct: 41, qa: 96000, maturity: "Emerging" },
];

export interface Integration { name: string; src: string; freq: string; geo: string; status: "live" | "soon"; }
export const integrations: Integration[] = [
  { name: "Live Weather Data", src: "IMD API", freq: "15 min", geo: "Pan-India", status: "live" },
  { name: "Market Prices", src: "Agmarknet", freq: "Daily", geo: "1,284 markets", status: "live" },
  { name: "Mandi Intelligence", src: "eNAM", freq: "Daily", geo: "22 states", status: "live" },
  { name: "Pest Alerts", src: "State agri depts", freq: "Weekly", geo: "18 states", status: "live" },
  { name: "Disease Alerts", src: "KVK network", freq: "Weekly", geo: "29 states", status: "live" },
  { name: "Soil Intelligence", src: "Soil Health Card", freq: "Quarterly", geo: "612 districts", status: "live" },
  { name: "Advisory Engine", src: "ANNAM Agri LLM", freq: "Real-time", geo: "Pan-India", status: "live" },
  { name: "Scheme Discovery", src: "Gov. scheme registry", freq: "Monthly", geo: "Pan-India", status: "live" },
  { name: "Crop Calendar", src: "ICAR", freq: "Seasonal", geo: "Agro-climatic zones", status: "live" },
  { name: "Irrigation Advisory", src: "CWC + IMD", freq: "Daily", geo: "14 states", status: "soon" },
  { name: "Local Dialect Collection", src: "Field outreach", freq: "Ongoing", geo: "8,420 villages", status: "live" },
];

export interface NoteCard { name: string; note: string; }
export const techs: NoteCard[] = [
  { name: "Speech to Text", note: "22 languages, 47 dialects" },
  { name: "Text to Speech", note: "Natural voice advisory" },
  { name: "OCR", note: "Handwritten form capture" },
  { name: "Translation", note: "Cross-lingual Q&A" },
  { name: "RAG Engine", note: "Grounded retrieval" },
  { name: "Agri LLM", note: "Domain-tuned model" },
  { name: "Knowledge Graph", note: "Crop-region-practice links" },
  { name: "Image Understanding", note: "Pest & disease ID" },
  { name: "Retrieval Systems", note: "Golden database search" },
  { name: "Recommendation Systems", note: "Personalised advisory" },
];

export const roadmap: NoteCard[] = [
  { name: "Soil Health Engine", note: "Predictive soil advisory" },
  { name: "Question Collection Platform", note: "Structured field intake" },
  { name: "Agricultural Command Center", note: "District-level ops view" },
  { name: "AI Agronomist", note: "Conversational field agent" },
  { name: "Disease Detection Engine", note: "Image-based diagnosis" },
  { name: "Satellite Intelligence", note: "Remote crop monitoring" },
  { name: "Crop Yield Prediction", note: "Season-ahead forecasting" },
];

export interface Channel { name: string; note: string; usage: string; }
export const channels: Channel[] = [
  { name: "WhatsApp", note: "Advisory & query intake", usage: "612K active users" },
  { name: "Web Portal", note: "Public dashboard & search", usage: "84K monthly visits" },
  { name: "Mobile Application", note: "Android advisory app", usage: "238K installs" },
  { name: "Voice Bot", note: "IVR in 16 languages", usage: "96K calls / month" },
  { name: "Call Center Integration", note: "KCC linkage", usage: "41.2M records" },
];

export const workflowSteps = [
  "Question Submitted", "AI Processing", "Reviewer 1", "Reviewer 2",
  "Reviewer 3", "Moderator Approval", "Golden Database",
];

export const langCoverage = states.map((s) => ({
  name: s.name,
  text: Math.round(s.idx[0] / 4),
  audio: Math.round(s.idx[1] / 5),
}));

/** Human network roles (Layer 4). */
export const networkRoles: StatItem[] = [
  { label: "Post-graduate Agri Experts", count: 1240 },
  { label: "Reviewers", count: 860 },
  { label: "Moderators", count: 310 },
  { label: "Authors", count: 540 },
  { label: "Gatekeepers", count: 128 },
  { label: "Auditors", count: 96 },
];

/** Domain distribution for the doughnut chart. */
export const domains = [
  { label: "Crop production", value: 24 },
  { label: "Plant protection", value: 17 },
  { label: "Soil science", value: 11 },
  { label: "Horticulture", value: 10 },
  { label: "Animal husbandry", value: 9 },
  { label: "Agri engineering", value: 7 },
  { label: "Farm machinery", value: 6 },
  { label: "Fisheries", value: 6 },
  { label: "Marketing", value: 5 },
  { label: "Govt. schemes", value: 5 },
];

/** Cumulative growth timeline (line chart). */
export const growth = [
  { q: "23 Q1", questions: 0.8, experts: 1, states: 4, integrations: 1 },
  { q: "23 Q2", questions: 1.6, experts: 3, states: 6, integrations: 1 },
  { q: "23 Q3", questions: 2.7, experts: 5, states: 9, integrations: 2 },
  { q: "23 Q4", questions: 4.1, experts: 7, states: 12, integrations: 3 },
  { q: "24 Q1", questions: 5.9, experts: 9, states: 15, integrations: 4 },
  { q: "24 Q2", questions: 7.8, experts: 11, states: 18, integrations: 5 },
  { q: "24 Q3", questions: 9.6, experts: 14, states: 20, integrations: 6 },
  { q: "24 Q4", questions: 11.4, experts: 17, states: 22, integrations: 7 },
  { q: "25 Q1", questions: 13.1, experts: 20, states: 24, integrations: 8 },
  { q: "25 Q2", questions: 14.6, experts: 23, states: 25, integrations: 9 },
  { q: "25 Q3", questions: 15.9, experts: 26, states: 27, integrations: 9 },
  { q: "25 Q4", questions: 16.9, experts: 28, states: 28, integrations: 10 },
  { q: "26 Q1", questions: 17.8, experts: 30, states: 29, integrations: 11 },
  { q: "26 Q2", questions: 18.6, experts: 31.7, states: 29, integrations: 11 },
];

/** Doughnut slice colours — a fixed, muted categorical set (identity, not magnitude). */
export const domainColors = [
  "#16382c", "#e08a2c", "#22a55a", "#b23a2e", "#5c7a93",
  "#d9a15c", "#3d8a63", "#8c4a2b", "#6e7b8b", "#c98f4e",
];

/** A distinct greens-and-earth palette for the crop distribution doughnut. */
export const cropColors = [
  "#1f6e45", "#7cb342", "#c0a02c", "#a8582b", "#4e8d6e",
  "#9ac154", "#d4a017", "#7d4e24", "#3f7a5a", "#b5893f",
];

/** Growth line colours by series. */
export const growthColors = {
  questions: "#16382c",
  experts: "#e08a2c",
  states: "#22a55a",
  integrations: "#b23a2e",
} as const;
