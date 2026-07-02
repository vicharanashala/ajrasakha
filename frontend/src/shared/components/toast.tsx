/**
 * AgriToast — Custom toast notification system
 * Agriculture-themed, drop-in replacement for sonner
 *
 * Usage:
 *   1. Wrap your app: <ToastProvider />  (renders the container)
 *   2. Call anywhere: toast.success("Harvest recorded", { desc: "Plot A3 saved." })
 *
 * API:
 *   toast.success(title, options?)
 *   toast.error(title, options?)
 *   toast.warning(title, options?)
 *   toast.info(title, options?)
 *   toast.loading(title, options?)       ← persistent until dismissed or toast.dismiss(id)
 *   toast.promise(promise, messages)     ← auto loading → success/error
 *   toast.dismiss(id?)                   ← dismiss one or all
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToastType = "success" | "error" | "warning" | "info" | "loading";
export type ToastPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  /** Secondary description text */
  desc?: string;
  /** Duration in ms. 0 = persistent. Defaults to 4000 */
  duration?: number;
  /** Optional action button */
  action?: ToastAction;
  /** Override default position */
  position?: ToastPosition;
}

export interface ToastItem extends ToastOptions {
  id: string;
  type: ToastType;
  title: string;
  removing?: boolean;
}

export interface ToastPromiseMessages {
  loading: string;
  success: string | ((data: unknown) => string);
  error: string | ((err: unknown) => string);
  loadingDesc?: string;
  successDesc?: string | ((data: unknown) => string);
  errorDesc?: string | ((err: unknown) => string);
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface ToastContextValue {
  add: (item: Omit<ToastItem, "id">) => string;
  dismiss: (id?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

function useToastContext() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("AgriToast: <ToastProvider /> not found in tree.");
  return ctx;
}

// ─── Singleton bridge (for imperative API outside React tree) ─────────────────

let _bridge: ToastContextValue | null = null;

function setBridge(ctx: ToastContextValue) {
  _bridge = ctx;
}

// ─── Imperative API ───────────────────────────────────────────────────────────

function makeId() {
  return Math.random().toString(36).slice(2, 9);
}

function addToast(
  type: ToastType,
  title: string,
  options: ToastOptions = {}
): string {
  if (!_bridge) {
    console.warn("AgriToast: call toast() after <ToastProvider /> mounts.");
    return "";
  }
  return _bridge.add({ type, title, ...options });
}

export const toast = {
  success: (title: string, options?: ToastOptions) =>
    addToast("success", title, options),
  error: (title: string, options?: ToastOptions) =>
    addToast("error", title, options),
  warning: (title: string, options?: ToastOptions) =>
    addToast("warning", title, options),
  info: (title: string, options?: ToastOptions) =>
    addToast("info", title, options),
  loading: (title: string, options?: ToastOptions) =>
    addToast("loading", title, { duration: 0, ...options }),

  promise: <T,>(
    promise: Promise<T>,
    messages: ToastPromiseMessages
  ): Promise<T> => {
    const id = addToast("loading", messages.loading, {
      desc: messages.loadingDesc,
      duration: 0,
    });
    promise
      .then((data) => {
        _bridge?.dismiss(id);
        const title =
          typeof messages.success === "function"
            ? messages.success(data)
            : messages.success;
        const desc =
          typeof messages.successDesc === "function"
            ? messages.successDesc(data)
            : messages.successDesc;
        addToast("success", title, { desc });
      })
      .catch((err) => {
        _bridge?.dismiss(id);
        const title =
          typeof messages.error === "function"
            ? messages.error(err)
            : messages.error;
        const desc =
          typeof messages.errorDesc === "function"
            ? messages.errorDesc(err)
            : messages.errorDesc;
        addToast("error", title, { desc });
      });
    return promise;
  },

  dismiss: (id?: string) => _bridge?.dismiss(id),
};

// ─── Provider ─────────────────────────────────────────────────────────────────

interface ToastProviderProps {
  position?: ToastPosition;
  defaultDuration?: number;
  maxToasts?: number;
}

export function ToastProvider({
  position = "bottom-right",
  defaultDuration = 4000,
  maxToasts = 5,
}: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const add = useCallback(
    (item: Omit<ToastItem, "id">): string => {
      const id = makeId();
      setToasts((prev) => {
        const next = [...prev, { ...item, id }];
        return next.length > maxToasts ? next.slice(next.length - maxToasts) : next;
      });
      return id;
    },
    [maxToasts]
  );

  const dismiss = useCallback((id?: string) => {
    setToasts((prev) =>
      id
        ? prev.map((t) => (t.id === id ? { ...t, removing: true } : t))
        : prev.map((t) => ({ ...t, removing: true }))
    );
    setTimeout(
      () =>
        setToasts((prev) =>
          id ? prev.filter((t) => t.id !== id) : []
        ),
      240
    );
  }, []);

  // Register singleton bridge
  useEffect(() => {
    setBridge({ add, dismiss });
    return () => { _bridge = null; };
  }, [add, dismiss]);

  return (
    <ToastContext.Provider value={{ add, dismiss }}>
      <ToastContainer
        toasts={toasts}
        dismiss={dismiss}
        position={position}
        defaultDuration={defaultDuration}
      />
    </ToastContext.Provider>
  );
}

// ─── Container ────────────────────────────────────────────────────────────────

const POSITION_STYLES: Record<ToastPosition, React.CSSProperties> = {
  "top-left":      { top: 24, left: 24, flexDirection: "column" },
  "top-center":    { top: 24, left: "50%", transform: "translateX(-50%)", flexDirection: "column" },
  "top-right":     { top: 24, right: 24, flexDirection: "column" },
  "bottom-left":   { bottom: 24, left: 24, flexDirection: "column-reverse" },
  "bottom-center": { bottom: 24, left: "50%", transform: "translateX(-50%)", flexDirection: "column-reverse" },
  "bottom-right":  { bottom: 24, right: 24, flexDirection: "column-reverse" },
};

function ToastContainer({
  toasts,
  dismiss,
  position,
  defaultDuration,
}: {
  toasts: ToastItem[];
  dismiss: (id?: string) => void;
  position: ToastPosition;
  defaultDuration: number;
}) {
  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      style={{
        position: "fixed",
        zIndex: 9999,
        display: "flex",
        gap: 10,
        width: 340,
        pointerEvents: "none",
        ...POSITION_STYLES[position],
      }}
    >
      {toasts.map((t) => (
        <Toast
          key={t.id}
          item={t}
          dismiss={dismiss}
          defaultDuration={defaultDuration}
        />
      ))}
    </div>
  );
}

// ─── Single Toast ─────────────────────────────────────────────────────────────

const TYPE_COLORS = {
  success: {
    accent: "#3b6d11",
    iconBg: "#eaf3de",
    iconColor: "#3b6d11",
    progress: "#3b6d11",
    actionColor: "#3b6d11",
    actionBorder: "#97c459",
    actionHoverBg: "#eaf3de",
    leafColor: "#3b6d11",
  },
  error: {
    accent: "#a32d2d",
    iconBg: "#fcebeb",
    iconColor: "#a32d2d",
    progress: "#a32d2d",
    actionColor: "#a32d2d",
    actionBorder: "#f09595",
    actionHoverBg: "#fcebeb",
    leafColor: "#a32d2d",
  },
  warning: {
    accent: "#ba7517",
    iconBg: "#faeeda",
    iconColor: "#ba7517",
    progress: "#ba7517",
    actionColor: "#854f0b",
    actionBorder: "#ef9f27",
    actionHoverBg: "#faeeda",
    leafColor: "#ba7517",
  },
  info: {
    accent: "#185fa5",
    iconBg: "#e6f1fb",
    iconColor: "#185fa5",
    progress: "#185fa5",
    actionColor: "#185fa5",
    actionBorder: "#85b7eb",
    actionHoverBg: "#e6f1fb",
    leafColor: "#185fa5",
  },
  loading: {
    accent: "#534ab7",
    iconBg: "#eeedfe",
    iconColor: "#534ab7",
    progress: "#534ab7",
    actionColor: "#534ab7",
    actionBorder: "#afa9ec",
    actionHoverBg: "#eeedfe",
    leafColor: "#534ab7",
  },
} as const;

const TYPE_ICONS: Record<ToastType, React.ReactNode> = {
  success: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  ),
  error: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  ),
  warning: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  info: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
  loading: null,
};

