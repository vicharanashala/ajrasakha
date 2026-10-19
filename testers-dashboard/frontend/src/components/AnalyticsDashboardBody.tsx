import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import { TrendChart, buildXAxisTicks, buildRobustRangeSeries, type TrendChartProps } from "./TrendChart";
import { FilterBar, type IFilterField, type IFilterOptionDetail, type ITypeTreeOptions } from "./FilterBar";
import { ExecutiveSummary } from "./ExecutiveSummary";
import { AdditionalMetrics } from "./AdditionalMetrics";
import { DiagnosticsRow, type IDefectsTab, type ITeamBreakdown } from "./DiagnosticsRow";
import { InfoPopover } from "./InfoPopover";
import { UNASSIGNED_TEAM_LABEL } from "../utils";
import { FILTER_FIELDS } from "./analyticsFilterFields";
import type { IAnalyticsFilterState } from "../hooks/useAnalyticsFilterState";
import type { IAnalyticsViewState } from "../hooks/useAnalyticsViewState";
import type { ITestersDashboardSummaryResponse } from "../services/testersDashboardSummaryService";

export interface AnalyticsDashboardBodyProps {
  data: ITestersDashboardSummaryResponse;
  filterState: IAnalyticsFilterState;
  viewState: IAnalyticsViewState;
  // Database Logs Analytics passes its own filter fields, options-with-counts,
  // and Type of Question tree; Google Sheet Analytics uses the defaults.
  filterFields?: IFilterField[];
  optionDetails?: Record<string, IFilterOptionDetail[]>;
  typeTree?: ITypeTreeOptions;
}

