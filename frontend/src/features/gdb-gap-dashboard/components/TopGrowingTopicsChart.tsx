import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import type { GapClusterItem } from "../types";

export interface TopGrowingTopicsChartProps {
  /** Full cluster list — we sort and pick the top growers on the client. */
  clusters?: GapClusterItem[];
  /** Maximum number of bars to render. */
  limit?: number;
}

/**
 * Horizontal bar chart of the fastest-growing gap clusters.
 *
 * The backend returns growth in the cluster entries
 * (`avg_weekly_growth_pct`) so the dashboard just sorts the list and
 * slices the top N — no extra server round-trip required.
 */
export function TopGrowingTopicsChart({
  clusters,
  limit = 10,
}: TopGrowingTopicsChartProps) {
  const data = (clusters ?? [])
    .filter((c) => typeof c.theme === "string" && c.theme.length > 0)
    .slice()
    .sort(
      (a, b) =>
        (b.avg_weekly_growth_pct ?? 0) - (a.avg_weekly_growth_pct ?? 0),
    )
    .slice(0, limit)
    .map((c) => ({
      topic: c.theme,
      growth_pct: Math.round((c.avg_weekly_growth_pct ?? 0) * 1000) / 10,
      question_volume: c.query_count ?? 0,
    }));

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Fastest-growing topics</CardTitle>
          <CardDescription>No growth signal reported yet.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground" role="status">
            Once farmers start asking new questions, the top movers will appear here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fastest-growing topics</CardTitle>
        <CardDescription>
          Top {data.length} clusters by period-over-period growth.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-64 w-full" aria-label="Bar chart of fastest-growing topics">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 5, right: 16, left: 8, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={(v) => `${v}%`}
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
              />
              <YAxis
                type="category"
                dataKey="topic"
                width={120}
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
              />
              <Tooltip
                formatter={(value: number) => [`${value}%`, "Growth"]}
                labelStyle={{ color: "hsl(var(--foreground))" }}
              />
              <Bar
                dataKey="growth_pct"
                fill="hsl(var(--primary))"
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Growth % is computed against the previous reporting window.
        </p>
      </CardContent>
    </Card>
  );
}