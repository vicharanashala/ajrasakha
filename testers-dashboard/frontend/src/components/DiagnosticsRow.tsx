import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import { ChevronDown, ShieldAlert, ListChecks } from "lucide-react";
import type { ITestersDashboardDiagnostics } from "../services/testersDashboardSummaryService";
import { InfoPopover } from "./InfoPopover";

const CRITICAL_DEFECTS_PAGE_SIZE = 6;

export interface IDefectsTab {
  key: "open" | "closed" | "onHold" | "escalated";
  label: string;
  tickets: { id: string; url: string; severity: string; displayNumber: string }[];
  page: number;
  setPage: (value: number | ((prev: number) => number)) => void;
}

export type DefectsView = "critical" | "all";

// Case-insensitive since normalizeDefectSeverity returns Title Case
// ('Critical'/'High'/'Medium'/'Low') but the badge itself renders uppercase
// via CSS - matching case-sensitively here would silently miss every tier.
function severityBadgeClass(severity: string): string {
  switch (severity.trim().toLowerCase()) {
    case "critical":
      return "bg-red-100 text-red-700";
    case "high":
      return "bg-orange-100 text-orange-700";
    case "medium":
      return "bg-yellow-100 text-yellow-700";
    case "low":
      return "bg-blue-100 text-blue-700";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export interface ITeamBreakdown {
  key: string;
  label: string;
  total: number;
  counts: { open: number; closed: number; onHold: number; escalated: number };
}

export interface DiagnosticsRowProps {
  diagnostics: ITestersDashboardDiagnostics;
  weakestModuleExpanded: boolean;
  setWeakestModuleExpanded: (value: boolean | ((prev: boolean) => boolean)) => void;
  defectsCardTitle: string;
  defectsView: DefectsView;
  onSwitchDefectsView: (view: DefectsView) => void;
  // Ticket pool size before the team pill narrows it - distinguishes
  // "nothing linked" from "some exist, none match the current tab/team".
  defectsPoolCount: number;
  activeDefectsTab: IDefectsTab["key"];
  setActiveDefectsTab: (value: IDefectsTab["key"]) => void;
  defectsTabs: IDefectsTab[];
  activeDefectsTabInfo: IDefectsTab;
  teamBreakdown: ITeamBreakdown[];
  selectedTeam: string | null;
  onSelectTeam: (key: string) => void;
}

export function DiagnosticsRow({
  diagnostics,
  weakestModuleExpanded,
  setWeakestModuleExpanded,
  defectsCardTitle,
  defectsView,
  onSwitchDefectsView,
  defectsPoolCount,
  activeDefectsTab,
  setActiveDefectsTab,
  defectsTabs,
  activeDefectsTabInfo,
  teamBreakdown,
  selectedTeam,
  onSelectTeam,
}: DiagnosticsRowProps) {
  const stageStats = diagnostics.stageStats ?? [];
  const maxStageAvg = Math.max(...stageStats.map((s) => s.avg), 1);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card className="border-muted-foreground/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">Biggest Bottleneck</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="text-xl font-bold">{diagnostics.bottleneckName}</div>
          <div className="text-sm text-muted-foreground mb-3">
            {diagnostics.bottleneckTime > 0 ? `${diagnostics.bottleneckTime.toFixed(1)} mins avg` : "0 mins avg"}
          </div>
          <div className="space-y-2">
            {stageStats.map((s) => (
              <div key={s.name} className="space-y-0.5">
                <div className="flex justify-between text-xs">
                  <span>{s.name}</span>
                  <span className="font-medium">{s.avg.toFixed(1)}m</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${(s.avg / maxStageAvg) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card
        className="border-muted-foreground/10 cursor-pointer select-none hover:border-muted-foreground/30 transition-colors"
        onClick={() => setWeakestModuleExpanded((v) => !v)}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">Weakest Modules</CardTitle>
              <InfoPopover title="Weakest Modules" align="start">
                <p>
                  Lowest-scoring of 6 modules: Farmer Interaction, Agri Advisory, Knowledge &amp; GDB, Dynamic
                  Advisory, Multilingual &amp; Voice, Communication &amp; Notifications.
                </p>
                <p>
                  Module score = average of its sub-metrics; a sub-metric with no applicable rows is skipped, not
                  counted as 0. Needs ≥10 applicable rows to be eligible.
                </p>
                <p>
                  Review &amp; Quality, Farmer Context, and ACE Platform &amp; Integrations are not scored — the
                  sheet does not record the needed data.
                </p>
              </InfoPopover>
            </div>
            <ChevronDown
              className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-300 ${weakestModuleExpanded ? "rotate-180" : ""}`}
            />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="text-xl font-bold">{diagnostics.weakestModule}</div>
          <div className="text-sm text-red-500 font-medium mb-2">
            {diagnostics.weakestModuleScore !== null
              ? `${diagnostics.weakestModuleScore}% Overall (${diagnostics.weakestModuleRowCount} tests)`
              : "Awaiting data"}
          </div>
          <p className="text-sm text-muted-foreground">
            Calculated from the average of all applicable sub-metrics for this module — sub-metrics with no data for
            this module are excluded, not counted as a failure.
          </p>
          <div
            className={`grid transition-all duration-300 ease-in-out ${
              weakestModuleExpanded ? "grid-rows-[1fr] opacity-100 mt-3" : "grid-rows-[0fr] opacity-0"
            }`}
          >
            <div className="overflow-hidden space-y-3 text-xs border-t pt-2 max-h-[168px] overflow-y-auto">
              {(diagnostics.modulePerformance ?? []).map((m) => (
                <div key={m.key} className="space-y-1">
                  <div className="flex justify-between">
                    <span className="font-medium">{m.label}</span>
                    <span className="font-medium">
                      {m.overallScore !== null ? `${m.overallScore}% (${m.applicableRowCount})` : `${m.applicableRowCount} tests`}
                    </span>
                  </div>
                  <div className="pl-3 space-y-0.5">
                    {(m.subMetrics ?? []).map((sm) => (
                      <div key={sm.key} className="flex justify-between text-muted-foreground">
                        <span>{sm.label}</span>
                        <span>{sm.value !== null ? `${sm.value}% (${sm.applicable})` : "No data"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {(diagnostics.comingSoonModules ?? []).map((m) => (
                <div key={m.key} className="space-y-1 opacity-50">
                  <div className="flex justify-between">
                    <span className="font-medium">{m.label}</span>
                    <span className="italic">Coming soon</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-muted-foreground/10">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-1.5">
              <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">
                {defectsCardTitle}
              </CardTitle>
              <InfoPopover title="Ticket Data" align="start">
                <p>
                  Shows all tickets in Zoho Desk's <strong>Bugs Tracker</strong> layout, fetched directly from Zoho
                  — not just tickets linked in the QA sheet. Not affected by the dashboard filters (Date Range,
                  Type of Question, Channel, Tester, etc.) since most Zoho tickets have no sheet row for those
                  filters to apply to.
                </p>
                <p>
                  Grouped by each ticket's <strong>Team</strong> field in Zoho (not the sheet). Tickets with no team
                  set, or awaiting their next Zoho sync, show as "Unassigned".
                </p>
                <p className="text-[10px] text-muted-foreground pt-1">
                  Only teams with at least one of these tickets are listed.
                </p>
              </InfoPopover>
            </div>
            <div className="flex items-center bg-muted p-1 rounded-lg border gap-1">
              <button
                type="button"
                onClick={() => onSwitchDefectsView("critical")}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${
                  defectsView === "critical"
                    ? "bg-background text-foreground shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <ShieldAlert className="h-3.5 w-3.5 text-red-600" />
                Critical Defect Tickets
              </button>
              <button
                type="button"
                onClick={() => onSwitchDefectsView("all")}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${
                  defectsView === "all"
                    ? "bg-background text-foreground shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <ListChecks className="h-3.5 w-3.5 text-primary" />
                All Tickets
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1 mt-2">
            {defectsTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveDefectsTab(tab.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  activeDefectsTab === tab.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {defectsPoolCount === 0 ? (
            <p className="text-sm text-muted-foreground">No tickets linked yet.</p>
          ) : (
            <>
              {teamBreakdown.length > 0 && (
                <div className="mb-3">
                  <div className="flex flex-wrap gap-1.5">
                    {teamBreakdown.map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => onSelectTeam(t.key)}
                        className={`px-2.5 py-1 text-[11px] font-medium rounded-full border transition-colors ${
                          selectedTeam === t.key
                            ? "bg-primary text-primary-foreground border-primary"
                            : "text-foreground border-muted-foreground/20 hover:bg-muted"
                        }`}
                      >
                        {t.label} <span className="opacity-70">({t.total})</span>
                      </button>
                    ))}
                  </div>
                  {selectedTeam && (
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="text-muted-foreground">
                            <th className="text-left font-medium pb-1">Team</th>
                            <th className="text-right font-medium pb-1">Open</th>
                            <th className="text-right font-medium pb-1">Closed</th>
                            <th className="text-right font-medium pb-1">On Hold</th>
                            <th className="text-right font-medium pb-1">Escalated</th>
                            <th className="text-right font-medium pb-1">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {teamBreakdown
                            .filter((t) => t.key === selectedTeam)
                            .map((t) => (
                              <tr key={t.key} className="border-t border-muted-foreground/10">
                                <td className="py-1 pr-2">{t.label}</td>
                                <td className="text-right py-1">{t.counts.open}</td>
                                <td className="text-right py-1">{t.counts.closed}</td>
                                <td className="text-right py-1">{t.counts.onHold}</td>
                                <td className="text-right py-1">{t.counts.escalated}</td>
                                <td className="text-right py-1 font-medium">{t.total}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
              <p className="text-xs text-muted-foreground mb-2">
                {activeDefectsTabInfo.tickets.length} {activeDefectsTabInfo.label.toLowerCase()}{" "}
                {defectsView === "all" ? "ticket" : "critical/high defect"}
                {activeDefectsTabInfo.tickets.length === 1 ? "" : "s"} total.
              </p>
              {activeDefectsTabInfo.tickets.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No {activeDefectsTabInfo.label.toLowerCase()}{" "}
                  {defectsView === "all" ? "tickets" : "critical/high tickets"}.
                </p>
              ) : (
                <>
                  <ul className="space-y-2">
                    {activeDefectsTabInfo.tickets
                      .slice(
                        activeDefectsTabInfo.page * CRITICAL_DEFECTS_PAGE_SIZE,
                        (activeDefectsTabInfo.page + 1) * CRITICAL_DEFECTS_PAGE_SIZE,
                      )
                      .map((t) => (
                        <li key={t.url} className="flex items-center justify-between text-sm">
                          <a
                            href={t.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary underline"
                          >
                            Ticket #{t.displayNumber}
                          </a>
                          <span
                            className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${severityBadgeClass(t.severity)}`}
                          >
                            {t.severity}
                          </span>
                        </li>
                      ))}
                  </ul>
                  {activeDefectsTabInfo.tickets.length > CRITICAL_DEFECTS_PAGE_SIZE && (
                    <div className="mt-3 flex items-center justify-between text-xs">
                      <button
                        type="button"
                        disabled={activeDefectsTabInfo.page === 0}
                        onClick={() => activeDefectsTabInfo.setPage((p) => Math.max(0, p - 1))}
                        className="px-2 py-1 rounded border disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted"
                      >
                        Previous
                      </button>
                      <span className="text-muted-foreground">
                        Page {activeDefectsTabInfo.page + 1} of{" "}
                        {Math.ceil(activeDefectsTabInfo.tickets.length / CRITICAL_DEFECTS_PAGE_SIZE)}
                      </span>
                      <button
                        type="button"
                        disabled={
                          (activeDefectsTabInfo.page + 1) * CRITICAL_DEFECTS_PAGE_SIZE >=
                          activeDefectsTabInfo.tickets.length
                        }
                        onClick={() =>
                          activeDefectsTabInfo.setPage((p) =>
                            (p + 1) * CRITICAL_DEFECTS_PAGE_SIZE < activeDefectsTabInfo.tickets.length ? p + 1 : p,
                          )
                        }
                        className="px-2 py-1 rounded border disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted"
                      >
                        Next
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
