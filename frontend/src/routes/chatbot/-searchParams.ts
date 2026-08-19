import { z } from "zod";

// ─── /chatbot search-param schema ───────────────────────────────────────────
// Single source of truth for this route's URL search params. To add a new
// filter later (district, state, crop, season, rating, tag, search, page,
// limit, sortBy, sortOrder, startDate, endDate, ...):
//   1. add a field to `chatbotSearchSchema` below
//   2. add its default to `CHATBOT_SEARCH_DEFAULTS`
// That's it — validation, default-filling on load, and URL sync in
// routes/chatbot/index.tsx all key off these two exports, so nothing else
// needs to change.
//
// Note on `view`: this represents the top-level Chatbot page mode only
// ("dashboard" vs "map" — AnnamDashboard_dev's own `mapView` toggle). It is NOT
// the dashboard's internal sidebar navigation (DashboardView values like
// "overview", "farmer-segments", "query-analysis", etc.) — that internal
// navigation stays local component state, untouched by the URL, unless a
// future phase decides to expose it too.

export const chatbotSearchSchema = z.object({
  source: z.string().optional(),
  view: z.enum(["dashboard", "map"]).optional(),
  user: z.enum(["all", "external", "internal"]).optional(),
});

export type ChatbotSearch = z.infer<typeof chatbotSearchSchema>;

// Defaults are expressed in URL vocabulary (see the source map below for why
// "web-application" rather than the internal "annam").
export const CHATBOT_SEARCH_DEFAULTS: Required<ChatbotSearch> = {
  source: "web-application",
  view: "dashboard",
  user: "all",
};

// ─── source: URL <-> internal value mapping ────────────────────────────────
// AnnamDashboard_dev's internal `source` union is "annam" | "whatsapp" | "acc".
// "annam" is an internal/legacy name, so the URL uses the clearer
// "web-application" instead. Everything else round-trips unchanged.
type InternalSource = "annam" | "whatsapp" | "acc";

const SOURCE_URL_TO_INTERNAL: Record<string, InternalSource> = {
  "web-application": "annam",
  whatsapp: "whatsapp",
  acc: "acc",
};

const SOURCE_INTERNAL_TO_URL: Record<InternalSource, string> = {
  annam: "web-application",
  whatsapp: "whatsapp",
  acc: "acc",
};

export function sourceToInternal(urlValue: string): InternalSource {
  return SOURCE_URL_TO_INTERNAL[urlValue] ?? SOURCE_URL_TO_INTERNAL[CHATBOT_SEARCH_DEFAULTS.source];
}

export function sourceToUrl(internalValue: InternalSource): string {
  return SOURCE_INTERNAL_TO_URL[internalValue] ?? CHATBOT_SEARCH_DEFAULTS.source;
}

// ─── view: URL <-> AnnamDashboard_dev's `mapView` boolean mapping ──────────
// "dashboard" is the normal dashboard (mapView=false); "map" is the map mode
// (mapView=true). This intentionally has nothing to do with DashboardView /
// the sidebar's internal active section.
export function viewToMapView(urlValue: "dashboard" | "map"): boolean {
  return urlValue === "map";
}

export function mapViewToUrl(mapView: boolean): "dashboard" | "map" {
  return mapView ? "map" : "dashboard";
}
