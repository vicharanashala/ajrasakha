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
