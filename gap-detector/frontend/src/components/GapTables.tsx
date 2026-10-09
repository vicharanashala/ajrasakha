import { Fragment, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtDate, fmtGrowth } from "../api";
import type { Cluster, Outreach, TopGap } from "../types";
import { Chip, PriorityBadge, Sparkline } from "./ui";

/** Ranked list of gap clusters with an expandable detail row. */
export function TopGapsTable({ gaps, clusters }: { gaps: TopGap[]; clusters: Cluster[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const weekly = new Map(clusters.map((c) => [c.cluster_id, c.weekly_counts]));
  return (
    <div className="overflow-x-auto">
      <table className="data w-full text-sm">
        <thead>
          <tr>
            <th>#</th>
            <th>Question type</th>
            <th className="text-right">Queries</th>
            <th className="text-right">Farmers</th>
            <th>Weekly</th>
            <th className="text-right">Growth</th>
            <th className="text-right">Score</th>
            <th>Priority</th>
            <th>Where</th>
          </tr>
        </thead>
        <tbody>
          {gaps.map((g, i) => (
            <Fragment key={g.cluster_id}>
              <tr className="cursor-pointer" onClick={() => setOpen(open === g.cluster_id ? null : g.cluster_id)}>
                <td className="tabular" style={{ color: "var(--muted)" }}>{i + 1}</td>
                <td className="font-medium">{g.cluster_name}</td>
                <td className="tabular text-right">{g.size}</td>
                <td className="tabular text-right">{g.farmer_demand}</td>
                <td><Sparkline values={weekly.get(g.cluster_id) ?? []} /></td>
                <td className="tabular text-right">{fmtGrowth(g.growth_rate)}</td>
                <td className="tabular text-right">{Math.round(g.priority_score)}</td>
                <td><PriorityBadge level={g.priority_level} /></td>
                <td className="max-w-[220px] truncate" title={g.states.join(", ")}>{g.states.slice(0, 3).join(", ") || "—"}</td>
              </tr>
              {open === g.cluster_id && (
                <tr>
                  <td />
                  <td colSpan={8} className="pb-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <div className="mb-1 text-xs" style={{ color: "var(--muted)" }}>Representative queries</div>
                        <ul className="list-disc space-y-1 pl-4">
                          {g.sample_queries.map((q) => <li key={q}>{q}</li>)}
                        </ul>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <div className="mb-1 text-xs" style={{ color: "var(--muted)" }}>Recommended action</div>
                          <div>{g.recommended_action}</div>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {g.crops.map((c) => <Chip key={c}>{c}</Chip>)}
                          {g.domains.map((d) => <Chip key={d}>{d}</Chip>)}
                          {g.keywords.slice(0, 5).map((k) => <Chip key={k}>{k}</Chip>)}
                        </div>
                        <div className="text-xs" style={{ color: "var(--ink-2)" }}>
                          First seen {fmtDate(g.first_seen)} · last seen {fmtDate(g.last_seen)}
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Horizontal bars, one series, single hue; direct value labels via tooltip. */
export function GapsByDimension({ rows, label }: { rows: { name: string; gap_count: number }[]; label: string }) {
  const data = rows.slice(0, 8);
  if (!data.length) return <div className="text-sm" style={{ color: "var(--ink-2)" }}>No gap cells.</div>;
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, data.length * 28 + 24)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }} barCategoryGap={2}>
        <CartesianGrid horizontal={false} stroke="var(--grid)" />
        <XAxis type="number" tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={{ stroke: "var(--axis)" }} tickLine={false} />
        <YAxis type="category" dataKey="name" width={130} tick={{ fill: "var(--ink-2)", fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip
          cursor={{ fill: "var(--accent-soft)", opacity: 0.4 }}
          contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--ink)", fontSize: 12 }}
          formatter={(v: number) => [v, `unanswered (${label})`]}
        />
        <Bar dataKey="gap_count" fill="var(--accent)" radius={[0, 4, 4, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function OutreachList({ items }: { items: Outreach[] }) {
  if (!items.length) return <div className="text-sm" style={{ color: "var(--ink-2)" }}>No outreach recommendations yet.</div>;
  return (
    <ol className="space-y-2">
      {items.map((o) => (
        <li key={`${o.target_state}-${o.focus_domain}`} className="flex items-start justify-between gap-3 border-b pb-2 last:border-0 hairline">
          <div>
            <div className="font-medium">{o.target_state} · {o.focus_domain}</div>
            <div className="text-xs" style={{ color: "var(--ink-2)" }}>{o.recommendation}</div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="tabular text-sm">{o.gap_questions} queries</span>
            <PriorityBadge level={o.priority} />
          </div>
        </li>
      ))}
    </ol>
  );
}
