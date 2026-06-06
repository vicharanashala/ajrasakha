export type LevelKey = "india" | "state" | "district";

export interface Analytics {
  questions: number;
  answers: number;
  users: number;
  activeUsers: number;
  coordinators: number;
  closureHrs: number;
}

export interface Village {
  id: string;
  name: string;
  block: string;
  kvk: string;
  analytics: Analytics;
}

export interface DistrictDetails {
  blocks: string[];
  villages: Village[];
  kvk: string;
}

export interface FeatureProps {
  name: string;
  parent?: string;
  analytics: Analytics;
}

export interface Crumb {
  level: LevelKey;
  name: string;
  stateName?: string;
}

export type SearchHit = {
  type: "state" | "district" | "village" | "block" | "kvk";
  label: string;
  sub: string;
  onSelect: () => void;
};
