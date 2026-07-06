// ─── Default Filter Values ────────────────────────────────────────────────────
import type { DashboardFilterValues } from "../DashboardFilters";

export const DEFAULT_FILTERS: DashboardFilterValues = {
  village: "all",
  crop: "all",
  season: "all",
  startTime: undefined,
  endTime: undefined,
  userType: "all",
};

// ─── Animation Variants ───────────────────────────────────────────────────────
import type { Variants } from "framer-motion";

export const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

export const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  },
};

export const cardVariants: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.4,
      ease: "easeOut",
    },
  },
  hover: {
    scale: 1.02,
    transition: { duration: 0.2 },
  },
};

export const slideInVariants: Variants = {
  hidden: { opacity: 0, x: -20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.4,
      ease: "easeOut",
    },
  },
};

export const tabContentVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.3,
      ease: "easeInOut",
    },
  },
  exit: {
    opacity: 0,
    y: -10,
    transition: {
      duration: 0.2,
      ease: "easeIn",
    },
  },
};

// ─── Query Keys for Cache Invalidation ───────────────────────────────────────
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

export const DYNAMIC_KPI_IDS = ["dau", "queries", "session"] as const;

// ─── CSS Keyframe Animations ──────────────────────────────────────────────────
export const CSS_KEYFRAMES = `
  @keyframes slideIn { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
  @keyframes custom-pulse { 0%,100%{box-shadow:0 0 0 2.5px #3AAA5A,0 4px 24px rgba(58,170,90,0.18)} 50%{box-shadow:0 0 0 4px #3AAA5A,0 4px 32px rgba(58,170,90,0.28)} }
  .seg-pulse { animation: custom-pulse 1.2s ease 2; }
` as const;