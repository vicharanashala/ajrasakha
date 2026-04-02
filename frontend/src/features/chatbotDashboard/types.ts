export type BadgeVariant = "green" | "red" | "amber" | "blue";

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
}
