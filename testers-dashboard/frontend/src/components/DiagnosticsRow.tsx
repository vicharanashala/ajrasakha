import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import { ChevronDown, ChevronLeft, ChevronRight, ExternalLink, ShieldAlert, ListChecks } from "lucide-react";
import type { ITestersDashboardDiagnostics } from "../services/testersDashboardSummaryService";
import { InfoPopover } from "./InfoPopover";
import { getPageItems } from "../utils";

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
      return "bg-red-50 text-red-700 border-red-200";
    case "high":
      return "bg-orange-50 text-orange-700 border-orange-200";
    case "medium":
      return "bg-yellow-50 text-yellow-800 border-yellow-200";
    case "low":
      return "bg-blue-50 text-blue-700 border-blue-200";
    default:
      return "bg-muted text-muted-foreground border-muted-foreground/20";
  }
}

function TicketPagination({
  page,
  pageCount,
  setPage,
}: {
  page: number;
  pageCount: number;
  setPage: IDefectsTab["setPage"];
}) {
  const navButtonClass =
    "inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent";
  return (
    <nav aria-label="Ticket pages" className="mt-3 flex items-center justify-center gap-0.5 text-[11px]">
      <button
        type="button"
        aria-label="Previous page"
        title="Previous page"
        disabled={page === 0}
        onClick={() => setPage((p) => Math.max(0, p - 1))}
        className={navButtonClass}
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      {getPageItems(page, pageCount).map((item) =>
        typeof item === "number" ? (
          <button
            key={item}
            type="button"
            aria-label={`Page ${item + 1}`}
            aria-current={item === page ? "page" : undefined}
            onClick={() => setPage(item)}
            className={`h-6 min-w-6 px-1 rounded-md font-medium tabular-nums transition-colors ${
              item === page
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {item + 1}
          </button>
        ) : (
          <span key={item} className="w-4 text-center text-muted-foreground select-none" aria-hidden>
            …
          </span>
        ),
      )}
      <button
        type="button"
        aria-label="Next page"
        title="Next page"
        disabled={page >= pageCount - 1}
        onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
        className={navButtonClass}
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </nav>
  );
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
  // "No priority" is the label mapZohoPriorityToSeverity (backend) gives any
  // ticket whose Zoho Priority is empty or unrecognised.
  const noPriorityCount = diagnostics.allTickets.filter((t) => t.severity === "No priority").length;
  const activeDefectsPageCount = Math.ceil(activeDefectsTabInfo.tickets.length / CRITICAL_DEFECTS_PAGE_SIZE);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card className="border-muted-foreground/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">Biggest Bottleneck</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-4">
          <div className="flex items-end justify-between gap-3 rounded-lg bg-primary/5 px-3 py-2.5">
            <div className="min-w-0">
              <div className="text-[11px] text-muted-foreground">Slowest stage</div>
              <div className="text-xl font-bold leading-tight truncate" title={diagnostics.bottleneckName}>
                {diagnostics.bottleneckName}
              </div>
            </div>
            <div className="shrink-0 text-right leading-none">
              <span className="text-2xl font-bold tabular-nums">
                {diagnostics.bottleneckTime > 0 ? diagnostics.bottleneckTime.toFixed(1) : "0"}
              </span>
              <span className="ml-1 text-xs text-muted-foreground">mins avg</span>
            </div>
          </div>
          {stageStats.length > 0 && (
            <ul className="space-y-2.5" aria-label="Average minutes per stage">
              {stageStats.map((s) => {
                const isBottleneck = s.name === diagnostics.bottleneckName;
                return (
                  <li key={s.name} className="grid grid-cols-[minmax(0,6.5rem)_1fr_auto] items-center gap-2.5 text-xs">
                    <span
                      className={`truncate ${isBottleneck ? "font-semibold text-foreground" : "text-muted-foreground"}`}
                      title={s.name}
                    >
                      {s.name}
                    </span>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${isBottleneck ? "bg-primary" : "bg-primary/40"}`}
                        style={{ width: `${(s.avg / maxStageAvg) * 100}%` }}
                      />
                    </div>
                    <span className={`w-12 text-right tabular-nums ${isBottleneck ? "font-semibold" : "font-medium"}`}>
                      {s.avg.toFixed(1)}m
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
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
                <p>Sub-metric figures show score and applicable test count.</p>
              </InfoPopover>
            </div>
            <ChevronDown
              className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-300 ${weakestModuleExpanded ? "rotate-180" : ""}`}
            />
          </div>
        </CardHeader>
        <CardContent className="pt-0 flex flex-1 flex-col">
          <div className="text-xl font-bold">{diagnostics.weakestModule}</div>
          {diagnostics.weakestModuleScore !== null ? (
            <div className="mt-0.5 flex items-baseline gap-1.5 text-sm">
              <span className="font-semibold tabular-nums text-red-600">{diagnostics.weakestModuleScore}%</span>
              <span className="text-muted-foreground">overall · {diagnostics.weakestModuleRowCount} tests</span>
            </div>
          ) : (
            <div className="mt-0.5 text-sm text-muted-foreground">Awaiting data</div>
          )}
          {weakestModuleExpanded && (
            // Fills whatever height the row gives this card (min 240px), and
            // the list scrolls inside it. The absolute inner box keeps the
            // list's own height from stretching the card or the row.
            <div className="relative mt-3 min-h-[240px] flex-1 border-t text-xs animate-in fade-in-0 duration-300">
              <div className="absolute inset-0 overflow-y-auto">
              <ul className="divide-y divide-muted-foreground/10 pr-1">
                {(diagnostics.modulePerformance ?? []).map((m) => {
                  const isWeakest = m.label === diagnostics.weakestModule;
                  return (
                    <li key={m.key} className="py-2 space-y-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-medium">{m.label}</span>
                        <span className="shrink-0 tabular-nums">
                          {m.overallScore !== null && (
                            <span className={`font-semibold ${isWeakest ? "text-red-600" : ""}`}>{m.overallScore}%</span>
                          )}
                          <span className="ml-1.5 text-muted-foreground">{m.applicableRowCount} tests</span>
                        </span>
                      </div>
                      {(m.subMetrics ?? []).length > 0 && (
                        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 pl-2 text-[11px] text-muted-foreground">
                          {(m.subMetrics ?? []).map((sm) => (
                            <div key={sm.key} className="contents">
                              <dt className="truncate" title={sm.label}>{sm.label}</dt>
                              <dd className="text-right tabular-nums">
                                {sm.value !== null ? `${sm.value}% · ${sm.applicable}` : "No data"}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </li>
                  );
                })}
                {(diagnostics.comingSoonModules ?? []).map((m) => (
                  <li key={m.key} className="flex justify-between gap-2 py-2 opacity-50">
                    <span className="font-medium">{m.label}</span>
                    <span className="italic">Coming soon</span>
                  </li>
                ))}
              </ul>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-muted-foreground/10 gap-4">
        <CardHeader className="gap-3">
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">
              {defectsCardTitle}
            </CardTitle>
            <InfoPopover title={defectsCardTitle} align="start">
              <p><strong>Source:</strong> fetched directly from Zoho Desk (Bugs Tracker).</p>
              <p>
                <strong>Shows:</strong>{" "}
                {defectsView === "critical" ? "tickets with Critical or High priority." : "all Bugs Tracker tickets, any priority."}
              </p>
              <p>Priority comes from Zoho's own Priority field, not the test sheet's Defect Severity.</p>
              <p><strong>Teams:</strong> grouped by the team assigned in Zoho.</p>
              <p>Updated periodically from Zoho.</p>
              <div className="pt-1 border-t space-y-0.5 tabular-nums">
                <div className="flex justify-between"><span>Total</span><span className="font-medium">{defectsView === "critical" ? diagnostics.openTickets.length : diagnostics.allTickets.length}</span></div>
                {defectsView === "all" && (
                  <div className="flex justify-between"><span>No priority set</span><span className="font-medium">{noPriorityCount}</span></div>
                )}
              </div>
            </InfoPopover>
          </div>
          <div className="flex flex-wrap bg-muted p-1 rounded-lg border gap-1">
            <button
              type="button"
              onClick={() => onSwitchDefectsView("critical")}
              className={`flex flex-auto items-center justify-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md whitespace-nowrap transition-all ${
                defectsView === "critical"
                  ? "bg-background text-foreground shadow-sm font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <ShieldAlert className="h-3.5 w-3.5 text-red-600" />
              Critical Defect Tickets{" "}
              <span className="opacity-70 tabular-nums">({diagnostics.openTickets.length})</span>
            </button>
            <button
              type="button"
              onClick={() => onSwitchDefectsView("all")}
              className={`flex flex-auto items-center justify-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md whitespace-nowrap transition-all ${
                defectsView === "all"
                  ? "bg-background text-foreground shadow-sm font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <ListChecks className="h-3.5 w-3.5 text-primary" />
              All Tickets <span className="opacity-70 tabular-nums">({diagnostics.allTickets.length})</span>
            </button>
          </div>
          {/* Underlined tabs rather than filled buttons, so the status tabs
              read as a level below the view toggle above them. */}
          <div role="tablist" className="flex border-b border-muted-foreground/15">
            {defectsTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={activeDefectsTab === tab.key}
                onClick={() => setActiveDefectsTab(tab.key)}
                className={`-mb-px flex-1 whitespace-nowrap border-b-2 px-1.5 pb-1.5 text-xs font-medium transition-colors ${
                  activeDefectsTab === tab.key
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {defectsPoolCount === 0 ? (
            <p className="text-sm text-muted-foreground">No tickets linked yet.</p>
          ) : (
            <div className="space-y-3">
              {teamBreakdown.length > 0 && (
                <div className="rounded-md border border-muted-foreground/10 bg-muted/30 p-2">
                  <div className="flex flex-wrap gap-1">
                    {teamBreakdown.map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => onSelectTeam(t.key)}
                        className={`px-2 py-0.5 text-[11px] font-medium rounded-full border transition-colors ${
                          selectedTeam === t.key
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background text-foreground border-muted-foreground/20 hover:bg-muted"
                        }`}
                      >
                        {t.label} <span className="opacity-70 tabular-nums">({t.total})</span>
                      </button>
                    ))}
                  </div>
                  {selectedTeam && (
                    <div className="mt-2 border-t border-muted-foreground/10 pt-1.5 overflow-x-auto">
                      <table className="w-full text-[11px] tabular-nums">
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
                              <tr key={t.key}>
                                <td className="pr-2">{t.label}</td>
                                <td className="text-right">{t.counts.open}</td>
                                <td className="text-right">{t.counts.closed}</td>
                                <td className="text-right">{t.counts.onHold}</td>
                                <td className="text-right">{t.counts.escalated}</td>
                                <td className="text-right font-semibold">{t.total}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
              <div>
                <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                  <p>
                    {activeDefectsTabInfo.tickets.length} {activeDefectsTabInfo.label.toLowerCase()}{" "}
                    {defectsView === "all" ? "ticket" : "critical/high defect"}
                    {activeDefectsTabInfo.tickets.length === 1 ? "" : "s"} total.
                  </p>
                  {activeDefectsPageCount > 1 && (
                    <span className="shrink-0 tabular-nums">
                      Page {activeDefectsTabInfo.page + 1} of {activeDefectsPageCount}
                    </span>
                  )}
                </div>
                {activeDefectsTabInfo.tickets.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No {activeDefectsTabInfo.label.toLowerCase()}{" "}
                    {defectsView === "all" ? "tickets" : "critical/high tickets"}.
                  </p>
                ) : (
                  <>
                    <ul className="divide-y divide-muted-foreground/10 rounded-md border border-muted-foreground/10">
                      {activeDefectsTabInfo.tickets
                        .slice(
                          activeDefectsTabInfo.page * CRITICAL_DEFECTS_PAGE_SIZE,
                          (activeDefectsTabInfo.page + 1) * CRITICAL_DEFECTS_PAGE_SIZE,
                        )
                        .map((t) => (
                          <li
                            key={t.url}
                            className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-sm hover:bg-muted/40 transition-colors"
                          >
                            <a
                              href={t.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 font-medium tabular-nums text-primary underline-offset-2 hover:underline"
                            >
                              Ticket #{t.displayNumber}
                              <ExternalLink className="h-3 w-3 opacity-60" />
                            </a>
                            <span
                              className={`inline-flex min-w-[60px] justify-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${severityBadgeClass(t.severity)}`}
                            >
                              {t.severity}
                            </span>
                          </li>
                        ))}
                    </ul>
                    {activeDefectsPageCount > 1 && (
                      <TicketPagination
                        page={activeDefectsTabInfo.page}
                        pageCount={activeDefectsPageCount}
                        setPage={activeDefectsTabInfo.setPage}
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
