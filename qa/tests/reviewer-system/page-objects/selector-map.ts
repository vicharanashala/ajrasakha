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
  // PR #4 — analytics dashboard.  Mirrors the moderator dashboard route family
  // and is intentionally separate from the in-app analytics widgets.
  analytics: "/analytics",
  analyticsOverview: "/analytics/overview",
  analyticsDateRange: "/analytics/date-range",
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
    // PR #4 — queue details (the count summary at the top of /queue and the
    // collapsible section accordions).  Each section has a `data-testid`
    // matching `queue-section-{name}` with a sibling count badge and a card
    // container that renders the section rows when expanded.
    totalCount: "queue-total-count", // TODO(selector) — header "Total questions: N"
    sectionPrefix: "queue-section-", // sections keyed `queue-section-${name}`
    sectionCountPrefix: "queue-section-count-", // count badges `queue-section-count-${name}`
    sectionRowsPrefix: "queue-section-rows-", // card containers `queue-section-rows-${name}`
    sectionTogglePrefix: "queue-section-toggle-", // expand/collapse buttons
  },
  // PR #4 — explicit queue section names.  Centralised here so a rename in
  // the staging DOM is a one-line change.  Names mirror the moderator
  // dashboard's canonical status taxonomy:
  //   pending/unallocated → fresh queue
  //   in-review            → allocated + not closed
  //   stuck                → overdue / past SLA
  //   closed               → approved / pushed-to-GDB
  queueSections: {
    pending: "pending",
    unallocated: "unallocated",
    inReview: "in-review",
    stuck: "stuck",
    closed: "closed",
  } as const,
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
  // PR #4 — analytics dashboard.  Each metric card exposes a stable
  // data-testid `analytics-metric-${name}` and a child `analytics-metric-value`
  // whose textContent is the rendered value.  Date-range filter is assumed
  // to be an HTML <input type="date"> pair, falling back to a custom
  // listbox if not.
  analytics: {
    heading: "analytics-heading", // TODO(selector)
    metricPrefix: "analytics-metric-", // keyed `analytics-metric-${name}`
    metricValueSuffix: "-value", // combined: `analytics-metric-${name}-value`
    metricLabelSuffix: "-label", // combined: `analytics-metric-${name}-label`
    dateRangeStart: "analytics-date-range-start", // TODO(selector)
    dateRangeEnd: "analytics-date-range-end", // TODO(selector)
    dateRangeApply: "analytics-date-range-apply", // TODO(selector)
    dateRangeError: "analytics-date-range-error", // TODO(selector)
    emptyState: "analytics-empty-state", // TODO(selector)
    errorBanner: "analytics-error-banner", // TODO(selector)
    loadingIndicator: "analytics-loading", // TODO(selector)
  },
  // PR #4 — the metric names this dashboard actually renders.  Kept here so
  // analytics tests resolve them through SELECTOR_MAP rather than guessing.
  // If a metric is renamed on staging, update this map only.
  analyticsMetrics: {
    questionsReviewedThisWeek: "questions-reviewed-this-week",
    averageResponseTime: "average-response-time",
    gdbGrowth: "gdb-growth",
    closedToday: "closed-today",
    pendingTotal: "pending-total",
    openQueue: "open-queue",
  } as const,
} as const;

export type SelectorMap = typeof SELECTOR_MAP;
export type QueueSectionName =
  (typeof SELECTOR_MAP.queueSections)[keyof typeof SELECTOR_MAP.queueSections];
export type AnalyticsMetricName =
  (typeof SELECTOR_MAP.analyticsMetrics)[keyof typeof SELECTOR_MAP.analyticsMetrics];