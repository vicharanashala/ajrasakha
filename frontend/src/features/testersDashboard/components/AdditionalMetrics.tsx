import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import { ShieldCheck, Smile, AlertTriangle, HeartPulse, Radio, ChevronDown, CheckCircle2, XCircle, Languages, Mic, Gauge } from "lucide-react";
import { InfoPopover } from "./InfoPopover";
import { GaugeGraphic } from "./GaugeGraphic";
import type { ITestersDashboardKpiSummary } from "@/hooks/services/testersDashboardSummaryService";
import type { IFilterBarFiltersState } from "./FilterBar";
import { trendLabel, criticalFailuresLabel, healthColorHex, releaseHealthColorHex, channelDisplayLabel, releaseHealthDecisionDisplay } from "../utils";

export interface IChannelStat {
  channel: string;
  tests: number;
  passRate: number;
  avgResponse: number;
}

export interface ILanguageStat {
  language: string;
  tests: number;
  translationAcc: number;
}

export interface AdditionalMetricsProps {
  kpis: ITestersDashboardKpiSummary;
  channelStats: IChannelStat[];
  languageStats: ILanguageStat[];
  filters: Pick<IFilterBarFiltersState, "dateRange">;
  customStart: string;
  customEnd: string;
  releaseHealthExpanded: boolean;
  setReleaseHealthExpanded: (value: boolean | ((prev: boolean) => boolean)) => void;
}

