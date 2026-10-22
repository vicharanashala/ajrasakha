import { IUser } from '#root/shared/interfaces/models.js';

/**
 * Builds the actor object for audit trails given a current user.
 */
export function roleAuditActor(user: IUser, source?: string) {
  return {
    id: user._id.toString(),
    name: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim(),
    email: user.email,
    role: user.role,
    avatar: user?.avatar || '',
    ...(source ? { source } : {}),
  };
}

/**
 * Formats a user object into a human-readable display label (Name + email).
 */
export function userLabel(u: any): string | null {
  return u
    ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() +
        (u.email ? ` (${u.email})` : '')
    : null;
}

/**
 * Flattens array payload elements into readable audit context keys.
 */
export function flattenPayload(payload: any[]) {
  const result: Record<string, any> = {};

  payload.forEach((item, index) => {
    Object.entries(item).forEach(([key, value]) => {
      result[`crop ${index + 1} (${key})`] = value;
    });
  });

  return result;
}
