import { useState, useRef, useCallback } from "react";
import { DASHBOARD_DATA } from "./mockData";
import type { Segment } from "./types";
import { TopNav } from "./components/TopNav";
import { DashboardSidebar } from "./DashboardSidebar";
import type { DashboardView } from "./DashboardSidebar";
import { DashboardFilters } from "./DashboardFilters";
import { EightCardsComponent } from "./eight_cards_component";
import { DauTrendChart } from "./components/DauTrendChart";
import { ChannelSplitCard } from "./components/ChannelSplitCard";
import { QueryCategoriesCard } from "./components/QueryCategoriesCard";
import { FarmerSegmentsCard } from "./components/FarmerSegmentsCard";
import { AlertsCard } from "./components/AlertsCard";
import { GeoCard } from "./components/GeoCard";
import { HealthScoreCard } from "./components/HealthScoreCard";
import { SegmentDetailBanner } from "./components/SegmentDetailBanner";
import { StatusBar } from "./components/StatusBar";

export function AnnamDashboard_dev() {
  const [activeSegment, setActiveSegment]             = useState<Segment | null>(null);
  const [activeView, setActiveView]                   = useState<DashboardView>("overview");
  const segmentsRef    = useRef<HTMLDivElement>(null);
  const segmentRowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const data = DASHBOARD_DATA;

  const handleSegmentClick = useCallback((seg: Segment) => {
    if (activeSegment?.id === seg.id) { setActiveSegment(null); return; }
    setActiveSegment(seg);
    setTimeout(() => segmentsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  }, [activeSegment]);

  const clearSegment = () => setActiveSegment(null);

  return (
    <div style={{ fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif", background: "var(--background)", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        @keyframes slideIn { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse { 0%,100%{box-shadow:0 0 0 2.5px #3AAA5A,0 4px 24px rgba(58,170,90,0.18)} 50%{box-shadow:0 0 0 4px #3AAA5A,0 4px 32px rgba(58,170,90,0.28)} }
        .seg-pulse { animation: pulse 1.2s ease 2; }
        ::-webkit-scrollbar { width: 5px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: #ddd; border-radius: 4px; }
      `}</style>

      <TopNav season={data.meta.season} />

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <DashboardSidebar
          activeView={activeView}
          onViewChange={(view) => {
            setActiveView(view);
            if (view === "farmer-segments") {
              setTimeout(() => segmentsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
            }
          }}
          healthScore={70}
          healthLabel="Moderate · needs improvement"
        />

        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {/* Page header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 500, color: "var(--foreground)" }}>National overview</div>
              <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2 }}>Real-time platform health · Updated every 15 min · {data.meta.season}</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{ fontSize: 12, padding: "6px 12px", border: "0.5px solid var(--border)", borderRadius: 6, background: "var(--card)", color: "var(--muted-foreground)", cursor: "pointer" }}>Export PDF</button>
              <button style={{ fontSize: 12, padding: "6px 12px", border: "0.5px solid #3AAA5A", borderRadius: 6, background: "rgba(58,170,90,0.1)", color: "#3AAA5A", cursor: "pointer" }}>Share report</button>
            </div>
          </div>

          <DashboardFilters onFilterChange={(filters) => console.log("filters", filters)} />

          {activeSegment && <SegmentDetailBanner seg={activeSegment} onClose={clearSegment} />}

          <EightCardsComponent />

          {/* DAU trend + Channel split */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, marginBottom: 16 }}>
            <DauTrendChart />
            <ChannelSplitCard channelSplit={data.channelSplit} voiceAccuracy={data.voiceAccuracy} />
          </div>

          {/* 3-col row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 16 }}>
            <QueryCategoriesCard categories={data.queryCategories} />
            <FarmerSegmentsCard
              segments={data.farmerSegments}
              activeSegment={activeSegment}
              onSegmentClick={handleSegmentClick}
              onClear={clearSegment}
              segmentsRef={segmentsRef}
              segmentRowRefs={segmentRowRefs}
            />
            <AlertsCard alerts={data.alerts as any} />
          </div>

          {/* Geo + Health */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10, marginBottom: 16 }}>
            <GeoCard states={data.geoStates} />
            <HealthScoreCard pillars={data.healthPillars} />
          </div>
        </div>
      </div>

      <StatusBar
        lastSync={data.meta.lastSync}
        datasetVersion={data.meta.datasetVersion}
        llmVersion={data.meta.llmVersion}
        p0Bugs={data.meta.p0Bugs}
      />
    </div>
  );
}
