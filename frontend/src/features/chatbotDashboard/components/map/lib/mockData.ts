/* ============================================================
   MOCK DATA - Mock analytics and district details generators
============================================================ */

import { seeded } from "./seededRandom";
import type { Analytics, DistrictDetails, Village } from "./types";

/* ============================================================
   CONSTANTS
============================================================ */

export const BLOCK_PREFIXES = [
  "North",
  "South",
  "East",
  "West",
  "Central",
  "Upper",
  "Lower",
] as const;

export const VILLAGE_SUFFIXES = [
  "pur",
  "gaon",
  "ganj",
  "wadi",
  "halli",
  "palli",
  "nagar",
  "kheda",
] as const;

export const VILLAGE_ROOTS = [
  "Rama",
  "Krishna",
  "Shiv",
  "Lakshmi",
  "Surya",
  "Govind",
  "Bharat",
  "Anand",
  "Megh",
  "Chand",
  "Vijay",
  "Prem",
] as const;

/* ============================================================
   MOCK ANALYTICS
============================================================ */

export function mockAnalytics(seed: string): Analytics {
  const r = seeded(seed);
  const users = Math.floor(r() * 80000) + 2000;
  const questions = Math.floor(r() * 6000) + 200;
  return {
    users,
    activeUsers: Math.floor(users * (0.2 + r() * 0.5)),
    questions,
    // @ts-ignore
    answers: Math.floor(questions * (0.6 + r() * 0.35)),
    coordinators: Math.floor(r() * 120) + 8,
    closureHrs: Math.floor(r() * 60) + 2,
  };
}

/* ============================================================
   MOCK DISTRICT DETAILS
============================================================ */

export function mockDistrictDetails(districtName: string): DistrictDetails {
  const r = seeded(districtName);
  const blockCount = 4 + Math.floor(r() * 5);
  const blocks = Array.from(
    { length: blockCount },
    (_, i) =>
      `${BLOCK_PREFIXES[i % BLOCK_PREFIXES.length]} ${districtName} Block`,
  );
  const villageCount = 12 + Math.floor(r() * 12);
  const villages: Village[] = Array.from({ length: villageCount }, (_, i) => {
    const root = VILLAGE_ROOTS[Math.floor(r() * VILLAGE_ROOTS.length)];
    const suf = VILLAGE_SUFFIXES[Math.floor(r() * VILLAGE_SUFFIXES.length)];
    const id = `${districtName}-v-${i}`;
    return {
      id,
      name: `${root}${suf}`,
      block: blocks[i % blockCount],
      kvk: `KVK ${districtName}`,
      analytics: mockAnalytics(id),
    };
  });
  return { blocks, villages, kvk: `KVK ${districtName}` };
}