function LeafWatermark({ color }: { color: string }) {
  return (
    <svg
      width="44"
      height="44"
      viewBox="0 0 40 40"
      style={{
        position: "absolute",
        bottom: -6,
        right: -2,
        opacity: 0.045,
        pointerEvents: "none",
        color,
      }}
      aria-hidden="true"
    >
      <path
        d="M4 36 C4 36 8 10 26 8 C26 8 34 8 36 4 C36 4 36 20 20 26 C12 30 8 34 4 36Z"
        fill="currentColor"
      />
      <path
        d="M4 36 C10 28 16 22 28 16"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Spinner({ color }: { color: string }) {
  return (
    <div
      style={{
        width: 14,
        height: 14,
        border: `2px solid ${color}33`,
        borderTopColor: color,
        borderRadius: "50%",
        animation: "agri-spin 0.8s linear infinite",
      }}
    />
  );
}

function Toast({
  item,
  dismiss,
  defaultDuration,
}: {
  item: ToastItem;
  dismiss: (id: string) => void;
  defaultDuration: number;
}) {
  const colors = TYPE_COLORS[item.type];
  const duration = item.duration !== undefined ? item.duration : defaultDuration;
  const persistent = duration === 0;
  const progressRef = useRef<HTMLDivElement>(null);
  const [actionHovered, setActionHovered] = useState(false);

  useEffect(() => {
    if (persistent || !progressRef.current) return;
    const el = progressRef.current;
    const raf = requestAnimationFrame(() => {
      el.style.transition = `width ${duration}ms linear`;
      el.style.width = "0%";
    });
    const timer = setTimeout(() => dismiss(item.id), duration);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [duration, persistent, item.id, dismiss]);

  return (
    <>
      {/* Keyframe injection — one-time */}
      <style>{`
        @keyframes agri-slide-in {
          from { transform: translateX(110%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @keyframes agri-slide-out {
          from { transform: translateX(0);    opacity: 1; }
          to   { transform: translateX(110%); opacity: 0; }
        }
        @keyframes agri-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
      <div
        role="status"
        aria-atomic="true"
        style={{
          pointerEvents: "all",
          background: "var(--color-background-primary, #fff)",
          border: "0.5px solid var(--color-border-secondary, rgba(0,0,0,0.15))",
          borderRadius: 12,
          padding: "12px 14px",
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          position: "relative",
          overflow: "hidden",
          animation: item.removing
            ? "agri-slide-out 0.22s cubic-bezier(0.55,0,1,0.45) forwards"
            : "agri-slide-in 0.28s cubic-bezier(0.22,1,0.36,1)",
          boxShadow: "0 4px 20px rgba(0,0,0,0.07)",
          minWidth: 0,
        }}
      >
        {/* Left accent bar */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 0, top: 0, bottom: 0,
            width: 3,
            background: colors.accent,
            borderRadius: "12px 0 0 12px",
          }}
        />

        {/* Icon */}
        <div
          aria-hidden="true"
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: colors.iconBg,
            color: colors.iconColor,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {item.type === "loading" ? (
            <Spinner color={colors.iconColor} />
          ) : (
            TYPE_ICONS[item.type]
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--color-text-primary, #111)",
              lineHeight: 1.3,
            }}
          >
            {item.title}
          </div>
          {item.desc && (
            <div
              style={{
                fontSize: 12,
                color: "var(--color-text-secondary, #666)",
                marginTop: 2,
                lineHeight: 1.4,
              }}
            >
              {item.desc}
            </div>
          )}
          {item.action && (
            <span
              role="button"
              tabIndex={0}
              onClick={() => {
                item.action!.onClick();
                dismiss(item.id);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  item.action!.onClick();
                  dismiss(item.id);
                }
              }}
              onMouseEnter={() => setActionHovered(true)}
              onMouseLeave={() => setActionHovered(false)}
              style={{
                display: "inline-block",
                marginTop: 6,
                fontSize: 11,
                fontWeight: 600,
                padding: "3px 8px",
                borderRadius: 5,
                cursor: "pointer",
                border: `0.5px solid ${colors.actionBorder}`,
                color: colors.actionColor,
                background: actionHovered ? colors.actionHoverBg : "transparent",
                letterSpacing: "0.02em",
                transition: "background 0.12s",
                userSelect: "none",
              }}
            >
              {item.action.label}
            </span>
          )}
        </div>

        {/* Close */}
        <button
          aria-label="Dismiss notification"
          onClick={() => dismiss(item.id)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--color-text-tertiary, #999)",
            fontSize: 16,
            padding: 0,
            flexShrink: 0,
            lineHeight: 1,
            marginTop: 1,
            display: "flex",
            alignItems: "center",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Progress bar */}
        {!persistent && (
          <div
            ref={progressRef}
            aria-hidden="true"
            style={{
              position: "absolute",
              bottom: 0, left: 0,
              height: 2,
              width: "100%",
              background: colors.progress,
              borderRadius: "0 0 0 12px",
            }}
          />
        )}

        {/* Decorative leaf watermark */}
        <LeafWatermark color={colors.leafColor} />
      </div>
    </>
  );
}

// ─── Hook (optional, for component-level control) ─────────────────────────────

// No-op fallback when context is not available (e.g., during SSR or early renders)
const noopToast = {
  success: () => {},
  error: () => {},
  warning: () => {},
  info: () => {},
  loading: () => "",
  dismiss: () => {},
};

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    console.warn("AgriToast: useToast() called outside <ToastProvider />. Using no-op fallback.");
    return noopToast;
  }
  return {
    success: (title: string, options?: ToastOptions) =>
      ctx.add({ type: "success", title, ...options }),
    error: (title: string, options?: ToastOptions) =>
      ctx.add({ type: "error", title, ...options }),
    warning: (title: string, options?: ToastOptions) =>
      ctx.add({ type: "warning", title, ...options }),
    info: (title: string, options?: ToastOptions) =>
      ctx.add({ type: "info", title, ...options }),
    loading: (title: string, options?: ToastOptions) =>
      ctx.add({ type: "loading", title, duration: 0, ...options }),
    dismiss: ctx.dismiss,
  };
}
