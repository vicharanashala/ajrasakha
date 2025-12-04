"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import type { QuestionStatus } from "@/types";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";

export interface StatusOverview {
  questions: { status: QuestionStatus; value: number }[];
  answers: { status: string; value: number }[];
}
const colors = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];
export const StatusCharts = ({ data }: { data: StatusOverview }) => {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Question Status Overview
            </CardTitle>
            <CardDescription>Distribution of question statuses</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={data.questions}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  nameKey="status"
                >
                  {data.questions.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={colors[index % colors.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius)",
                    color: "var(--color-foreground)",
                  }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>

            <div className="mt-6 grid grid-cols-3 gap-3">
              {data.questions.map((item) => (
                <div
                  key={item.status}
                  className="p-3 rounded-lg bg-muted text-center"
                >
                  <p className="text-xs text-muted-foreground">{item.status}</p>
                  <p className="text-lg font-semibold text-foreground">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Answer Status Overview</CardTitle>
            <CardDescription>Distribution of question statuses</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={data.answers}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  nameKey="status"
                >
                  {data.answers.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={colors[index % colors.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius)",
                    color: "var(--color-foreground)",
                  }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>

            <div className={`mt-6 grid grid-cols-2 gap-3`}>
              {data.answers.map((item) => (
                <div
                  key={item.status}
                  className="p-3 rounded-lg bg-muted text-center"
                >
                  <p className="text-xs text-muted-foreground">{item.status}</p>
                  <p className="text-lg font-semibold text-foreground">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
