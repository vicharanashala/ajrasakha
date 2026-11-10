import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import { useRestartOnView } from "@/hooks/ui/useRestartView";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from "recharts";

export interface ReviewQualityDimensionCounts {
  contextRelevance: number;
  technicalAccuracy: number;
  practicalUtility: number;
  valueInsight: number;
  credibilityTrust: number;
  readabilityCommunication: number;
}

export interface ReviewQualityAnalytics {
  totalReviews: number;
  failureCounts: ReviewQualityDimensionCounts;
  failureRates: ReviewQualityDimensionCounts;
}

const DIMENSION_LABELS: Record<keyof ReviewQualityDimensionCounts, string> = {
  contextRelevance: "Context & Relevance",
  technicalAccuracy: "Technical Accuracy",
  practicalUtility: "Practical Utility",
  valueInsight: "Value Addition / Insight",
  credibilityTrust: "Credibility & Trust",
  readabilityCommunication: "Readability & Communication",
};

const BAR_COLOR = "hsl(0, 84%, 60%)";

export const ReviewQualityAnalyticsCard = ({
  data,
}: {
  data: ReviewQualityAnalytics | null | undefined;
}) => {
  const { ref, key } = useRestartOnView();

  const chartData = (
    Object.keys(DIMENSION_LABELS) as (keyof ReviewQualityDimensionCounts)[]
  ).map(dimension => ({
    dimension,
    label: DIMENSION_LABELS[dimension],
    failureRate: data?.failureRates?.[dimension] ?? 0,
    failureCount: data?.failureCounts?.[dimension] ?? 0,
  }));

  const totalReviews = data?.totalReviews ?? 0;

  return (
    <div className="space-y-6">
      <Card ref={ref}>
        <CardHeader>
          <CardTitle>Review Quality Breakdown</CardTitle>
          <CardDescription>
            {totalReviews > 0
              ? `Share of ${totalReviews} answer review${totalReviews === 1 ? "" : "s"} that failed each quality dimension`
              : "No answer reviews with quality checklist data found for this period"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart
              key={`reviewQualityAnalytics-${key}`}
              data={chartData}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--color-border)"
              />
              <XAxis
                type="number"
                unit="%"
                domain={[0, 100]}
                stroke="var(--color-muted-foreground)"
              />
              <YAxis
                type="category"
                dataKey="label"
                width={180}
                stroke="var(--color-muted-foreground)"
                tick={{ fontSize: 12 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius)",
                }}
                formatter={(value: number, _name, item) => [
                  `${value}% (${item.payload.failureCount} of ${totalReviews})`,
                  "Failure rate",
                ]}
              />
              <Bar dataKey="failureRate" name="Failure rate" radius={[0, 4, 4, 0]}>
                {chartData.map(entry => (
                  <Cell key={entry.dimension} fill={BAR_COLOR} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
};
