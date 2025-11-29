"use client";

// import {
//   Card,
//   CardContent,
//   CardDescription,
//   CardFooter,
//   CardHeader,
//   CardTitle,
// } from "@/components/atoms/card";
// import { TrendingUp, Users } from "lucide-react";
import { ChartContainer, type ChartConfig } from "../atoms/chart";
import {
  Label,
  PolarGrid,
  PolarRadiusAxis,
  RadialBar,
  RadialBarChart,
} from "recharts";

// export function ModeratorsOverview() {
//   // Mock data - replace with real API
//   const experts = 156;
//   const moderators = 24;

//   return (
//     <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
//       <Card>
//         <CardHeader className="pb-3">
//           <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
//             <Users className="w-4 h-4" />
//             Total Experts
//           </CardTitle>
//         </CardHeader>
//         <CardContent>
//           <div className="text-3xl font-bold text-foreground">{experts}</div>
//           <p className="text-xs text-muted-foreground mt-2">
//             Active on platform
//           </p>
//         </CardContent>
//       </Card>

//       <Card>
//         <CardHeader className="pb-3">
//           <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
//             <Users className="w-4 h-4" />
//             Total Moderators
//           </CardTitle>
//         </CardHeader>
//         <CardContent>
//           <div className="text-3xl font-bold text-foreground">{moderators}</div>
//           <p className="text-xs text-muted-foreground mt-2">
//             Active moderators
//           </p>
//         </CardContent>
//       </Card>
//     </div>
//   );
// }

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/atoms/card";
import { TrendingUp } from "lucide-react";

const data = [
  { name: "Experts", value: 21, color: "var(--chart-1)" },
  { name: "Moderators", value: 5, color: "var(--chart-2)" },
];

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length > 0) {
    const entry = payload[0];
    return (
      <div className="bg-white border p-2 rounded shadow-sm text-sm">
        <strong>{entry.name}</strong>: {entry.value} users
      </div>
    );
  }
  return null;
};

export const ModeratorsOverview = () => {
  const total = data.reduce((acc, item) => acc + item.value, 0);

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-0">
        <CardTitle>Role Overview</CardTitle>
        <CardDescription>Experts vs Moderators</CardDescription>
      </CardHeader>

      <CardContent className="flex-1 flex justify-center items-center pb-0">
        <div className="relative w-[220px]">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={70}
                outerRadius={100}
                paddingAngle={4}
                cursor="pointer"
                // Optional: active slice highlight
                activeIndex={undefined}
              >
                {data.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
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
            <span className="text-3xl font-bold">{total}</span>
            <span className="text-sm text-muted-foreground">Total Users</span>
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex-col gap-2 text-sm">
        <div className="flex items-center gap-1 leading-none font-medium">
          Trending up by 5.2% this month <TrendingUp className="h-4 w-4" />
        </div>
        <div className="text-muted-foreground leading-none">
          Showing count of active users by role
        </div>
      </CardFooter>
    </Card>
  );
};
