import { env } from "@/config/env";
import type { GapReport } from "./types";

// acc_api is a separate FastAPI service (no Firebase auth, same as the
// existing FAQ/PoP servers in features/faq-pop/api.ts) — called directly,
// not proxied through the main Node backend.
const GAP_API = (env.gdbGapApiUrl() || "").replace(/\/$/, "");

export class GapReportNotFoundError extends Error {}

export async function getGapReport(): Promise<GapReport> {
  const res = await fetch(`${GAP_API}/gdb/gap-report`);

  if (res.status === 404) {
    throw new GapReportNotFoundError(
      "No gap report available yet. Run gap_pipeline.py to generate one.",
    );
  }

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {
      // ignore parse error
    }
    throw new Error(detail);
  }

  return res.json();
}
