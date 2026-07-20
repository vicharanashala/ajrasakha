import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Skeleton — Animated placeholder with shimmer. Used while data is loading.
 *
 * Use anywhere you would render placeholder content during fetch — table
 * rows, cards, list items, etc.  Provides a calm, brand-consistent loading
 * state across the platform.
 */
export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Tailwind width class, e.g. "w-32" — defaults to "w-full" */
  width?: string;
  /** Tailwind height class, e.g. "h-4" */
  height?: string;
  /** Rounded corner variant */
  rounded?: "none" | "sm" | "md" | "lg" | "full";
  /** Disable animation if needed */
  static?: boolean;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = "w-full",
  height = "h-4",
  rounded = "md",
  static: isStatic = false,
  className,
  ...rest
}) => {
  const roundedClass = {
    none: "rounded-none",
    sm: "rounded-sm",
    md: "rounded",
    lg: "rounded-lg",
    full: "rounded-full",
  }[rounded];

  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      data-testid="skeleton"
      className={cn(
        "relative overflow-hidden bg-gray-200/70 dark:bg-gray-700/40",
        width,
        height,
        roundedClass,
        className,
      )}
      {...rest}
    >
      {!isStatic && (
        <motion.div
          aria-hidden
          className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/60 to-transparent dark:via-white/10"
          animate={{ translateX: ["-100%", "100%"] }}
          transition={{
            duration: 1.4,
            ease: "easeInOut",
            repeat: Infinity,
          }}
        />
      )}
    </div>
  );
};

/** Card-shaped skeleton with header + 3 lines */
export const SkeletonCard: React.FC<{ className?: string }> = ({
  className,
}) => (
  <div
    className={cn(
      "rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800",
      className,
    )}
  >
    <div className="mb-3 flex items-center gap-3">
      <Skeleton width="w-10" height="h-10" rounded="full" />
      <div className="flex-1 space-y-2">
        <Skeleton width="w-1/3" height="h-4" />
        <Skeleton width="w-1/2" height="h-3" />
      </div>
    </div>
    <Skeleton width="w-full" height="h-3" />
    <div className="mt-2 space-y-2">
      <Skeleton width="w-full" height="h-3" />
      <Skeleton width="w-5/6" height="h-3" />
    </div>
  </div>
);

/** Table-shaped skeleton: 5 rows × 4 columns */
export const SkeletonTable: React.FC<{
  rows?: number;
  columns?: number;
  className?: string;
}> = ({ rows = 5, columns = 4, className }) => (
  <div
    className={cn(
      "overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800",
      className,
    )}
  >
    <div className="grid border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/50" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton key={i} width="w-3/4" height="h-3" />
      ))}
    </div>
    {Array.from({ length: rows }).map((_, r) => (
      <div
        key={r}
        className="grid border-b border-gray-100 px-4 py-3 last:border-0 dark:border-gray-700"
        style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
      >
        {Array.from({ length: columns }).map((__, c) => (
          <Skeleton key={c} width={c === 0 ? "w-5/6" : "w-full"} height="h-3" />
        ))}
      </div>
    ))}
  </div>
);

/** Chat-message skeleton — bubble + avatar */
export const SkeletonChatMessage: React.FC<{ align?: "left" | "right" }> = ({
  align = "left",
}) => (
  <div
    className={cn(
      "flex gap-3",
      align === "right" ? "flex-row-reverse" : "flex-row",
    )}
  >
    <Skeleton width="w-9" height="h-9" rounded="full" />
    <div className="flex-1 space-y-2">
      <Skeleton width={align === "right" ? "w-1/2 ml-auto" : "w-1/3"} height="h-3" />
      <Skeleton width="w-full" height="h-4" />
      <Skeleton width="w-5/6" height="h-4" />
    </div>
  </div>
);

/** Queue / list-shaped skeleton */
export const SkeletonList: React.FC<{ items?: number; className?: string }> = ({
  items = 4,
  className,
}) => (
  <div className={cn("space-y-3", className)}>
    {Array.from({ length: items }).map((_, i) => (
      <div
        key={i}
        className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800"
      >
        <Skeleton width="w-10" height="h-10" rounded="md" />
        <div className="flex-1 space-y-2">
          <Skeleton width="w-2/3" height="h-3" />
          <Skeleton width="w-1/2" height="h-3" />
        </div>
        <Skeleton width="w-16" height="h-6" rounded="full" />
      </div>
    ))}
  </div>
);

/** Spinner — animated ring used by inline buttons / status indicators */
export const Spinner: React.FC<{
  size?: "sm" | "md" | "lg";
  className?: string;
}> = ({ size = "md", className }) => {
  const sizes = {
    sm: "h-4 w-4 border-2",
    md: "h-6 w-6 border-2",
    lg: "h-10 w-10 border-4",
  };
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        "inline-block animate-spin rounded-full border-emerald-600 border-t-transparent",
        sizes[size],
        className,
      )}
    />
  );
};

/** Full-page loader — used while the entire shell boots */
export const FullPageLoader: React.FC<{ label?: string }> = ({
  label = "Loading…",
}) => (
  <div
    role="status"
    aria-live="polite"
    data-testid="full-page-loader"
    className="flex h-screen w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-emerald-50 via-white to-amber-50 dark:from-gray-900 dark:via-gray-950 dark:to-gray-900"
  >
    <Spinner size="lg" />
    <p className="text-sm font-medium text-gray-600 dark:text-gray-300">{label}</p>
  </div>
);