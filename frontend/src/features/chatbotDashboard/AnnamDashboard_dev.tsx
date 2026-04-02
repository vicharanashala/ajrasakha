import { useState, useRef, useCallback } from "react";
import { useDashboardData } from "./hooks/useDashboardData";
import { useDailyUserTrend } from "./hooks/useDailyUserTrend";
import type { Segment } from "./types";
// import { TopNav } from "./components/TopNav";
import { DashboardSidebar } from "./DashboardSidebar";
import type { DashboardView } from "./DashboardSidebar";
import { DashboardFilters } from "./DashboardFilters";
import type { DashboardFilterValues } from "./DashboardFilters";
import { EightCardsComponent } from "./MetricCard ";
import DailyActiveUsers from "./dailyActiveUsers";
import { ChannelSplitCard } from "./components/ChannelSplitCard";
import { DashboardQueryCategories } from "./DashboardQueryCategories";
import { DashboardFarmerSegments } from "./DashboardFarmerSegments";
import { AlertCard } from "./AlertCard";
import { Spinner } from "@/components/atoms/spinner";
import { GeoCard } from "./GeoCard";
import { HealthScoreCard } from "./HealthScoreCard";
import { SegmentDetailBanner } from "./components/SegmentDetailBanner";
import { StatusBar } from "./components/StatusBar";

const DEFAULT_FILTERS: DashboardFilterValues = {
  village: "all",
  crop: "all",
  season: "all",
  startTime: undefined,
  endTime: undefined,
};

export function AnnamDashboard_dev({ className }: { className?: string }) {
  const [activeSegment, setActiveSegment] = useState<Segment | null>(null);
  const [activeView, setActiveView]       = useState<DashboardView>("overview");
  const [filters, setFilters]             = useState<DashboardFilterValues>(DEFAULT_FILTERS);
  const segmentRowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const { data, isLoading, error } = useDashboardData(filters);
  const { data: dauTrend, isLoading: dauLoading } = useDailyUserTrend(30);

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
        @keyframes custom-pulse { 0%,100%{box-shadow:0 0 0 2.5px #3AAA5A,0 4px 24px rgba(58,170,90,0.18)} 50%{box-shadow:0 0 0 4px #3AAA5A,0 4px 32px rgba(58,170,90,0.28)} }
        .seg-pulse { animation: custom-pulse 1.2s ease 2; }
        ::-webkit-scrollbar { width: 5px; } ::-webkit-scrollbar-thumb { background: #ddd; border-radius: 4px; }
      `}</style>

      {/* <TopNav season={data?.meta?.season} /> */}

      {error && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, color: 'red' }}>
          Error fetching data: {error.message}
        </div>
      )}

      {!error && data && (
        <>
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
                {/* Page header */}                                
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>      
                  {/* <div>                                               
                    <div style={{ fontSize: 16, fontWeight: 500, color: "var(--foreground)" }}>National overview</div>                 
                    <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2 }}>Real-time platform health · Updated every 15 min · {data.meta.season}</div>                
                  </div> */}                                       
                  {/* <div style={{ display: "flex", gap: 8 }}>    
                    <button style={{ fontSize: 12, padding: "6px 12px", border: "0.5px solid var(--border)", borderRadius: 6, background: "var(--card)", color: "var(--muted-foreground)", cursor: "pointer" }}>Export PDF</button>                       
                    <button style={{ fontSize: 12, padding: "6px 12px", border: "0.5px solid #3AAA5A", borderRadius: 6, background: "rgba(58,170,90,0.1)", color: "#3AAA5A", cursor: "pointer" }}>Share report</button>                                   
                  </div> */}                                       
                </div> 

          <DashboardFilters filters={filters} onFilterChange={setFilters} />

          {activeSegment && <SegmentDetailBanner seg={activeSegment} onClose={clearSegment} />}

          <div ref={(el) => { sectionRefs.current["overview"] = el; }} className="relative">
            {isLoading && <Spinner text="Fetching metrics..." fullScreen={false} />}
            <EightCardsComponent kpiRow1={data.kpiRow1} kpiRow2={data.kpiRow2} />
          </div>

          {/* DAU trend + Channel split */}
          <div ref={(el) => { sectionRefs.current["usage-patterns"] = el; }}
            className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-3 mb-4">
            <DailyActiveUsers data={dauTrend} isLoading={dauLoading} />
            <ChannelSplitCard channelSplit={data.channelSplit} voiceAccuracy={data.voiceAccuracy} />
          </div>

          {/* 3-col row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
            <div ref={(el) => { sectionRefs.current["query-analysis"] = el; }}>
              <DashboardQueryCategories categories={data.queryCategories} />
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
              <AlertCard alerts={data.alerts} />
            </div>
          </div>

          {/* Geo + Health */}
          <div ref={(el) => { sectionRefs.current["geo-intelligence"] = el; }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
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
        </>
      )}
    </div>
  );
}
