/**
 * SELECTOR_MAP
 *
 * One source of truth for every `data-testid` and route the reviewer-system
 * page objects reference.  When the staging DOM uses something different,
 * edit it here — the page-object files pick up the change automatically.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  Why centralise?
 * ─────────────────────────────────────────────────────────────────────────────
 *  • One place to grep when the frontend team renames a testid.
 *  • The reviewer-system frontend is OUT of this monorepo
 *    (desk.vicharanashala.ai), so we cannot grep our way to the right
 *    values — we depend on a contract.
 *  • Tests fail loudly with a "0 matches" message if the testid is wrong,
 *    so a wrong entry here surfaces in CI within seconds.
 *
 *  Anything marked `// TODO(selector)` in the page objects resolves
 *  through this map.  Once staging confirms a real selector, replace
 *  the placeholder value here and every test using it is updated.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const Routes = {
  login: "/login",
  dashboard: "/dashboard",
  queue: "/queue",
  // Moderator detail view (used by PR #1).
  detail: (questionId: string): string => `/queue/${questionId}`,
  // Expert surfaces (added in PR #2).
  expertInbox: "/expert/inbox",
  expertHistory: "/expert/history",
  expertDetail: (questionId: string): string => `/expert/inbox/${questionId}`,
} as const;

export const SELECTOR_MAP = {
  login: {
    email: "login-email", // TODO(selector)
    password: "login-password", // TODO(selector)
    submit: "login-submit", // TODO(selector)
    error: "login-error", // TODO(selector)
    forgotPassword: "login-forgot-password", // TODO(selector) — optional
  },
  queue: {
    heading: "queue-heading", // TODO(selector)
    rowPrefix: "queue-row-", // rows are keyed `queue-row-${questionId}`
    rowStatus: "queue-row-status", // TODO(selector) — badge inside each row
    empty: "queue-empty", // TODO(selector)
    filterStatus: "queue-filter-status", // TODO(selector) — <select> or listbox
    filterLanguage: "queue-filter-language", // TODO(selector)
    filterDate: "queue-filter-date", // TODO(selector)
    searchInput: "queue-search-input", // TODO(selector)
    applyFilter: "queue-apply-filter", // TODO(selector) — may be auto-applied
  },
  detail: {
    heading: "question-detail-heading", // TODO(selector)
    statusBadge: "question-detail-status", // TODO(selector)
    expertPicker: "allocate-expert-picker", // TODO(selector)
    allocateButton: "allocate-submit", // TODO(selector)
    allocationToast: "allocate-success-toast", // TODO(selector)
    allocationError: "allocate-error", // TODO(selector)
  },
  dashboard: {
    heading: "dashboard-heading", // TODO(selector)
    statPrefix: "dashboard-stat-", // e.g. `dashboard-stat-pending`
    userMenu: "user-menu", // TODO(selector) — top-right avatar / initials
    logoutButton: "user-menu-logout", // TODO(selector)
  },
  /**
   * Expert surfaces (PR #2).
   *
   * The expert:
   *  • Inbox      /expert/inbox            — assigned, not-yet-answered
   *  • Detail     /expert/inbox/:questionId — write/submit/draft answer
   *  • History    /expert/history          — past submissions
   *
   * The inbox rows are keyed `expert-inbox-row-${questionId}` so tests can
   * target a specific assignment without positional indexing.  The detail
   * page exposes a rich-text answer input (textarea or contenteditable),
   * separate "Save draft" and "Submit for review" CTAs, an inline AI-draft
   * region (when present), and a status badge the test reads after the
   * submission side-effect fires.
   */
  expert: {
    inbox: {
      heading: "expert-inbox-heading", // TODO(selector)
      rowPrefix: "expert-inbox-row-", // expert-inbox-row-${questionId}
      rowLanguage: "expert-inbox-row-language", // TODO(selector)
      rowDeadline: "expert-inbox-row-deadline", // TODO(selector) — SLA / due-by
      rowStatus: "expert-inbox-row-status", // TODO(selector)
      empty: "expert-inbox-empty", // TODO(selector)
      linkHistory: "expert-inbox-link-history", // TODO(selector)
    },
    answer: {
      heading: "expert-answer-heading", // TODO(selector)
      statusBadge: "expert-answer-status", // TODO(selector)
      farmerQuery: "expert-farmer-query", // TODO(selector) — original text
      aiDraft: "expert-answer-ai-draft", // TODO(selector) — optional AI prefilled
      input: "expert-answer-input", // TODO(selector) — textarea / rich-text
      submit: "expert-answer-submit", // TODO(selector)
      draftSave: "expert-answer-draft-save", // TODO(selector)
      draftSavedToast: "expert-answer-draft-saved-toast", // TODO(selector)
      submittedToast: "expert-answer-submitted-toast", // TODO(selector)
      validationError: "expert-answer-validation-error", // TODO(selector)
      handoverToast: "expert-answer-handover-toast", // TODO(selector) — "sent for review"
    },
    history: {
      heading: "expert-history-heading", // TODO(selector)
      rowPrefix: "expert-history-row-", // expert-history-row-${questionId}
      empty: "expert-history-empty", // TODO(selector)
    },
    denied: {
      heading: "expert-permission-denied", // TODO(selector) — generic 403/404 region
    },
  },
} as const;

export type SelectorMap = typeof SELECTOR_MAP;