export function AdditionalMetrics({
  kpis,
  channelStats,
  languageStats,
  filters,
  customStart,
  customEnd,
  releaseHealthExpanded,
  setReleaseHealthExpanded,
}: AdditionalMetricsProps) {
  const [activeCriticalTab, setActiveCriticalTab] = useState<"failures" | "successes">("failures");
  const activeCriticalTotal =
    activeCriticalTab === "failures"
      ? kpis.criticalFailureCategories.failuresTotal
      : kpis.criticalFailureCategories.successesTotal;
  const activeCriticalDistinctRows =
    activeCriticalTab === "failures"
      ? kpis.criticalFailureCategories.distinctFailureRows
      : kpis.criticalFailureCategories.distinctSuccessRows;
  // Sorted by count within the active tab, matching the previous card's
  // sort-by-value behavior - a category's rank can differ between the two
  // tabs (e.g. a category with few failures but many successes).
  const activeCriticalCategories = [...kpis.criticalFailureCategories.categories]
    .map((c) => ({
      key: c.key,
      label: activeCriticalTab === "failures" ? c.label : c.successLabel,
      value: activeCriticalTab === "failures" ? c.failureCount : c.successCount,
    }))
    .sort((a, b) => b.value - a.value);

  return (
    <>
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-2">
        Additional Metrics
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
        <Card className="border-muted-foreground/10 min-h-[260px] flex flex-col">
          <CardHeader className="pb-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <div className="h-6 w-6 rounded-full bg-indigo-100 flex items-center justify-center shrink-0"><ShieldCheck className="h-3.5 w-3.5 text-indigo-600" /></div>
                <CardTitle className="text-xs text-muted-foreground uppercase">Trust Score</CardTitle>
              </div>
              <InfoPopover title="Trust Score" align="start">
                <p>25% Sci Accuracy + 30% Dynamic Accuracy (Weather/Mandi/Schemes) + 15% Source Links + 10% Question Framed + 10% Translation + 10% SLA</p>
                <div className="flex justify-between"><span>Sci Accuracy</span><span className="font-medium">{kpis.trustBreakdown.A_sci}%</span></div>
                <div className="flex justify-between"><span>Dynamic Accuracy</span><span className="font-medium">{kpis.trustBreakdown.A_dom}%</span></div>
                <div className="flex justify-between"><span>Source Links</span><span className="font-medium">{kpis.trustBreakdown.S_lnk}%</span></div>
                <div className="flex justify-between"><span>Question Framed</span><span className="font-medium">{kpis.trustBreakdown.Q_frm}%</span></div>
                <div className="flex justify-between"><span>Translation</span><span className="font-medium">{kpis.trustBreakdown.Q_trn}%</span></div>
                <div className="flex justify-between"><span>SLA</span><span className="font-medium">{kpis.trustBreakdown.S_sla}%</span></div>
                <p className="text-[10px] text-muted-foreground pt-1">
                  Sci Accuracy is scoped to Static questions (GDB/Unique/Outreach) only. Dynamic Accuracy averages Weather, Mandi Prices, and Government Schemes correctness, each scoped to its own question category.
                </p>
                <div className="flex justify-between pt-1 border-t"><span>Result</span><span className="font-medium">{kpis.trustScore}%</span></div>
              </InfoPopover>
            </div>
          </CardHeader>
          <CardContent className="pt-0 flex-1 flex flex-col">
            <div className="text-3xl font-bold flex items-baseline gap-2">
              {kpis.trustScore}%
              <span className={`text-xs font-medium ${trendLabel(kpis.trustScore).className}`}>
                {trendLabel(kpis.trustScore).text}
              </span>
            </div>
            <div className="mt-2 space-y-0.5 text-xs">
              <div className="flex justify-between"><span>Sci Accuracy (25%)</span><span>{kpis.trustBreakdown.A_sci}%</span></div>
              <div className="flex justify-between"><span>Dynamic Accuracy (30%)</span><span>{kpis.trustBreakdown.A_dom}%</span></div>
              <div className="flex justify-between"><span>Source Links (15%)</span><span>{kpis.trustBreakdown.S_lnk}%</span></div>
              <div className="flex justify-between"><span>Question Framed (10%)</span><span>{kpis.trustBreakdown.Q_frm}%</span></div>
              <div className="flex justify-between"><span>Translation Quality (10%)</span><span>{kpis.trustBreakdown.Q_trn}%</span></div>
              <div className="flex justify-between"><span>SLA (10%)</span><span>{kpis.trustBreakdown.S_sla}%</span></div>
            </div>
          </CardContent>
        </Card>


        <Card className="border-muted-foreground/10 min-h-[260px] flex flex-col">
          <CardHeader className="pb-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <div className="h-6 w-6 rounded-full bg-emerald-100 flex items-center justify-center shrink-0"><Smile className="h-3.5 w-3.5 text-emerald-600" /></div>
                <CardTitle className="text-xs text-muted-foreground uppercase">Farmer Experience</CardTitle>
              </div>
              <InfoPopover title="Farmer Experience">
                <p>30% Response Speed + 20% SLA + 20% Voice Mechanics + 15% Translation + 15% Notification Exp</p>
                <div className="flex justify-between"><span>Response Speed</span><span className="font-medium">{kpis.experienceBreakdown.S_rsp}%</span></div>
                <div className="flex justify-between"><span>SLA Compliance</span><span className="font-medium">{kpis.experienceBreakdown.S_sla}%</span></div>
                <div className="flex justify-between"><span>Voice Mechanics</span><span className="font-medium">{kpis.experienceBreakdown.V_io}%</span></div>
                <div className="flex justify-between"><span>Translation</span><span className="font-medium">{kpis.experienceBreakdown.Q_trn}%</span></div>
                <div className="flex justify-between"><span>Notification Exp</span><span className="font-medium">{kpis.experienceBreakdown.N_exp}%</span></div>
                <div className="flex justify-between pt-1 border-t"><span>Result</span><span className="font-medium">{kpis.experienceScore}%</span></div>
              </InfoPopover>
            </div>
          </CardHeader>
          <CardContent className="pt-0 flex-1 flex flex-col">
            <div className="text-3xl font-bold flex items-baseline gap-2">
              {kpis.experienceScore}%
              <span className={`text-xs font-medium ${trendLabel(kpis.experienceScore).className}`}>
                {trendLabel(kpis.experienceScore).text}
              </span>
            </div>
            <div className="mt-2 space-y-0.5 text-xs">
              <div className="flex justify-between"><span>Response Speed (30%)</span><span>{kpis.experienceBreakdown.S_rsp}%</span></div>
              <div className="flex justify-between"><span>SLA Compliance (20%)</span><span>{kpis.experienceBreakdown.S_sla}%</span></div>
              <div className="flex justify-between"><span>Voice Mechanics (20%)</span><span>{kpis.experienceBreakdown.V_io}%</span></div>
              <div className="flex justify-between"><span>Translation Quality (15%)</span><span>{kpis.experienceBreakdown.Q_trn}%</span></div>
              <div className="flex justify-between"><span>Notification Exp (15%)</span><span>{kpis.experienceBreakdown.N_exp}%</span></div>
            </div>
          </CardContent>
        </Card>


        <Card className="border-muted-foreground/10 min-h-[260px] flex flex-col">
          <CardHeader className="pb-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <div className="h-6 w-6 rounded-full bg-red-100 flex items-center justify-center shrink-0"><AlertTriangle className="h-3.5 w-3.5 text-red-600" /></div>
                <CardTitle className="text-xs text-muted-foreground uppercase">{criticalFailuresLabel(filters.dateRange, Boolean(customStart || customEnd))}</CardTitle>
              </div>
              <InfoPopover title="Critical Failures" align="end">
                <p>Failures tab: what went wrong, one row per category. Successes tab: the exact opposite for each category, same field(s), NA/blank excluded from both sides.</p>
                <p>The headline number counts each row once. A row can trip more than one category (e.g. a 7-day SLA breach is also a 2-hour and 24-hour breach), so the category list below may count the same row more than once, and the sum across categories can exceed the headline.</p>
                <div className="flex justify-between pt-1 border-t"><span>Distinct rows</span><span className="font-medium">{activeCriticalDistinctRows.toLocaleString()}</span></div>
                <div className="flex justify-between"><span>Sum of categories</span><span className="font-medium">{activeCriticalTotal.toLocaleString()}</span></div>
              </InfoPopover>
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {(
                [
                  { key: "failures", label: "Failures" },
                  { key: "successes", label: "Successes" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveCriticalTab(tab.key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    activeCriticalTab === tab.key
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="pt-0 flex-1 flex flex-col">
            <div className="text-3xl font-bold">{activeCriticalDistinctRows.toLocaleString()}</div>
            <div className="text-[10px] text-muted-foreground mb-1">
              {activeCriticalTotal.toLocaleString()} across all categories (rows may appear in more than one)
            </div>
            <div className="mt-1 space-y-1 text-xs overflow-hidden max-h-[136px] overflow-y-auto">
              {activeCriticalCategories.map((row, i) => {
                const dotColor = i === 0 ? "bg-red-500" : i === 1 ? "bg-orange-500" : i === 2 ? "bg-yellow-500" : "bg-slate-300";
                return (
                  <div key={row.key} className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
                      {row.label}
                    </span>
                    <span>{row.value}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>


        <Card
          className="border-muted-foreground/10 min-h-[260px] flex flex-col cursor-pointer select-none hover:border-muted-foreground/30 transition-colors"
          onClick={() => setReleaseHealthExpanded((v) => !v)}
        >
          <CardHeader className="pb-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <div className="h-6 w-6 rounded-full bg-sky-100 flex items-center justify-center shrink-0"><HeartPulse className="h-3.5 w-3.5 text-sky-600" /></div>
                <CardTitle className="text-xs text-muted-foreground uppercase">Release Health</CardTitle>
              </div>
              <div className="flex items-center gap-1.5">
                <InfoPopover title="Release Health" align="end">
                  <p>6 weighted buckets: AI &amp; Response Quality (25%) + Functional &amp; Critical Quality (20%) + Data Integrity &amp; Persistence (20%) + Performance &amp; SLA (15%) + Farmer Experience &amp; Channel Quality (10%) + Reliability &amp; Critical Failure Health (10%)</p>
                  {kpis.releaseHealthBreakdown.buckets.map((b) => (
                    <div key={b.key} className="flex justify-between">
                      <span>{b.label} ({Math.round(b.weight * 100)}%)</span>
                      <span className="font-medium">{b.score}%</span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-1 border-t"><span>Result</span><span className="font-medium">{kpis.releaseHealth}%</span></div>
                  <p className="pt-1 border-t font-semibold text-[11px] uppercase tracking-wide text-muted-foreground">Decision (score-only)</p>
                  <div className="flex justify-between"><span>🟢 GO</span><span>Release Health ≥ 95</span></div>
                  <div className="flex justify-between"><span>🟡 GO WITH CONDITIONS</span><span>90 – 94</span></div>
                  <div className="flex justify-between"><span>🔴 NO-GO</span><span>below 90</span></div>
                  <p className="text-[10px] text-muted-foreground pt-1">
                    Score-only for now - the full decision rule also requires mandatory release gates (rollback tested, monitoring active, backup available, no critical blocking defect) to PASS. Those aren't tracked in the test sheet yet, so this decision doesn't include them.
                  </p>
                </InfoPopover>
                <ChevronDown
                  className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-300 ${releaseHealthExpanded ? "rotate-180" : ""}`}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0 flex-1 flex flex-col">
            <GaugeGraphic value={kpis.releaseHealth} color={releaseHealthColorHex(kpis.releaseHealth)} label="Release Health Score" />

            {(() => {
              const decision = releaseHealthDecisionDisplay(kpis.releaseHealthBreakdown.decision);
              return (
                <div className="flex items-center justify-center gap-1.5 mt-1">
                  <span className="text-base leading-none">{decision.emoji}</span>
                  <span className={`text-sm font-bold tracking-wide ${decision.className}`}>{decision.label}</span>
                </div>
              );
            })()}

            <div
              className={`grid transition-all duration-300 ease-in-out ${
                releaseHealthExpanded ? "grid-rows-[1fr] opacity-100 mt-3" : "grid-rows-[0fr] opacity-0"
              }`}
            >
              <div className="overflow-hidden space-y-2.5 text-xs border-t pt-2 max-h-[136px] overflow-y-auto">
                {kpis.releaseHealthBreakdown.buckets.map((bucket) => {
                  const ok = bucket.score >= 80;
                  const warn = bucket.score >= 60;
                  return (
                    <div key={bucket.key}>
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          {ok ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                          ) : warn ? (
                            <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                          )}
                          <span className="font-medium">{bucket.label}</span>
                          <span className="text-muted-foreground">({Math.round(bucket.weight * 100)}%)</span>
                        </span>
                        <span className="font-medium">{bucket.score}%</span>
                      </div>
                      <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full ${ok ? "bg-emerald-500" : warn ? "bg-yellow-500" : "bg-red-500"}`}
                          style={{ width: `${bucket.score}%` }}
                        />
                      </div>
                      <div className="mt-1 pl-5 space-y-0.5 text-muted-foreground">
                        {bucket.metrics.map((m) => (
                          <div key={m.key} className="flex justify-between">
                            <span>{m.label} ({Math.round(m.weight * 100)}%)</span>
                            <span>{m.value}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>




        <Card className="border-muted-foreground/10 min-h-[260px] flex flex-col">
          <CardHeader className="pb-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <div className="h-6 w-6 rounded-full bg-orange-100 flex items-center justify-center shrink-0"><Radio className="h-3.5 w-3.5 text-orange-600" /></div>
                <CardTitle className="text-xs text-muted-foreground uppercase">Channel-wise Performance</CardTitle>
              </div>
              <InfoPopover title="Channel-wise Performance" align="start">
                <p>Grouped by Channel Tested.</p>
                <p>Pass % = Passed ÷ (Passed + Failed) for that channel - Partial/NA/ungraded rows excluded, matching the main dashboard's Pass Rate.</p>
                <p>Avg Resp = average response time for that channel's rows.</p>
              </InfoPopover>
            </div>
          </CardHeader>
          <CardContent className="pt-0 flex-1 flex flex-col">
            {channelStats.length === 0 ? (
              <p className="text-sm text-muted-foreground">No channel data for current filters.</p>
            ) : (
              <div className="text-xs">
                <div className="grid grid-cols-4 gap-1 font-medium text-muted-foreground uppercase text-[9px] border-b pb-1.5">
                  <span>Channel</span>
                  <span className="text-right">Tests</span>
                  <span className="text-right">Pass %</span>
                  <span className="text-right">Resp</span>
                </div>
                <div className="divide-y">
                  {channelStats.map((c) => (
                    <div key={c.channel} className="grid grid-cols-4 gap-1 py-1.5">
                      <span className="truncate">{channelDisplayLabel(c.channel)}</span>
                      <span className="text-right">{c.tests}</span>
                      <span className="text-right">{c.passRate}%</span>
                      <span className="text-right">{c.avgResponse}m</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>


        <Card className="border-muted-foreground/10 min-h-[260px] flex flex-col">
          <CardHeader className="pb-1">
            <div className="flex items-center gap-1.5">
              <div className="h-6 w-6 rounded-full bg-teal-100 flex items-center justify-center shrink-0"><Languages className="h-3.5 w-3.5 text-teal-600" /></div>
              <CardTitle className="text-xs text-muted-foreground uppercase">Language Performance</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0 flex-1 flex flex-col">
            {languageStats.length === 0 ? (
              <p className="text-sm text-muted-foreground">No language data for current filters.</p>
            ) : (
              <div className="text-xs">
                <div className="grid grid-cols-3 gap-1 font-medium text-muted-foreground uppercase text-[9px] border-b pb-1.5">
                  <span>Language</span>
                  <span className="text-right">Tests</span>
                  <span className="text-right">Translation Acc.</span>
                </div>
                <div className="divide-y">
                  {languageStats.map((l) => (
                    <div key={l.language} className="grid grid-cols-3 gap-1 py-1.5">
                      <span className="truncate">{l.language}</span>
                      <span className="text-right">{l.tests}</span>
                      <span className="text-right">{l.translationAcc}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>


        <Card className="border-muted-foreground/10 min-h-[260px] flex flex-col">
          <CardHeader className="pb-1">
            <div className="flex items-center gap-1.5">
              <div className="h-6 w-6 rounded-full bg-cyan-100 flex items-center justify-center shrink-0"><Mic className="h-3.5 w-3.5 text-cyan-600" /></div>
              <CardTitle className="text-xs text-muted-foreground uppercase">Voice Performance</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0 flex-1 flex flex-col justify-center space-y-3 text-xs">
            <div className="space-y-1">
              <div className="flex justify-between">
                <span>Voice Input Quality</span>
                <span className="font-medium">
                  {kpis.voiceSuccess.inputAvg !== null ? `${kpis.voiceSuccess.inputAvg}/10` : "No data"}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-cyan-500"
                  style={{ width: `${((kpis.voiceSuccess.inputAvg || 0) / 10) * 100}%` }}
                />
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span>Voice Output Quality</span>
                <span className="font-medium">
                  {kpis.voiceSuccess.outputAvg !== null ? `${kpis.voiceSuccess.outputAvg}/10` : "No data"}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-cyan-500"
                  style={{ width: `${((kpis.voiceSuccess.outputAvg || 0) / 10) * 100}%` }}
                />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground pt-1">
              {kpis.voiceSuccess.inputCount} input readings, {kpis.voiceSuccess.outputCount} output readings scored ({kpis.voiceSuccess.sampleSize} total).
            </p>
          </CardContent>
        </Card>


        <Card className="border-muted-foreground/10 min-h-[260px] flex flex-col">
          <CardHeader className="pb-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <div className="h-6 w-6 rounded-full bg-blue-100 flex items-center justify-center shrink-0"><Gauge className="h-3.5 w-3.5 text-blue-600" /></div>
                <CardTitle className="text-xs text-muted-foreground uppercase">SLA Compliance</CardTitle>
              </div>
              <InfoPopover title="SLA Compliance" align="end">
                <p>Based on the "SLA Status" column as marked by testers (Within SLA vs SLA Breached) - blank/NA/Not Applicable rows are excluded, not counted as breached.</p>
                <div className="flex justify-between pt-1 border-t"><span>Valid SLA rows</span><span className="font-medium">{kpis.slaBreakdown.validRows.toLocaleString()}</span></div>
                <div className="flex justify-between"><span>Within SLA</span><span className="font-medium">{kpis.slaBreakdown.withinSlaCount.toLocaleString()}</span></div>
                <div className="flex justify-between"><span>SLA Breached</span><span className="font-medium">{kpis.slaBreakdown.breachedCount.toLocaleString()}</span></div>
                <div className="flex justify-between pt-1 border-t"><span>Avg Delay</span><span className="font-medium">{kpis.slaBreakdown.avgDelayMinutes} min</span></div>
                <p className="text-[10px] text-muted-foreground pt-1">
                  Avg Delay = Response Time − 120 min, averaged over {(kpis.slaBreakdown.breachedCount - kpis.slaBreakdown.breachedWithoutTimeCount).toLocaleString()} of {kpis.slaBreakdown.breachedCount.toLocaleString()} breached rows ({kpis.slaBreakdown.breachedWithoutTimeCount.toLocaleString()} breached rows had no usable Response Time reading).
                </p>
              </InfoPopover>
            </div>
          </CardHeader>
          <CardContent className="pt-0 flex-1 flex flex-col">
            <GaugeGraphic value={kpis.slaBreakdown.withinSlaPct} color={healthColorHex(kpis.slaBreakdown.withinSlaPct)} label="Within SLA" />

            <div className="mt-3 space-y-1.5 text-xs border-t pt-2">
              <div className="flex justify-between">
                <span>Exceeded SLA</span>
                <span className="font-medium">{kpis.slaBreakdown.exceededSlaPct}%</span>
              </div>
              <div className="flex justify-between">
                <span>Avg Delay</span>
                <span className="font-medium">{kpis.slaBreakdown.avgDelayMinutes} mins</span>
              </div>
            </div>
          </CardContent>
        </Card>


      </div>
    </>
  );
}
