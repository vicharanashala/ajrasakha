import { useState, useRef, useCallback } from "react";
import { DASHBOARD_DATA } from "./mockData";
import type { Segment } from "./types";
import { TopNav } from "./components/TopNav";
import { DashboardSidebar } from "./DashboardSidebar";
import type { DashboardView } from "./DashboardSidebar";
import { DashboardFilters } from "./DashboardFilters";
import { EightCardsComponent } from "./MetricCard ";
import DailyActiveUsers from "./dailyActiveUsers";
import { ChannelSplitCard } from "./components/ChannelSplitCard";import { QueryCategoriesCard } from "./components/QueryCategoriesCard";
import { DashboardFarmerSegments } from "./DashboardFarmerSegments";
import { AlertsCard } from "./components/AlertsCard";
import { GeoCard } from "./components/GeoCard";
import { HealthScoreCard } from "./components/HealthScoreCard";
import { SegmentDetailBanner } from "./components/SegmentDetailBanner";
import { StatusBar } from "./components/StatusBar";

export function AnnamDashboard_dev({ className }: { className?: string }) {
  const [activeSegment, setActiveSegment] = useState<Segment | null>(null);
  const [activeView, setActiveView]       = useState<DashboardView>("overview");
  const segmentRowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const data = DASHBOARD_DATA;

  const sectionRefs = useRef<Partial<Record<DashboardView, HTMLDivElement | null>>>({});

  const scrollTo = (view: DashboardView) => {
    setTimeout(() => sectionRefs.current[view]?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const handleSegmentClick = useCallback((seg: Segment) => {
    if (activeSegment?.id === seg.id) { setActiveSegment(null); return; }
    setActiveSegment(seg);
    setTimeout(() => sectionRefs.current["farmer-segments"]?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  }, [activeSegment]);

  const clearSegment = () => setActiveSegment(null);

  return (
    <div className={className} style={{ fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif", background: "var(--background)", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500&display=swap');
        * { box-sizing: border-box;}
        @keyframes slideIn { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse { 0%,100%{box-shadow:0 0 0 2.5px #3AAA5A,0 4px 24px rgba(58,170,90,0.18)} 50%{box-shadow:0 0 0 4px #3AAA5A,0 4px 32px rgba(58,170,90,0.28)} }
        .seg-pulse { animation: pulse 1.2s ease 2; }
        ::-webkit-scrollbar { width: 5px; } ::-webkit-scrollbar-thumb { background: #ddd; border-radius: 4px; }
      `}</style>

      {/* <TopNav season={data.meta.season} /> */}

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <DashboardSidebar
          activeView={activeView}
          onViewChange={(view) => {
            setActiveView(view);
            scrollTo(view);
          }}
          healthScore={70}
          healthLabel="Moderate · needs improvement"
        />

        <div style={{ flex: 1, overflowY: "auto", padding: "0px 20px 20px 20px" }}>

          <DashboardFilters onFilterChange={() => {}} />

          {activeSegment && <SegmentDetailBanner seg={activeSegment} onClose={clearSegment} />}

          <div ref={(el) => { sectionRefs.current["overview"] = el; }}>
            <EightCardsComponent />
          </div>

          {/* DAU trend + Channel split */}
          <div ref={(el) => { sectionRefs.current["usage-patterns"] = el; }}
            style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, marginBottom: 16 }}>
            <DailyActiveUsers />
            <ChannelSplitCard channelSplit={data.channelSplit} voiceAccuracy={data.voiceAccuracy} />
          </div>

          {/* 3-col row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
            <div ref={(el) => { sectionRefs.current["query-analysis"] = el; }}>
              <QueryCategoriesCard categories={data.queryCategories} />
            </div>
            <div ref={(el) => { sectionRefs.current["farmer-segments"] = el; }}>
              <DashboardFarmerSegments
                segments={data.farmerSegments}
                activeSegment={activeSegment}
                onSegmentClick={handleSegmentClick}
                onClear={clearSegment}
                segmentRowRefs={segmentRowRefs}
              />
            </div>
            <div ref={(el) => { sectionRefs.current["bugs-ux"] = el; }}>
              <AlertsCard alerts={data.alerts} />
            </div>
          </div>

          {/* Geo + Health */}
          <div ref={(el) => { sectionRefs.current["geo-intelligence"] = el; }}
            style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10, marginBottom: 16 }}>
            <GeoCard states={data.geoStates} />
            <div ref={(el) => { sectionRefs.current["app-health"] = el; }}>
              <HealthScoreCard pillars={data.healthPillars} />
            </div>
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
