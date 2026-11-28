import {IUser} from '#root/shared/interfaces/models.js';

// These roles are gated by activity status; isBlocked is their check-in/checkout availability flag.
const STATUS_GATED_ROLES = ['moderator', 'expert', 'gate_keeper', 'auditor'];

// Returns true when the user must not access the platform. Shared by login and per-request checks.
export function isUserAccessDenied(
  user: Pick<IUser, 'role' | 'status' | 'isBlocked'>,
): boolean {
  return STATUS_GATED_ROLES.includes(user.role)
    ? user.status === 'in-active'
    : Boolean(user.isBlocked);
}
