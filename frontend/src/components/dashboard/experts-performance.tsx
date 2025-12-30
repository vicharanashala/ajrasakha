import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export interface ExpertPerformance {
  expert: string;
  reputation: number;
  incentive: number;
  penalty: number;
}

export const ExpertsPerformance = ({ data }: { data: ExpertPerformance[] }) => {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Experts Performance Metrics</CardTitle>
          <CardDescription>
            Reputation, incentive, and penalty scores comparison across experts
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart
              data={data}
              margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--color-border)"
              />
              <XAxis
                dataKey="expert"
                stroke="var(--color-muted-foreground)"
                angle={-45}
                textAnchor="end"
                height={80}
                tick={{ fontSize: 12 }}
              />
              <YAxis stroke="var(--color-muted-foreground)" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius)",
                }}
              />
              <Legend />
              <Bar dataKey="reputation" fill="var(--color-chart-1)" />
              <Bar dataKey="incentive" fill="var(--color-chart-2)" />
              <Bar dataKey="penalty" fill="var(--color-chart-3)" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
};
