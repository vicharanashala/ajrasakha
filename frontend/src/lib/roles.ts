import type { UserRole } from "@/types";

export const COORDINATOR_ROLES = [
  "district_coordinator",
  "block_coordinator",
  "village_volunteer",
] as const;

export const USER_ROLES = [
  "admin",
  "moderator",
  "expert",
  "pae_expert",
  "tester",
  "call_agent",
  ...COORDINATOR_ROLES,
] as const;

export type CoordinatorRole = (typeof COORDINATOR_ROLES)[number];

export const isCoordinatorRole = (
  role?: string | UserRole | null,
): role is CoordinatorRole => {
  return COORDINATOR_ROLES.includes(role as CoordinatorRole);
};
