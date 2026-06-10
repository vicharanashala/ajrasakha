import type { UserRole } from "@/types";

export const COORDINATOR_ROLES = [
  "district_coordinator",
  "block_coordinator",
  "village_coordinator",
] as const;

export type CoordinatorRole = (typeof COORDINATOR_ROLES)[number];

export const isCoordinatorRole = (
  role?: string | UserRole | null,
): role is CoordinatorRole => {
  return COORDINATOR_ROLES.includes(role as CoordinatorRole);
};
