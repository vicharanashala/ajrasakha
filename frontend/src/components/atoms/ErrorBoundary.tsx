import React from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "./button";

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onReset?: () => void;
  showDetails?: boolean;
  level?: "root" | "page" | "section";
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });

    console.error(
      `[ErrorBoundary${this.props.level ? ` (${this.props.level})` : ""}]`,
      error,
      errorInfo,
    );

    if (import.meta.env.DEV) {
      console.groupCollapsed(
        `%c ErrorBoundary caught: ${error.message}`,
        "color: #ef4444; font-weight: bold",
      );
      console.error("Error:", error);
      console.error("Component Stack:", errorInfo.componentStack);
      console.groupEnd();
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    this.props.onReset?.();
  };

  handleGoHome = () => {
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <ErrorFallback
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          onReset={this.handleReset}
          onGoHome={this.handleGoHome}
          showDetails={this.props.showDetails}
          level={this.props.level}
        />
      );
    }

    return this.props.children;
  }
}

function ErrorFallback({
  error,
  errorInfo,
  onReset,
  onGoHome,
  showDetails = false,
  level = "section",
}: {
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  onReset: () => void;
  onGoHome: () => void;
  showDetails?: boolean;
  level?: string;
}) {
  const [expanded, setExpanded] = React.useState(false);

  if (level === "root") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-destructive" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">
              Something went wrong
            </h1>
            <p className="text-muted-foreground">
              The application encountered an unexpected error. Please try
              refreshing the page.
            </p>
          </div>
          <div className="flex gap-3 justify-center">
            <Button onClick={onReset} variant="outline" className="gap-2">
              <RefreshCw className="w-4 h-4" />
              Try Again
            </Button>
            <Button onClick={onGoHome} className="gap-2">
              <Home className="w-4 h-4" />
              Go to Dashboard
            </Button>
          </div>
          {showDetails && error && (
            <div className="mt-4">
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                {expanded ? "Hide" : "Show"} details
              </button>
              {expanded && (
                <pre className="mt-2 p-3 bg-muted rounded-lg text-xs text-left overflow-auto max-h-48">
                  {error.message}
                  {"\n\n"}
                  {errorInfo?.componentStack}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (level === "page") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="max-w-sm w-full text-center space-y-4">
          <div className="flex justify-center">
            <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-destructive" />
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">
              Page Error
            </h2>
            <p className="text-sm text-muted-foreground">
              This page failed to load. Try refreshing or go back.
            </p>
          </div>
          <div className="flex gap-2 justify-center">
            <Button
              onClick={onReset}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </Button>
            <Button onClick={onGoHome} size="sm" className="gap-2">
              <Home className="w-3.5 h-3.5" />
              Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center p-6 rounded-lg border border-dashed border-destructive/30 bg-destructive/5">
      <div className="text-center space-y-3">
        <AlertTriangle className="w-5 h-5 text-destructive mx-auto" />
        <p className="text-sm text-muted-foreground">
          This section failed to load.
        </p>
        <Button
          onClick={onReset}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Try Again
        </Button>
      </div>
    </div>
  );
}
