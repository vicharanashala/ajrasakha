"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/atoms/tabs";

const cropData = [
  { name: "Rice", value: 245, color: "var(--color-chart-1)" },
  { name: "Wheat", value: 189, color: "var(--color-chart-2)" },
  { name: "Corn", value: 167, color: "var(--color-chart-3)" },
  { name: "Cotton", value: 142, color: "var(--color-chart-4)" },
  { name: "Others", value: 257, color: "var(--color-chart-5)" },
  { name: "Rice", value: 245, color: "var(--color-chart-1)" },
];

const stateData = [
  { state: "Maharashtra", count: 234 },
  { state: "Punjab", count: 198 },
  { state: "Uttar Pradesh", count: 187 },
  { state: "Karnataka", count: 156 },
  { state: "Rajasthan", count: 145 },
  { state: "Maharashtra", count: 234 },
  { state: "Punjab", count: 198 },
  { state: "Uttar Pradesh", count: 187 },
  { state: "Karnataka", count: 156 },
  { state: "Rajasthan", count: 145 },
  { state: "Maharashtra", count: 234 },
  { state: "Punjab", count: 198 },
  { state: "Uttar Pradesh", count: 187 },
  { state: "Karnataka", count: 156 },
  { state: "Rajasthan", count: 145 },
];

const domainData = [
  { name: "Pest Management", value: 312, color: "var(--color-chart-1)" },
  { name: "Soil Health", value: 287, color: "var(--color-chart-2)" },
  { name: "Irrigation", value: 256, color: "var(--color-chart-3)" },
  { name: "Fertilizers", value: 201, color: "var(--color-chart-4)" },
];

export function QuestionsAnalytics() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Questions & Answers Analytics</CardTitle>
        <CardDescription>Breakdown by crop, state, and domain</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="crop" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="crop">By Crop</TabsTrigger>
            <TabsTrigger value="state">By State</TabsTrigger>
            <TabsTrigger value="domain">By Domain</TabsTrigger>
          </TabsList>

          <TabsContent value="crop" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-4">
                  Crop Distribution
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={cropData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${value}`}
                      outerRadius={100}
                      dataKey="value"
                    >
                      {cropData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
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
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground mb-4">
                  Crop Breakdown
                </h3>
                {cropData.map((item) => (
                  <div
                    key={item.name}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-sm text-foreground">
                        {item.name}
                      </span>
                    </div>
                    <span className="font-semibold text-foreground">
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="state" className="mt-6">
            <h3 className="text-sm font-semibold text-foreground mb-4">
              Questions by State
            </h3>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={stateData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                />
                <XAxis
                  dataKey="state"
                  stroke="var(--color-muted-foreground)"
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis stroke="var(--color-muted-foreground)" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius)",
                    color: "var(--color-foreground)",
                  }}
                />
                <Bar
                  dataKey="count"
                  fill="var(--color-chart-2)"
                  radius={[8, 8, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </TabsContent>

          <TabsContent value="domain" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-4">
                  Domain Distribution
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={domainData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${value}`}
                      outerRadius={100}
                      dataKey="value"
                    >
                      {domainData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
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
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground mb-4">
                  Domain Breakdown
                </h3>
                {domainData.map((item) => (
                  <div
                    key={item.name}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-sm text-foreground">
                        {item.name}
                      </span>
                    </div>
                    <span className="font-semibold text-foreground">
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
