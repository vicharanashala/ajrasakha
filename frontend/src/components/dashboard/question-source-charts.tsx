"use client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import CountUp from "react-countup";

interface QuestionSourceChartsProps {
  whatsappCount: number;
  ajrasakhaCount: number;
}

const colors = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
];

export const QuestionSourceCharts = ({
  whatsappCount,
  ajrasakhaCount,
}: QuestionSourceChartsProps) => {

  const data = [
    { name: "WhatsApp", value: whatsappCount },
    { name: "Ajrasakha", value: ajrasakhaCount },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Question Sources</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Distribution of questions by source
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={2}
              dataKey="value"
              nameKey="name"
              stroke="none"
            >
              {data.map((_, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={colors[index % colors.length]}
                  stroke="none"
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
              itemStyle={{
                color: "var(--color-foreground)",
              }}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>

        {/* Stats Cards */}
        <div className="mt-6 grid grid-cols-2 gap-3">
          {data.map((item, index) => (
            <div
              key={item.name}
              className="p-3 rounded-lg bg-muted text-center"
            >
              <p className="text-xs text-muted-foreground">{item.name}</p>
              <p className="text-lg font-semibold text-foreground">
                <CountUp end={item.value} duration={2} preserveValue />
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
