/* ============================================================
   TYPES - Core TypeScript interfaces for the Analytics Map
============================================================ */

export type LevelKey = "india" | "state" | "district";

export interface Analytics {
  questions: number;
  // answers: number;
  feedback: number;
  users: number;
  activeUsers: number;
  coordinators: number;
  closureHrs: number;
  rank: number;
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

export type SearchHitType = "state" | "district" | "village" | "block" | "kvk";

export interface SearchHit {
  type: SearchHitType;
  label: string;
  sub: string;
  onSelect: () => void;
}

/**
 * Generic GeoJSON Feature type for map features
 */
export interface GeoFeature {
  type: string;
  properties: Record<string, unknown>;
  geometry: unknown;
}

export interface GeoFeatureCollection {
  type: "FeatureCollection";
  features: GeoFeature[];
}