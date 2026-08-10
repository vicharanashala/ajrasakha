/**
 * Annam Call Center (ACC) - Earth & Tech Design System
 * Unified design tokens, role track stream helpers, status badge utilities,
 * and interactive control helpers.
 *
 * All CSS custom properties are defined in `src/styles.css`.
 * This module provides TypeScript-level constants that mirror those tokens
 * for use in non-CSS contexts (e.g., chart colors, canvas drawing,
 * programmatic style references).
 */

// ─── Design Token Constants ───────────────────────────────────────────────────

export const EARTH_TECH_TOKENS = {
  global: {
    primaryAccent: '#0F5132',
    primaryAccentHover: '#0A3822',
    primaryAccentFg: '#FFFFFF',
    secondaryAccent: '#D97706',
    secondaryAccentHover: '#B45309',
    secondaryAccentFg: '#FFFFFF',
    appBg: '#F8FAFC',
    surfaceBg: '#FFFFFF',
    neutralBorder: '#E2E8F0',
    mainText: '#0F172A',
    mutedText: '#64748B',
    focusRing: '#0F5132',
    focusRingOffset: '#F8FAFC',
  },
  globalDark: {
    primaryAccent: '#10B981',
    primaryAccentHover: '#059669',
    primaryAccentFg: '#022C22',
    secondaryAccent: '#FBBF24',
    secondaryAccentHover: '#F59E0B',
    secondaryAccentFg: '#422006',
    appBg: '#0F172A',
    surfaceBg: '#1E293B',
    neutralBorder: '#334155',
    mainText: '#F8FAFC',
    mutedText: '#94A3B8',
    focusRing: '#10B981',
    focusRingOffset: '#0F172A',
  },
  roles: {
    farmer: {
      tint: '#E8F5E9',
      border: '#2E7D32',
      text: '#1B5E20',
      darkTint: '#064E3B',
      darkBorder: '#10B981',
      darkText: '#A7F3D0',
    },
    agent: {
      tint: '#F0F4F8',
      border: '#3B82F6',
      text: '#1E3A8A',
      darkTint: '#1E3A8A',
      darkBorder: '#60A5FA',
      darkText: '#BFDBFE',
    },
    pipeline: {
      tint: '#F5F3FF',
      border: '#7C3AED',
      text: '#4C1D95',
      darkTint: '#4C1D95',
      darkBorder: '#A78BFA',
      darkText: '#DDD6FE',
    },
  },
  status: {
    online: {
      bg: '#DCFCE7',
      text: '#16A34A',
      darkBg: '#064E3B',
      darkText: '#4ADE80',
    },
    busy: {
      bg: '#FEF3C7',
      text: '#D97706',
      darkBg: '#78350F',
      darkText: '#FBBF24',
    },
    offline: {
      bg: '#FEE2E2',
      text: '#DC2626',
      darkBg: '#7F1D1D',
      darkText: '#F87171',
    },
  },
} as const;

// ─── CSS Variable Map ─────────────────────────────────────────────────────────

/**
 * Maps each design token to its CSS custom property name.
 * Useful for programmatic access (e.g., `getComputedStyle`, inline styles).
 *
 * @example
 * ```ts
 * const el = document.documentElement;
 * const accent = getComputedStyle(el).getPropertyValue(DESIGN_TOKENS_CSS_MAP.primaryAccent);
 * ```
 */
export const DESIGN_TOKENS_CSS_MAP = {
  // Global
  primaryAccent: '--primary-accent',
  primaryAccentHover: '--primary-accent-hover',
  primaryAccentFg: '--primary-accent-fg',
  secondaryAccent: '--secondary-accent',
  secondaryAccentHover: '--secondary-accent-hover',
  secondaryAccentFg: '--secondary-accent-fg',
  appBg: '--app-bg',
  surfaceBg: '--surface-bg',
  neutralBorder: '--neutral-border',
  mainText: '--main-text',
  mutedText: '--muted-text',
  focusRing: '--focus-ring',
  focusRingOffset: '--focus-ring-offset',

  // Roles
  farmerTint: '--farmer-tint',
  farmerBorder: '--farmer-border',
  farmerText: '--farmer-text',
  agentTint: '--agent-tint',
  agentBorder: '--agent-border',
  agentText: '--agent-text',
  pipelineTint: '--pipeline-tint',
  pipelineBorder: '--pipeline-border',
  pipelineText: '--pipeline-text',

  // Status
  statusOnlineBg: '--status-online-bg',
  statusOnlineText: '--status-online-text',
  statusBusyBg: '--status-busy-bg',
  statusBusyText: '--status-busy-text',
  statusOfflineBg: '--status-offline-bg',
  statusOfflineText: '--status-offline-text',

  // Tooltip
  tooltipBg: '--tooltip-bg',
  tooltipText: '--tooltip-text',
} as const;

