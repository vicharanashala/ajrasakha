import {ModeratorAuditTrail, OutComeStatus} from '../interfaces/IAuditTrails.js';

/**
 * Shared builders for the audit-trail payload fragments that were previously
 * copy-pasted into every controller action (QuestionController, AnswerController,
 * …). Keeping them in one place means the actor shape and the failure-outcome
 * shape are defined exactly once.
 */

type AuditActor = ModeratorAuditTrail['actor'];
type AuditOutcome = NonNullable<ModeratorAuditTrail['outcome']>;

/** Anything user-ish we can read an actor out of (an IUser, a lean user doc, …). */
type ActorSource = {
  _id?: {toString(): string} | string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
  avatar?: string;
};

/**
 * Build the `actor` block of an audit payload from the authenticated user.
 * Pass `extra` to override/add fields (e.g. `{source}` or a pre-computed `name`).
 */
export function auditActor(
  user: ActorSource | null | undefined,
  extra: Partial<AuditActor> = {},
): AuditActor {
  return {
    id: typeof user?._id === 'string' ? user._id : user?._id?.toString(),
    name: `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim(),
    email: user?.email,
    role: user?.role,
    avatar: user?.avatar || '',
    ...extra,
  };
}

/**
 * Build a FAILED `outcome` block from a caught error, capturing a truncated
 * (top 5 lines) stack trace. `fallbackMessage` is used when the error has none.
 */
export function failureOutcome(
  err: any,
  fallbackMessage = 'Operation failed',
): AuditOutcome {
  return {
    status: OutComeStatus.FAILED,
    errorCode: err?.errorCode || 'INTERNAL_ERROR',
    errorMessage: err?.message || fallbackMessage,
    errorName: err?.name || 'Error',
    errorStack:
      err?.stack?.split('\n')?.slice(0, 5)?.join('\n') ||
      'No stack trace available',
  };
}

/** The trivial SUCCESS `outcome` block. */
export const successOutcome = (): AuditOutcome => ({
  status: OutComeStatus.SUCCESS,
});
