export const COORDINATOR_ROLES = [
  'district_coordinator',
  'block_coordinator',
  'village_volunteer',
] as const;

export const USER_ROLES = [
  'expert',
  'moderator',
  'admin',
  'pae_expert',
  'tester',
  'call_agent',
  'gate_keeper',
  'auditor',
  ...COORDINATOR_ROLES,
] as const;

export type CoordinatorRole = (typeof COORDINATOR_ROLES)[number];
export type UserRoleValue = (typeof USER_ROLES)[number];
