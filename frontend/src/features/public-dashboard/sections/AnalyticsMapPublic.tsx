/* ============================================================
   ANALYTICS MAP PUBLIC - Uses existing AnalyticsMap component
   for public dashboard with public API access
============================================================ */

import AnalyticsMap from "@/features/chatbotDashboard/components/map/AnalyticsMap";
import {
  useAllStatesandUserDataPublic,
  useMapOverviewCountsPublic,
} from "@/features/chatbotDashboard/components/map/hooks/useMapAnalytics";
import { SectionHead } from "../components/SectionHead";

/* ============================================================
   MAIN COMPONENT
============================================================ */
export const AnalyticsMapPublic = () => {
  // Use public hook that doesn't redirect on 401.
  // source "all" ⇒ every source, not just AJRASAKHA.
  const { data: allStatesData } = useAllStatesandUserDataPublic({
    source: "all",
    userType: "all",
    enabled: true,
  });

  // Counts-only overview (questions / answers / avg closure / users / coordinators). The
  // hooks that normally feed these panels are authenticated and disabled here, so the map
  // receives them as props instead.
  // source "all" ⇒ questions from EVERY source (AJRASAKHA, WhatsApp, agri-expert,
  // outreach), not just one. Sending "annam" here filters down to AJRASAKHA alone.
  const { data: overview } = useMapOverviewCountsPublic({
    source: "all",
    userType: "all",
  });

  return (
    <section className="wrap" id="analytics-map" style={{ marginTop: 44 }}>
      <SectionHead title="State-wise Coverage" />
      <p className="sec-desc">
        Interactive map showing validated question-answer pairs across Indian
        states. Darker shades indicate higher coverage.
      </p>

      <AnalyticsMap
        source="all"
        userType="all"
        // "Active" needs a per-day active-user lookup that stays authenticated; the tile
        // simply renders empty on the public map.
        todayActiveFarmersData={undefined}
        allStatesData={allStatesData}
        isPublic
        // Same shape the authenticated hooks would have produced, built from counts only.
        questionStatusData={
          overview
            ? { closedVsTotalQuestions: overview.closedVsTotalQuestions }
            : undefined
        }
        allUsers={
          overview
            ? {
                totalUsers: overview.totalUsers,
                userRoleCounts: overview.userRoleCounts,
              }
            : undefined
        }
      />
    </section>
  );
};