import React, { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, RefreshCw, Home, Mail } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Optional friendly title shown above the error message */
  title?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  retryCount: number;
}

/**
 * ErrorBoundary — Production-grade error boundary with retry, home, and report.
 *
 * Wraps feature-level trees and prevents a single render-time crash from
 * blanking the whole SPA.  Surfaces a calm, animated fallback UI rather
 * than a white screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    this.props.onError?.(error, errorInfo);

    if (typeof window !== "undefined") {
      // Log to console (Sentry, Datadog, etc. can hook here)
      // eslint-disable-next-line no-console
      console.error("[ErrorBoundary]", error, errorInfo);
      // Provide breadcrumb for debugging
      window.dispatchEvent(
        new CustomEvent("ajra:error", {
          detail: { error: error.message, stack: error.stack, errorInfo },
        }),
      );
    }
  }

  reset = (): void => {
    this.setState((prev) => ({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: prev.retryCount + 1,
    }));
  };

  reportIssue = (): void => {
    const subject = encodeURIComponent(
      `Bug report — ${this.state.error?.name ?? "Unknown error"}`,
    );
    const body = encodeURIComponent(
      `**What happened:**\n\n**Error:** ${this.state.error?.message ?? "n/a"}\n\n**Stack:**\n\`\`\`\n${
        this.state.error?.stack ?? ""
      }\n\`\`\`\n\n**Component stack:**\n\`\`\`\n${
        this.state.errorInfo?.componentStack ?? ""
      }\n\`\`\``,
    );
    window.location.href = `mailto:support@vicharanashala.ai?subject=${subject}&body=${body}`;
  };

  goHome = (): void => {
    window.location.href = "/";
  };

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.reset);
      }
      return (
        <div
          role="alert"
          aria-live="assertive"
          className="flex min-h-screen items-center justify-center bg-gradient-to-br from-red-50 via-white to-orange-50 px-4 py-12 dark:from-gray-900 dark:via-gray-950 dark:to-gray-900"
          data-testid="error-boundary"
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-2xl ring-1 ring-red-100 dark:bg-gray-800 dark:ring-gray-700"
          >
            <div className="flex flex-col items-center text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.1, type: "spring", stiffness: 220 }}
                className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400"
              >
                <AlertTriangle className="h-8 w-8" aria-hidden />
              </motion.div>

              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {this.props.title ?? "Something went wrong"}
              </h1>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                We hit an unexpected error. Your work is safe — try again or head
                back to the home page.
              </p>

              {this.state.retryCount > 0 && (
                <p className="mt-2 text-xs text-amber-600">
                  Retried {this.state.retryCount}{" "}
                  {this.state.retryCount === 1 ? "time" : "times"}.
                </p>
              )}

              <details className="mt-4 w-full rounded-lg bg-gray-50 p-3 text-left text-xs text-gray-700 dark:bg-gray-900 dark:text-gray-300">
                <summary className="cursor-pointer font-medium">
                  Technical details
                </summary>
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words">
                  {this.state.error.message}
                </pre>
              </details>

              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={this.reset}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  data-testid="error-retry"
                >
                  <RefreshCw className="h-4 w-4" /> Try again
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={this.goHome}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                >
                  <Home className="h-4 w-4" /> Go home
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={this.reportIssue}
                  className="inline-flex items-center gap-2 rounded-lg border border-transparent px-4 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:text-emerald-400 dark:hover:bg-emerald-900/30"
                >
                  <Mail className="h-4 w-4" /> Report
                </motion.button>
              </div>
            </div>
          </motion.div>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Hook-style wrapper for places where you can't use a class boundary directly */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  boundaryProps?: Omit<Props, "children">,
): React.FC<P> {
  const Wrapped: React.FC<P> = (props) => (
    <ErrorBoundary {...boundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  );
  Wrapped.displayName = `withErrorBoundary(${Component.displayName ?? Component.name ?? "Component"})`;
  return Wrapped;
}

/**
 * SectionBoundary — minimal boundary for in-page error containment.
 * Renders an inline notice instead of full-page fallback.
 */
export function SectionBoundary({
  children,
  label = "this section",
}: {
  children: ReactNode;
  label?: string;
}): React.ReactElement {
  return (
    <ErrorBoundary
      title={`Could not load ${label}`}
      fallback={(err, reset) => (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          <p className="font-medium">Could not load {label}</p>
          <p className="mt-1 text-xs opacity-80">{err.message}</p>
          <button
            onClick={reset}
            className="mt-2 rounded bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700"
          >
            Retry
          </button>
        </div>
      )}
    >
      <AnimatePresence mode="wait">{children}</AnimatePresence>
    </ErrorBoundary>
  );
}