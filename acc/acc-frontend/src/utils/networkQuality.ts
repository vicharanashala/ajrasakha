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
  const testUrl = `${env.apiBaseUrl()}/users/me`;

  for (let i = 0; i < 3; i++) {
    const start = performance.now();
    try {
      await fetch(testUrl, {
        method: "HEAD",
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      pings.push(performance.now() - start);
    } catch {
      // In case HEAD fails due to network drop or CORS, sample a small penalty
      pings.push(800);
    }
  }

  const avgRtt = Math.round(pings.reduce((a, b) => a + b, 0) / pings.length);

  // Cross-reference with browser Network Information API if available
  const navConn = typeof navigator !== "undefined" ? (navigator as any).connection : null;
  const navRtt = navConn?.rtt;
  const effectiveRtt = navRtt && typeof navRtt === "number" && navRtt > avgRtt
    ? Math.round((navRtt + avgRtt) / 2)
    : avgRtt;

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
