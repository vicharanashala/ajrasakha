import { useEffect, useState } from "react";
import type { LiveStatus } from "@/hooks/api/dashboard/usePublicCountsSocket";

/** How long after a push the badge shows its "just updated" flash. */
const FLASH_MS = 2600;

const LABELS: Record<LiveStatus, string> = {
  live: "LIVE",
  connecting: "CONNECTING",
  offline: "RECONNECTING",
};

/**
 * The strip between the header and the carousel: an honest indicator of the dashboard's
 * realtime feed. It reflects the actual WebSocket state rather than always claiming
 * "live" — a dot that pulses while connected, and a brief flash whenever counts arrive.
 */
export const LiveBadge = ({
  status,
  lastUpdateAt,
}: {
  status: LiveStatus;
  lastUpdateAt: number | null;
}) => {
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (!lastUpdateAt) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), FLASH_MS);
    return () => clearTimeout(t);
  }, [lastUpdateAt]);

  return (
    <div className="live-strip">
      <span
        className={`live-badge ${status}${flash ? " flash" : ""}`}
        role="status"
        aria-live="polite"
      >
        <span className="live-dot" aria-hidden="true" />
        {LABELS[status]}
      </span>
    </div>
  );
};