// Source-agnostic dashboard body - FilterBar, Executive Summary, Additional
// Metrics, Diagnostics, and the Score Trend chart - rendered from an
// already-loaded summary response. Shared by SheetAnalyticsSection and
// DbAnalyticsSection; each section owns its own data fetching, header, and
// loading/error states.
export function AnalyticsDashboardBody({
  data,
  filterState,
  viewState,
  filterFields = FILTER_FIELDS,
  optionDetails,
  typeTree,
}: AnalyticsDashboardBodyProps) {
  const { filters, setFilters, customStart, setCustomStart, customEnd, setCustomEnd, typeBranchState } = filterState;
  const {
    releaseHealthExpanded,
    setReleaseHealthExpanded,
    weakestModuleExpanded,
    setWeakestModuleExpanded,
    defectsView,
    switchDefectsView,
    activeDefectsTab,
    setActiveDefectsTab,
    selectedTeam,
    toggleSelectedTeam,
    activeChartTab,
    setActiveChartTab,
    pages: {
      openTicketsPageCritical,
      setOpenTicketsPageCritical,
      closedTicketsPageCritical,
      setClosedTicketsPageCritical,
      onHoldTicketsPageCritical,
      setOnHoldTicketsPageCritical,
      escalatedTicketsPageCritical,
      setEscalatedTicketsPageCritical,
      openTicketsPageAll,
      setOpenTicketsPageAll,
      closedTicketsPageAll,
      setClosedTicketsPageAll,
      onHoldTicketsPageAll,
      setOnHoldTicketsPageAll,
      escalatedTicketsPageAll,
      setEscalatedTicketsPageAll,
    },
    getTicketTeam,
    matchesSelectedTeam,
    getTicketDisplayNumber,
    deriveTicketStatusKey,
  } = viewState;

  const kpis = data.kpis;
  const diagnostics = data.diagnostics;
  const chartData = data.chartData;
  const previousPeriodStats = data.previousPeriodStats;
  const filterOptions = data.filterOptions;
  const channelStats = data.channelStats;
  const languageStats = data.languageStats;

  const scoreTrendDates = chartData.scoreTrend.map((p) => p.date);
  const xAxisTicks = buildXAxisTicks(scoreTrendDates);

  const trustBase = chartData.scoreTrend.map((p) => ({
    date: p.date,
    trust: p.trust,
    trustPlot: p.trustHasData ? p.trust : null,
    trustHasData: p.trustHasData,
  }));

  const experienceBase = chartData.scoreTrend.map((p) => ({
    date: p.date,
    experience: p.experience,
    experiencePlot: p.experienceHasData ? p.experience : null,
    experienceHasData: p.experienceHasData,
  }));

  const responseBase = chartData.scoreTrend.map((p) => ({
    date: p.date,
    avgLatency: p.avgLatency,
    avgLatencyForRange: p.avgLatencySampleCount > 0 ? p.avgLatency : null,
    avgLatencySampleCount: p.avgLatencySampleCount,
  }));
  const responseRange = buildRobustRangeSeries(responseBase, "avgLatencyForRange", "avgLatencyPlot", "avgLatencyOutlier", 0);

  const tatBase = chartData.scoreTrend.map((p) => ({
    date: p.date,
    avgReviewTat: p.avgReviewTat,
    avgReviewTatForRange: p.avgReviewTatSampleCount > 0 ? p.avgReviewTat : null,
    avgReviewTatSampleCount: p.avgReviewTatSampleCount,
  }));
  const tatRange = buildRobustRangeSeries(tatBase, "avgReviewTatForRange", "avgReviewTatPlot", "avgReviewTatOutlier", 0);

  const trendChartConfigs: Record<typeof activeChartTab, TrendChartProps> = {
    trust: {
      data: trustBase,
      xTicks: xAxisTicks,
      plotKey: "trustPlot",
      color: "#4f46e5",
      name: "Trust Score",
      yLabel: "Trust Score (%)",
      yDomain: [0, 125],
      yTicks: [0, 25, 50, 75, 100, 125],
      tooltipConfig: { valueLabel: "Trust Score", valueSuffix: "%", rawValueKey: "trust", hasDataKey: "trustHasData" },
    },
    farmer: {
      data: experienceBase,
      xTicks: xAxisTicks,
      plotKey: "experiencePlot",
      color: "#10b981",
      name: "Farmer Experience",
      yLabel: "Farmer Experience (%)",
      yDomain: [0, 125],
      yTicks: [0, 25, 50, 75, 100, 125],
      tooltipConfig: {
        valueLabel: "Farmer Experience",
        valueSuffix: "%",
        rawValueKey: "experience",
        hasDataKey: "experienceHasData",
      },
    },
    response: {
      data: responseRange.data,
      xTicks: xAxisTicks,
      plotKey: "avgLatencyPlot",
      color: "#f59e0b",
      name: "Avg Response Time",
      yLabel: "Response Time (min)",
      yDomain: [0, responseRange.domainMax],
      tooltipConfig: {
        valueLabel: "Avg Response Time",
        valueSuffix: " min",
        rawValueKey: "avgLatency",
        sampleCountKey: "avgLatencySampleCount",
      },
      outlierKey: "avgLatencyOutlier",
      outliers: responseRange.outliers,
    },
    tat: {
      data: tatRange.data,
      xTicks: xAxisTicks,
      plotKey: "avgReviewTatPlot",
      color: "#8b5cf6",
      name: "Avg Review TAT",
      yLabel: "Review TAT (min)",
      yDomain: [0, tatRange.domainMax],
      tooltipConfig: {
        valueLabel: "Avg Review TAT",
        valueSuffix: " min",
        rawValueKey: "avgReviewTat",
        sampleCountKey: "avgReviewTatSampleCount",
      },
      outlierKey: "avgReviewTatOutlier",
      outliers: tatRange.outliers,
    },
  };

  // Trust/Farmer plot a true gap on a no-data day (hasData flags null out
  // the point, avoiding a misleading 0); Avg Response/Review TAT instead
  // plot 0 to keep the line continuous (see buildRobustRangeSeries's
  // noDataPlotValue) - the tooltip below describes each pair accordingly.
  const trendDaysWithData: Record<typeof activeChartTab, number> = {
    trust: trustBase.filter((p) => p.trustHasData).length,
    farmer: experienceBase.filter((p) => p.experienceHasData).length,
    response: responseBase.filter((p) => p.avgLatencySampleCount > 0).length,
    tat: tatBase.filter((p) => p.avgReviewTatSampleCount > 0).length,
  };
  const trendTotalDays = scoreTrendDates.length;

  const withDisplayNumber = (t: { id: string; url: string; severity: string }) => ({
    ...t,
    displayNumber: getTicketDisplayNumber(t.id),
  });

  // Critical Defect Tickets view scopes to diagnostics.openTickets
  // (Critical/High only); All Tickets view scopes to diagnostics.allTickets
  // (every severity) - everything below (status tabs, team breakdown,
  // pagination) is built from whichever pool the active view selects.
  const ticketPool = defectsView === "critical" ? diagnostics.openTickets : diagnostics.allTickets;

  const openTabTickets = ticketPool
    .filter((t) => deriveTicketStatusKey(t.id) === "open" && matchesSelectedTeam(t.id))
    .map(withDisplayNumber);
  const closedTabTickets = ticketPool
    .filter((t) => deriveTicketStatusKey(t.id) === "closed" && matchesSelectedTeam(t.id))
    .map(withDisplayNumber);
  const onHoldTabTickets = ticketPool
    .filter((t) => deriveTicketStatusKey(t.id) === "onHold" && matchesSelectedTeam(t.id))
    .map(withDisplayNumber);
  const escalatedTabTickets = ticketPool
    .filter((t) => deriveTicketStatusKey(t.id) === "escalated" && matchesSelectedTeam(t.id))
    .map(withDisplayNumber);

  const DEFECTS_TABS: IDefectsTab[] =
    defectsView === "critical"
      ? [
          { key: "open", label: "Open", tickets: openTabTickets, page: openTicketsPageCritical, setPage: setOpenTicketsPageCritical },
          { key: "closed", label: "Closed", tickets: closedTabTickets, page: closedTicketsPageCritical, setPage: setClosedTicketsPageCritical },
          { key: "onHold", label: "On Hold", tickets: onHoldTabTickets, page: onHoldTicketsPageCritical, setPage: setOnHoldTicketsPageCritical },
          { key: "escalated", label: "Escalated", tickets: escalatedTabTickets, page: escalatedTicketsPageCritical, setPage: setEscalatedTicketsPageCritical },
        ]
      : [
          { key: "open", label: "Open", tickets: openTabTickets, page: openTicketsPageAll, setPage: setOpenTicketsPageAll },
          { key: "closed", label: "Closed", tickets: closedTabTickets, page: closedTicketsPageAll, setPage: setClosedTicketsPageAll },
          { key: "onHold", label: "On Hold", tickets: onHoldTabTickets, page: onHoldTicketsPageAll, setPage: setOnHoldTicketsPageAll },
          { key: "escalated", label: "Escalated", tickets: escalatedTabTickets, page: escalatedTicketsPageAll, setPage: setEscalatedTicketsPageAll },
        ];
  const activeDefectsTabInfo = DEFECTS_TABS.find((t) => t.key === activeDefectsTab)!;

  function buildTeamBreakdown(tickets: typeof diagnostics.openTickets): ITeamBreakdown[] {
    const teamGroups = new Map<string, typeof diagnostics.openTickets>();
    tickets.forEach((t) => {
      const team = getTicketTeam(t.id);
      const existing = teamGroups.get(team);
      if (existing) existing.push(t);
      else teamGroups.set(team, [t]);
    });
    return Array.from(teamGroups.entries())
      .map(([team, teamTickets]) => {
        const counts = { open: 0, closed: 0, onHold: 0, escalated: 0 };
        teamTickets.forEach((t) => {
          counts[deriveTicketStatusKey(t.id)]++;
        });
        return { key: team, label: team, total: teamTickets.length, counts };
      })
      .sort((a, b) => {
        if (a.key === UNASSIGNED_TEAM_LABEL) return 1;
        if (b.key === UNASSIGNED_TEAM_LABEL) return -1;
        return b.total - a.total;
      });
  }

  const teamBreakdown = buildTeamBreakdown(ticketPool);
  const defectsCardTitle = defectsView === "critical" ? "Critical Defect Tickets" : "All Tickets";

  return (
    <>
      <FilterBar
        filters={filters}
        setFilters={setFilters}
        filterOptions={filterOptions}
        filterFields={filterFields}
        customStart={customStart}
        setCustomStart={setCustomStart}
        customEnd={customEnd}
        setCustomEnd={setCustomEnd}
        typeBranchState={typeBranchState}
        optionDetails={optionDetails}
        typeTree={typeTree}
      />

      <ExecutiveSummary kpis={kpis} previousPeriodStats={previousPeriodStats} />

      <AdditionalMetrics
        kpis={kpis}
        channelStats={channelStats}
        languageStats={languageStats}
        filters={filters}
        customStart={customStart}
        customEnd={customEnd}
        releaseHealthExpanded={releaseHealthExpanded}
        setReleaseHealthExpanded={setReleaseHealthExpanded}
      />

      <DiagnosticsRow
        diagnostics={diagnostics}
        weakestModuleExpanded={weakestModuleExpanded}
        setWeakestModuleExpanded={setWeakestModuleExpanded}
        defectsCardTitle={defectsCardTitle}
        defectsView={defectsView}
        onSwitchDefectsView={switchDefectsView}
        defectsPoolCount={ticketPool.length}
        activeDefectsTab={activeDefectsTab}
        setActiveDefectsTab={setActiveDefectsTab}
        defectsTabs={DEFECTS_TABS}
        activeDefectsTabInfo={activeDefectsTabInfo}
        teamBreakdown={teamBreakdown}
        selectedTeam={selectedTeam}
        onSelectTeam={toggleSelectedTeam}
      />

      <Card className="border-muted-foreground/10">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">Score Trend</CardTitle>
            <InfoPopover title="Score Trend" align="start">
              <p>
                Each point is that day's {trendChartConfigs[activeChartTab].name}, recalculated from only that
                day's tests — the same number the cards above would show if filtered to that single day.
              </p>
              {activeChartTab === "trust" || activeChartTab === "farmer" ? (
                <p>A gap in the line means no tests that day, not a score of 0.</p>
              ) : (
                <p>
                  A day with no valid readings plots as 0 and is excluded from the average. Values above the
                  visible range are marked with a triangle, not hidden.
                </p>
              )}
              <div className="flex justify-between pt-1 border-t">
                <span>Days with data</span>
                <span className="font-medium">{trendDaysWithData[activeChartTab]} of {trendTotalDays}</span>
              </div>
            </InfoPopover>
          </div>
          <div className="flex flex-wrap gap-1 mt-2">
            {[
              { key: "trust" as const, label: "Trust" },
              { key: "farmer" as const, label: "Farmer" },
              { key: "response" as const, label: "Avg Response" },
              { key: "tat" as const, label: "Review TAT" },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveChartTab(tab.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  activeChartTab === tab.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="h-[340px]">
          <TrendChart {...trendChartConfigs[activeChartTab]} />
        </CardContent>
      </Card>
    </>
  );
}
