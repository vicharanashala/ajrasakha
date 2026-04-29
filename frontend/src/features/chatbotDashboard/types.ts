export type BadgeVariant = "green" | "red" | "amber" | "blue";

export interface DemographicEntry {
  label: string;
  count: number;
  pct: number;
}

export interface UserDemographics {
  ageGroups: DemographicEntry[];
  genderSplit: DemographicEntry[];
  farmingExperience: DemographicEntry[];
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
  badges?: { label: string; variant: BadgeVariant }[];
  icon?: string;
}
export interface TopCropsResponse {
  totalQuestions: number;
  topCrops: { name: string; count: number }[];
}
