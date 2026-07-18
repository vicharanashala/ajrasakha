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
  // Reserve detail-route helpers for the page objects to interpolate IDs into.
  detail: (questionId: string): string => `/queue/${questionId}`,
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
    rowStuckIndicator: "queue-row-stuck-indicator", // TODO(selector) — visual badge/icon for overdue work
    rowStuckTooltip: "queue-row-stuck-tooltip", // TODO(selector) — optional hover context
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
    approveButton: "question-approve-button", // TODO(selector)
    rejectButton: "question-reject-button", // TODO(selector)
    gdbConfirmationToast: "question-push-to-gdb-toast", // TODO(selector)
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
} as const;

export type SelectorMap = typeof SELECTOR_MAP;