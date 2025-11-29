"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/card"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"
import { TrendingUp, Database, CheckCircle2 } from "lucide-react"

// Golden dataset growth data
const goldenDatasetData = [
  { month: "January", entries: 1240, verified: 1100 },
  { month: "February", entries: 1890, verified: 1650 },
  { month: "March", entries: 2400, verified: 2100 },
  { month: "April", entries: 2780, verified: 2450 },
  { month: "May", entries: 3390, verified: 3000 },
  { month: "June", entries: 3800, verified: 3400 },
]

export function GoldenDataset() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Total Entries</p>
                <p className="text-3xl font-bold text-foreground">3,800</p>
                <p className="text-xs text-green-600 mt-2 font-medium">↑ 12.4% from last month</p>
              </div>
              <Database className="w-8 h-8 text-chart-1 opacity-60" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Verified Entries</p>
                <p className="text-3xl font-bold text-foreground">3,400</p>
                <p className="text-xs text-green-600 mt-2 font-medium">↑ 13.3% verification rate</p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-chart-2 opacity-60" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground mb-1">This Month Added</p>
                <p className="text-3xl font-bold text-foreground">410</p>
                <p className="text-xs text-green-600 mt-2 font-medium">↑ 8.7% daily average</p>
              </div>
              <TrendingUp className="w-8 h-8 text-chart-3 opacity-60" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Golden Dataset Growth Trend</CardTitle>
          <CardDescription>Monthly growth trajectory of golden dataset entries</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={goldenDatasetData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="month" stroke="var(--color-muted-foreground)" />
              <YAxis stroke="var(--color-muted-foreground)" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius)",
                  color: "var(--color-foreground)",
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="entries"
                stroke="var(--color-chart-1)"
                strokeWidth={2}
                name="Total Entries"
              />
              <Line
                type="monotone"
                dataKey="verified"
                stroke="var(--color-chart-2)"
                strokeWidth={2}
                name="Verified Entries"
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
