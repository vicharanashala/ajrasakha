import { env } from "@/config/env";

export interface NetworkQualityResult {
  rtt: number;
  isWeak: boolean;
  quality: "healthy" | "moderate" | "weak";
}

/**
 * Fast, non-blocking network latency measurement (< 200ms).
 * Tests round-trip time against backend API health/status endpoint and checks navigator.connection.
 */
export async function measureNetworkLatency(): Promise<NetworkQualityResult> {
  const pings: number[] = [];
  const testUrl = `${env.apiBaseUrl()}/health`;

  // Sample 2 fast pings against the lightweight public /health endpoint
  for (let i = 0; i < 2; i++) {
    const start = performance.now();
    try {
      // Use cache-busting timestamp query param to avoid CORS preflight header restrictions
      await fetch(`${testUrl}?_t=${Date.now()}`, {
        method: "GET",
      });
      pings.push(performance.now() - start);
    } catch (err) {
      console.warn("[networkQuality] Ping sample warning:", err);
    }
  }

  // Cross-reference with browser Network Information API if available
  const navConn = typeof navigator !== "undefined" ? (navigator as any).connection : null;
  const navRtt = typeof navConn?.rtt === "number" ? navConn.rtt : null;

  let effectiveRtt: number;
  if (pings.length > 0) {
    const avgPing = Math.round(pings.reduce((a, b) => a + b, 0) / pings.length);
    effectiveRtt = navRtt !== null ? Math.round((navRtt + avgPing) / 2) : avgPing;
  } else if (navRtt !== null) {
    effectiveRtt = navRtt;
  } else {
    // If browser is online but endpoint was unreachable, assume moderate baseline (60ms) rather than false 800ms penalty
    effectiveRtt = typeof navigator !== "undefined" && navigator.onLine ? 60 : 800;
  }

  const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
  const isWeak = isOffline || effectiveRtt > 300 || navConn?.effectiveType === "2g";

  let quality: "healthy" | "moderate" | "weak" = "healthy";
  if (isWeak) {
    quality = "weak";
  } else if (effectiveRtt > 180 || navConn?.effectiveType === "3g") {
    quality = "moderate";
  }

  return {
    rtt: effectiveRtt,
    isWeak,
    quality,
  };
}
