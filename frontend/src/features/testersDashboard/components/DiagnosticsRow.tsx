import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import { ChevronDown } from "lucide-react";
import type { ITestersDashboardDiagnostics } from "@/hooks/services/testersDashboardSummaryService";
import { InfoPopover } from "./InfoPopover";

const CRITICAL_DEFECTS_PAGE_SIZE = 10;

export interface IDefectsTab {
  key: "open" | "closed" | "onHold" | "escalated";
  label: string;
  tickets: { id: string; url: string; severity: string; displayNumber: string }[];
  page: number;
  setPage: (value: number | ((prev: number) => number)) => void;
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
                  6 ACE modules, each scored from its own related columns (not a Type of Question row grouping):
                  Farmer Interaction, Agri Advisory, Knowledge &amp; GDB, Dynamic Advisory, Multilingual &amp; Voice,
                  Communication &amp; Notifications.
                </p>
                <p>
                  Each module's score is the average of its own sub-metrics — a sub-metric with no applicable rows is
                  skipped, not counted as 0. A module needs at least 10 applicable rows (across all its sub-metrics
                  combined) to be eligible as "weakest".
                </p>
                <p>
                  A few modules aren't scored yet because the required data isn't being recorded in the sheet.
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
            <div className="overflow-hidden space-y-3 text-xs border-t pt-2 max-h-[136px] overflow-y-auto">
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
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">
              Critical Defect Tickets
            </CardTitle>
            <InfoPopover title="Team Grouping" align="start">
              <p>
                Each ticket is grouped by its linked Zoho Desk ticket's <strong>Team</strong> field, looked up live
                from Zoho (not the sheet). Tickets whose Zoho ticket has no team set — or whose live Zoho data hasn't
                synced yet — fall into "Unassigned" rather than being dropped.
              </p>
              <p className="text-[10px] text-muted-foreground pt-1">
                Team names come directly from Zoho; the list below only shows teams that actually own at least one of
                these tickets, not every team in the org.
              </p>
            </InfoPopover>
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
          {diagnostics.criticalDefectCount === 0 ? (
            <p className="text-sm text-muted-foreground">No active critical/high defects.</p>
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
                {activeDefectsTabInfo.tickets.length} {activeDefectsTabInfo.label.toLowerCase()} critical/high
                defect{activeDefectsTabInfo.tickets.length === 1 ? "" : "s"} total.
              </p>
              {diagnostics.openTickets.length === 0 ? (
                <p className="text-sm text-muted-foreground">No ticket links logged for these yet.</p>
              ) : activeDefectsTabInfo.tickets.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No {activeDefectsTabInfo.label.toLowerCase()} critical/high tickets.
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
                            className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                              t.severity === "critical" ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"
                            }`}
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