// ─── Type Definitions ─────────────────────────────────────────────────────────

export type StatusType = 'online' | 'connected' | 'busy' | 'live' | 'debouncing' | 'offline' | 'disconnected' | 'error';
export type RoleType = 'farmer' | 'inbound' | 'agent' | 'outbound' | 'pipeline' | 'ai' | 'langgraph';
export type ControlType = 'emerald' | 'harvest' | 'outline-emerald' | 'outline-harvest';

// ─── Status Badge Helper ──────────────────────────────────────────────────────

/**
 * Returns reusable status badge CSS classes.
 * Theme-aware via CSS variables — works in both light and dark mode automatically.
 *
 * @example
 * ```tsx
 * <span className={getStatusBadgeClass('online')}>Online</span>
 * ```
 */
export function getStatusBadgeClass(status: StatusType): string {
  const base = 'px-2.5 py-0.5 rounded-full text-xs font-semibold transition-colors duration-200 select-none';
  const s = status.toLowerCase();
  if (['online', 'connected'].includes(s)) {
    return `badge-status-online ${base}`;
  }
  if (['busy', 'live', 'debouncing'].includes(s)) {
    return `badge-status-busy ${base}`;
  }
  return `badge-status-offline ${base}`;
}

// ─── Role Track Chat Bubble Helper ────────────────────────────────────────────

/**
 * Returns role-separated stream chat bubble CSS classes.
 * Applies role-specific tint, border, and text color via CSS variables.
 *
 * @example
 * ```tsx
 * <div className={getRoleTrackClass('farmer')}>Farmer said...</div>
 * ```
 */
export function getRoleTrackClass(role: RoleType): string {
  const base = 'p-3 rounded-xl text-sm font-medium transition-colors duration-150';
  const r = role.toLowerCase();
  if (['farmer', 'inbound'].includes(r)) {
    return `chat-bubble-farmer ${base}`;
  }
  if (['agent', 'outbound'].includes(r)) {
    return `chat-bubble-agent ${base}`;
  }
  return `chat-bubble-pipeline ${base}`;
}

// ─── Interactive Control Helper ───────────────────────────────────────────────

/**
 * Returns interactive control (button) CSS classes.
 * All variants include focus-visible styles and hover transitions.
 *
 * @example
 * ```tsx
 * <button className={getControlClass('emerald')}>Accept Call</button>
 * <button className={getControlClass('outline-harvest')}>Snooze</button>
 * ```
 */
export function getControlClass(type: ControlType): string {
  const base = 'px-4 py-2 rounded-lg font-medium shadow-sm cursor-pointer disabled:opacity-50 disabled:pointer-events-none';
  switch (type) {
    case 'emerald':
      return `btn-primary-emerald ${base}`;
    case 'harvest':
      return `btn-secondary-harvest ${base}`;
    case 'outline-emerald':
      return `btn-outline-emerald ${base}`;
    case 'outline-harvest':
      return `btn-outline-harvest ${base}`;
    default:
      return `btn-primary-emerald ${base}`;
  }
}

// ─── Convenience Preset Strings ───────────────────────────────────────────────

export const INTERACTIVE_CONTROLS = {
  primaryEmerald: 'btn-primary-emerald px-4 py-2 rounded-lg font-medium shadow-sm',
  secondaryHarvest: 'btn-secondary-harvest px-4 py-2 rounded-lg font-medium shadow-sm',
  outlineEmerald: 'btn-outline-emerald px-4 py-2 rounded-lg font-medium shadow-sm',
  outlineHarvest: 'btn-outline-harvest px-4 py-2 rounded-lg font-medium shadow-sm',
} as const;
