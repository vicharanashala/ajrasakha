import React, { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wifi, WifiOff, RefreshCw, CheckCircle2 } from "lucide-react";

/**
 * NetworkStatus — A non-intrusive banner that appears when the user loses
 * their internet connection, plus a brief "Back online!" toast on reconnect.
 *
 * Drops into any page via <NetworkStatus /> — no props needed.
 */
export const NetworkStatus: React.FC = () => {
  const [online, setOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [showReconnected, setShowReconnected] = useState<boolean>(false);
  const [retrying, setRetrying] = useState<boolean>(false);

  const handleOnline = useCallback(() => {
    setOnline(true);
    setShowReconnected(true);
    const t = setTimeout(() => setShowReconnected(false), 4000);
    return () => clearTimeout(t);
  }, []);

  const handleOffline = useCallback(() => setOnline(false), []);

  useEffect(() => {
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [handleOnline, handleOffline]);

  const retry = useCallback(() => {
    setRetrying(true);
    // Attempt a tiny request to verify the network is back
    fetch("/healthz", { method: "HEAD", cache: "no-store" })
      .then(() => {
        setOnline(true);
        setShowReconnected(true);
        setTimeout(() => setShowReconnected(false), 4000);
      })
      .catch(() => setOnline(false))
      .finally(() => setRetrying(false));
  }, []);

  return (
    <>
      <AnimatePresence>
        {!online && (
          <motion.div
            key="offline-banner"
            initial={{ y: -80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 25 }}
            role="status"
            aria-live="polite"
            data-testid="offline-banner"
            className="fixed left-0 right-0 top-0 z-[60] flex items-center justify-center gap-3 bg-red-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg"
          >
            <WifiOff className="h-4 w-4 animate-pulse" aria-hidden />
            <span>You're offline. Some features may be unavailable.</span>
            <button
              onClick={retry}
              disabled={retrying}
              className="inline-flex items-center gap-1.5 rounded bg-white/20 px-2 py-1 text-xs font-semibold backdrop-blur transition hover:bg-white/30 disabled:opacity-60"
              data-testid="retry-connection"
            >
              <RefreshCw
                className={`h-3 w-3 ${retrying ? "animate-spin" : ""}`}
              />
              {retrying ? "Retrying…" : "Retry"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showReconnected && online && (
          <motion.div
            key="online-toast"
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            role="status"
            aria-live="polite"
            className="fixed left-1/2 top-4 z-[60] -translate-x-1/2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-lg"
          >
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              <Wifi className="h-4 w-4" />
              Back online!
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

/**
 * useNetworkStatus — Hook version for components that need to react to
 * online/offline state directly.
 */
export function useNetworkStatus(): {
  online: boolean;
  lastChangedAt: Date | null;
} {
  const [online, setOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [lastChangedAt, setLastChangedAt] = useState<Date | null>(null);

  useEffect(() => {
    const on = () => {
      setOnline(true);
      setLastChangedAt(new Date());
    };
    const off = () => {
      setOnline(false);
      setLastChangedAt(new Date());
    };
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  return { online, lastChangedAt };
}