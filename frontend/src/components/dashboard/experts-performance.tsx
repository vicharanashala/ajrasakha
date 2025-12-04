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

      {/* <Card>
        <CardHeader>
          <CardTitle>Expert Leaderboard</CardTitle>
          <CardDescription>
            Ranked by reputation score with performance indicators
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 font-semibold text-foreground">
                    Rank
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-foreground">
                    Expert Name
                  </th>
                  <th className="text-center py-3 px-4 font-semibold text-foreground">
                    Reputation
                  </th>
                  <th className="text-center py-3 px-4 font-semibold text-foreground">
                    Incentive
                  </th>
                  <th className="text-center py-3 px-4 font-semibold text-foreground">
                    Penalty
                  </th>
                  <th className="text-center py-3 px-4 font-semibold text-foreground">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map((expert, index) => (
                  <tr
                    key={expert.expert}
                    className="border-b border-border hover:bg-accent/50 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        {index === 0 && (
                          <Award className="w-4 h-4 text-chart-1" />
                        )}
                        <span className="font-semibold text-foreground">
                          #{index + 1}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-foreground font-medium">
                      {expert.expert}
                    </td>
                    <td className="py-3 px-4 text-center text-foreground font-semibold">
                      {expert.reputation.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-center text-foreground">
                      {expert.incentive.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={
                          expert.penalty > 225
                            ? "text-chart-3 font-semibold"
                            : "text-muted-foreground"
                        }
                      >
                        {expert.penalty}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {expert.penalty > 225 ? (
                          <>
                            <TrendingDown className="w-4 h-4 text-chart-3" />
                            <span className="text-xs text-chart-3 font-medium">
                              Review
                            </span>
                          </>
                        ) : (
                          <>
                            <TrendingUp className="w-4 h-4 text-chart-1" />
                            <span className="text-xs text-chart-1 font-medium">
                              Good
                            </span>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card> */}
    </div>
  );
};
