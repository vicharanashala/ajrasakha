import type { DashboardFilterValues } from "../DashboardFilters";

/**
 * Type for dynamic KPI card IDs
 */
export type DynamicKpiId = "dau" | "queries" | "session";

/**
 * Default filter values for the dashboard
 */
export const DEFAULT_FILTERS: DashboardFilterValues = {
  village: "all",
  crop: "all",
  season: "all",
  startTime: undefined,
  endTime: undefined,
  userType: "all",
};

/**
 * Query keys for invalidating cache during refresh
 */
export const DASHBOARD_QUERY_KEYS = [
  "dashboard-data",
  "top-faqs",
  "daily-question-trends",
  "user-metrices",
  "response-adherence-table",
  "retention_metrics",
  "query-categories",
  "whatsapp-inactive-users",
  "whatsapp-unique-users",
  "whatsapp-all-users",
  "closed-notified-data",
  "monthly-churn-rate",
  "active_user_trend",
  "user-details",
  "user_growth",
  "top-crops-chatbot",
  "state-wise-analytics",
  "weather-concern-analytics",
  "farmer-heat-map",
] as const;

/**
 * Dynamic KPI card IDs - only these cards are rendered when data is dynamic
 */
export const DYNAMIC_KPI_IDS = ["dau", "queries", "session"] as const;

/**
 * Refresh state duration in milliseconds
 */
export const REFRESH_DELAY_MS = 500;

/**
 * Stagger animation delay for child elements
 */
export const STAGGER_CHILDREN_DELAY = 0.08;

/**
 * Initial animation delay
 */
export const INITIAL_ANIMATION_DELAY = 0.1;

/**
 * KPI card configuration
 */
export const KPI_CARD_CONFIG = {
  row1Ids: DYNAMIC_KPI_IDS,
  row2Ids: ["totalInstalls"] as const,
} as const;

/**
 * Active users chart tabs
 */
export const ACTIVE_USERS_TABS = [
  { value: "dau", label: "Daily Active Users", icon: "Users" },
  { value: "retention", label: "User Retention", icon: "RefreshCw" },
  { value: "churn", label: "Monthly Churn", icon: "UserMinus" },
] as const;

/**
 * Knowledge & Awareness chart configuration
 */
export const KNOWLEDGE_AWARENESS_CONFIG = {
  svgSize: 120,
  radius: 45,
  centerX: 60,
  centerY: 60,
  strokeWidth: 10,
  charts: [
    { label: "KCC Awareness", gradId: "kccGrad", color: "hsl(142 71% 45%)" },
    { label: "Uses Agri Apps", gradId: "agriGrad", color: "hsl(217 91% 60%)" },
  ],
} as const;