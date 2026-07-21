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
  "gate_keeper",
  "auditor",
  ...COORDINATOR_ROLES,
] as const;

export type CoordinatorRole = (typeof COORDINATOR_ROLES)[number];

export const isCoordinatorRole = (
  role?: string | UserRole | null,
): role is CoordinatorRole => {
  return COORDINATOR_ROLES.includes(role as CoordinatorRole);
};

/** Roles allowed to open the User / Expert Management page. */
export const USER_MANAGEMENT_ROLES = [
  "admin",
  "moderator",
  "tester",
  // Gate keepers and auditors get the same Expert Management view as moderators.
  "gate_keeper",
  "auditor",
] as const;

/**
 * Whether this role may see the User / Expert Management tab. An allowlist, so roles added
 * later (gate_keeper, auditor, …) stay out until explicitly granted access.
 */
export const canManageUsers = (role?: string | UserRole | null): boolean =>
  USER_MANAGEMENT_ROLES.includes(role as (typeof USER_MANAGEMENT_ROLES)[number]);
