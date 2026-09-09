import { createFileRoute } from "@tanstack/react-router";
import { GapDashboardPage } from "@/features/gdb-gap-dashboard/GapDashboardPage";

/**
 * `/gdb-gap-report` — production-integrated dashboard for the ACC
 * `GET /gdb/gap-report` endpoint. The page itself lives in
 * `src/features/gdb-gap-dashboard/GapDashboardPage.tsx`; this file is
 * only the thin TanStack-Router glue so the route registration can be
 * code-split / lazy if desired.
 */
export const Route = createFileRoute("/gdb-gap-report")({
  component: GapDashboardPage,
});