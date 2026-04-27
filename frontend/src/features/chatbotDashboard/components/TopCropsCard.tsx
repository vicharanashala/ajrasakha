import React from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/atoms/card";
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
import { Spinner } from "@/components/atoms/spinner";


const colors = [
  "var(--color-chart-1, #3AAA5A)",
  "var(--color-chart-2, #378ADD)",
  "var(--color-chart-3, #A56EFF)",
  "var(--color-chart-4, #FFB020)",
  "var(--color-chart-5, #F94144)",
];
interface TopCropItem {
  id?: string | number;
  name?: string;
  value?: number;
  [key: string]: any;
}

interface TopCropsData {
  totalQuestions: number;
  topCrops: TopCropItem[];
}

interface TopCropsCardProps {
  topCrops: TopCropsData|undefined;
  isLoadingTopCrops: boolean;
  errorLoadingtopCrops: string | null| Error;
}

export const TopCropsCard = ({topCrops,
  isLoadingTopCrops,
  errorLoadingtopCrops}:TopCropsCardProps) => {
 
  const processedData = React.useMemo(() => {
    if (!topCrops?.topCrops) return [];
    
    const sortedCrops = [...topCrops.topCrops].sort((a, b) => b.count - a.count);
    const top5 = sortedCrops.slice(0, 5);
    const rest = sortedCrops.slice(5);
    
    const finalData: any = top5.map(item => ({ ...item, subItems: null }));
    
    if (rest.length > 0) {
      const othersCount = rest.reduce((sum, item) => sum + item.count, 0);
      finalData.push({ name: 'Others', count: othersCount, subItems: rest });
    }
    
    return finalData.map((item:any, index:number) => ({
      ...item,
      color: colors[index % colors.length],
    }));
  }, [topCrops?.topCrops]);

  if (isLoadingTopCrops) {
    return (
      <Card className="h-full min-h-[300px] flex items-center justify-center">
        <Spinner text="Loading Top Crops..." />
      </Card>
    );
  }

  if (errorLoadingtopCrops || !topCrops) {
    return (
      <Card className="h-full min-h-[300px] flex items-center justify-center text-destructive">
        Error loading top crops.
      </Card>
    );
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const pointInfo = payload[0].payload;
      return (
        <div className="bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 rounded-lg shadow-lg p-3 text-sm text-gray-800 dark:text-gray-200 flex flex-col gap-1 min-w-[140px]">
          <p className="font-semibold pb-1 border-b border-gray-100 dark:border-gray-800">{label}</p>
          
          {!pointInfo.subItems ? (
             <div className="flex justify-between gap-4 mt-1">
               <span className="text-gray-500 dark:text-gray-400">Total</span>
               <span className="font-bold">{pointInfo.count}</span>
             </div>
          ) : (
             <div className="flex flex-col gap-1 mt-1 max-h-[160px] overflow-y-auto pr-1">
               {pointInfo.subItems.map((item: any) => (
                  <div key={item.name} className="flex justify-between gap-4 text-xs">
                    <span className="text-gray-500 dark:text-gray-400 truncate max-w-[100px]">{item.name}</span>
                    <span className="font-medium align-right">{item.count}</span>
                  </div>
               ))}
               <div className="flex justify-between gap-4 mt-2 pt-1 border-t border-gray-100 dark:border-gray-800 text-xs font-semibold">
                  <span>Total</span>
                  <span>{pointInfo.count}</span>
               </div>
             </div>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="flex flex-col h-full bg-white dark:bg-[#1a1a1a] shadow-sm overflow-hidden">
      <CardHeader>
        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Top Crops by Questions</CardTitle>
        <CardDescription>Most frequently asked crops. Total Matching Questions: <span className="font-semibold text-gray-900 dark:text-gray-100">{topCrops.totalQuestions.toLocaleString()}</span></CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pb-4">
        <div className="w-full h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={processedData}
              margin={{ top: 25, right: 10, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border, #e2e8f0)" />
              <XAxis
                dataKey="name"
                stroke="var(--color-muted-foreground, #64748b)"
                tick={{ fontSize: 11, textAnchor: "end", dy: 8 }}
                tickLine={false}
                axisLine={false}
                interval={0}
                height={50}
                angle={-35}
              />
              <YAxis
                stroke="var(--color-muted-foreground)"
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) =>
                  value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value
                }
              />
              <Tooltip
                cursor={{ fill: 'var(--color-muted, #f1f5f9)', opacity: 0.4 }}
                content={<CustomTooltip />}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {processedData.map((entry:any, index:null) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};
