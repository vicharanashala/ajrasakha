"use client";


import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/atoms/card";
import CountUp from "react-countup";
import { useRestartOnView } from "@/hooks/ui/useRestartView";

export interface UserRoleOverview {
  role: string;
  count: number;
}


const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length > 0) {
    const entry = payload[0];

    return (
      <div
        className="
          z-50 
          bg-card text-gray-900 
          dark:text-gray-100
          border dark:border-gray-700
          p-2 rounded-md shadow-lg
          text-sm
        "
      >
        <strong>{entry.name}</strong>: {entry.value} users
      </div>
    );
  }
  return null;
};
interface ModeratorsOverviewProps {
  data: UserRoleOverview[];
}
export const ModeratorsOverview: React.FC<ModeratorsOverviewProps> = ({
  data,
}) => {
  const total = data.reduce((acc, item) => acc + item.count, 0);
  const {ref,key} = useRestartOnView()
  return (
    <Card ref={ref} className="flex flex-col">
      <CardHeader className="pb-0">
        <CardTitle>Role Overview</CardTitle>
        <CardDescription>Experts vs Moderators</CardDescription>
      </CardHeader>

      <CardContent className="flex-1 flex justify-center items-center pb-0">
        <div className="relative w-[220px]">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart key={key}>
              <Pie
                data={data}
                dataKey="count"
                nameKey="role"
                innerRadius={70}
                outerRadius={100}
                paddingAngle={4}
                cursor="pointer"
                stroke="none"
                // Optional: active slice highlight
                activeIndex={undefined}
              >
                {data.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={
                      entry.role == "Experts"
                        ? "var(--chart-1)"
                        : entry.role == "Moderators"
                          ? "var(--chart-2)"
                          : "var(--chart-3)"
                    }
                    stroke="none"
                  />
                ))}
              </Pie>

              <Tooltip
                content={<CustomTooltip />}
                cursor={{ fill: "rgba(0,0,0,0.1)" }}
              />
            </PieChart>
          </ResponsiveContainer>

          {/* Center Label showing total */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
            <span className="text-3xl font-bold"><CountUp key={key}  end={total} duration={2} preserveValue /></span>
            <span className="text-sm text-muted-foreground">Total Users</span>
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex-col gap-2 text-sm">
        <div className="text-muted-foreground leading-none">
          Showing count of active users by role
        </div>
      </CardFooter>
    </Card>
  );
};
