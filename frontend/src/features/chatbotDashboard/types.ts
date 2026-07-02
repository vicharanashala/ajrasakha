export type BadgeVariant = "green" | "red" | "amber" | "blue";
import type { AnalyticsEntry } from "./utils/dashboardHelpers";

export interface DemographicEntry {
  label: string;
  count: number;
  pct: number;
}

export interface UserDemographics {
  ageGroups: DemographicEntry[];
  genderSplit: DemographicEntry[];
  farmingExperience: DemographicEntry[];
  landHolding: DemographicEntry[];
}

export interface FeedbackEntry {
  rating: string;
  tag: string;
}

export interface FeedbackData{
  positiveFeedbacks: FeedbackEntry[];
  negativeFeedbacks: FeedbackEntry[];
  stats: {
    "_id"?: null | string,
    positiveCount: number,
    negativeCount: number,
    averageRating: number,
    totalFeedbacks: number
  }
}


export interface IPlatformInstallEntry{
  platform: string;
  count: number;
}

export interface Segment {
  id: string;
  label: string;
  users: string;
  status: string;
  statusVariant: BadgeVariant;
  description: string;
  dau: number;
  retention: number;
  queryRate: number;
  topCrop: string;
}

export interface KpiCard {
  id: string;
  label: string;
  value: string;
  delta: string;
  deltaDir: 'up' | 'down' | 'neutral';
  accentColor: string;
  valueColor?: string;
  sparkPoints?: number[];
  sparkLabels?: string[];
  dateRange?: string;
  dailyAnalytics?: AnalyticsEntry[];
  weeklyAnalytics?: AnalyticsEntry[];
  monthlyAnalytics?: AnalyticsEntry[];
  source?: 'vicharanashala' | 'annam' | 'whatsapp';
  userType?: 'all' | 'external' | 'internal';
  badges?: { label: string; variant: BadgeVariant }[];
  icon?: string;
  querySummaries?: {
    daily: { label: string; totalQueries: number };
    weekly: { label: string; totalQueries: number };
    monthly: { label: string; totalQueries: number };
  };
}
export interface TopCropsResponse {
  totalQuestions: number;
  topCrops: { name: string; count: number }[];
}
