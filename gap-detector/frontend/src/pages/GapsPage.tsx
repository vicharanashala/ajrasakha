import { fmtDate, useGet } from "../api";
import { CoverageHeatmap } from "../components/CoverageHeatmap";
import { GapsByDimension, OutreachList, TopGapsTable } from "../components/GapTables";
import { Empty, KpiTile, LoadState, Section } from "../components/ui";
import type { Cluster, GapReport } from "../types";

export function GapsPage() {
  const report = useGet<GapReport>("/gaps/report/latest");
  const clusters = useGet<Cluster[]>(report.data ? `/gaps/clusters?run_id=${report.data.run_id}&limit=100` : null);

  if (report.loading || report.error) {
    return (
      <div className="space-y-3">
        <LoadState loading={report.loading} error={report.error} />
        {report.error?.includes("no gap report") && (
          <Empty>Run <code>python -m pipeline.run_gap_report</code> to generate the first report.</Empty>
        )}
      </div>
    );
  }
  const r = report.data!;
  const cov = r.coverage_stats;
  const critical = r.top_gaps.filter((g) => g.priority_level === "CRITICAL").length;
  const high = r.top_gaps.filter((g) => g.priority_level === "HIGH").length;
  const growing = r.top_gaps.filter((g) => g.growth_rate > 0).length;

  return (
    <div className="space-y-4">
      <div className="text-xs" style={{ color: "var(--ink-2)" }}>
        Report {r.run_id} · window {fmtDate(r.start_date)} → {fmtDate(r.end_date)} ({r.period_days} days) · generated {fmtDate(r.generated_at)}
        {(r.excluded_non_agricultural > 0 || r.excluded_test_traffic > 0) && (
          <> · excluded {r.excluded_non_agricultural} off-topic and {r.excluded_test_traffic} test queries</>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile label="Unanswered queries" value={r.total_disclaimers.toLocaleString()} hint={`${r.unique_queries.toLocaleString()} unique`} />
        <KpiTile label="Question types (clusters)" value={r.clusters_found} hint={`${critical} critical · ${high} high priority`} />
        <KpiTile label="Coverage cells with a gap" value={`${cov.gaps} / ${cov.total_combinations}`} hint={`${cov.covered} good · ${cov.partial} partial`} />
        <KpiTile label="Growing question types" value={growing} hint="rising vs the earlier half of the window" />
      </div>

      <Section
        title="Top GDB gaps — ranked by farmer demand"
        subtitle="Semantic clusters of queries the bot could not answer. Score = frequency · growth · unique farmers · geographic spread. Click a row for detail."
      >
        {r.top_gaps.length ? <TopGapsTable gaps={r.top_gaps} clusters={clusters.data ?? []} /> : <Empty>No clusters in this window.</Empty>}
      </Section>

      <Section
        title="Coverage heatmap — domain × state"
        subtitle="How well the Golden DB covers each domain in each state: GDB entries vs unanswered queries."
      >
        <CoverageHeatmap cells={cov.heatmap} />
      </Section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Gaps by domain" subtitle="Unanswered queries in cells with no usable GDB coverage.">
          <GapsByDimension rows={r.domains_with_gaps.map((d) => ({ name: d.domain, gap_count: d.gap_count }))} label="domain" />
        </Section>
        <Section title="Gaps by state" subtitle="Same, aggregated by state.">
          <GapsByDimension rows={r.states_with_gaps.map((d) => ({ name: d.state, gap_count: d.gap_count }))} label="state" />
        </Section>
        <Section title="Gaps by crop" subtitle="Crop-level view of the same coverage model.">
          <GapsByDimension rows={(r.crops_with_gaps ?? []).map((d) => ({ name: d.crop, gap_count: d.gap_count }))} label="crop" />
        </Section>
      </div>

      <Section title="Outreach recommendations" subtitle="Where field engagement would close the most gaps, ranked by unanswered volume.">
        <OutreachList items={r.outreach_recommendations} />
      </Section>
    </div>
  );
}
