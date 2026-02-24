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
  const {ref,key} = useRestartOnView()
  return (
    <div className="space-y-6">
      <Card ref={ref}>
        <CardHeader>
          <CardTitle>Experts Performance Metrics</CardTitle>
          <CardDescription>
            Reputation, incentive, and penalty scores comparison across experts
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart
              key={`expertPerformance-${key}`}
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
                height={100}
                interval={0}
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
              <Legend 
                verticalAlign="bottom" 
                wrapperStyle={{ paddingTop: "20px" }}
              />
              <Bar
                dataKey="reputation"
                name="Pending Workload"
                fill="hsl(45, 93%, 47%)"
              />
              <Bar 
                dataKey="incentive" 
                name="Incentive"
                fill="hsl(142, 76%, 36%)" 
              />
              <Bar 
                dataKey="penalty" 
                name="Penalty"
                fill="hsl(0, 84%, 60%)" 
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
};
