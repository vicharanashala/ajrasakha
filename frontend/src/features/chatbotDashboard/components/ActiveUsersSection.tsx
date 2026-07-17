// ─── Active Users Section Component ──────────────────────────────────────────
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/atoms/tabs";
import { Users, RefreshCw, UserMinus, HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/atoms/tooltip";
import { ActiveUsersChart } from "../active-users";
import { RetentionMetricsChart } from "../retention-metrics";
import { ChurnRateChart } from "../ChurnRateChart";

export interface ActiveUsersSectionProps {
  activeChartTab: string;
  onChartTabChange: (tab: string) => void;
  source: "annam" | "whatsapp";
  userType: string;
}

export function ActiveUsersSection({
  activeChartTab,
  onChartTabChange,
  source,
  userType,
}: ActiveUsersSectionProps) {
  return (
    <Tabs
      value={activeChartTab}
      onValueChange={onChartTabChange}
      className="w-full"
    >
      <TabsList className="grid w-full max-w-xl grid-cols-3 mb-4">
        <TabsTrigger
          value="dau"
          className="flex items-center justify-center gap-1.5"
        >
          <Users className="h-3.5 w-3.5" />
          <span>Daily Active Users</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help inline-flex items-center p-0.5 text-muted-foreground/60 hover:text-muted-foreground">
                <HelpCircle className="h-3.5 w-3.5" />
              </span>
            </TooltipTrigger>
            <TooltipContent>
              Shows daily, weekly, or monthly active chatbot user trends based
              on latest activity.
            </TooltipContent>
          </Tooltip>
        </TabsTrigger>

        <TabsTrigger
          value="retention"
          className="flex items-center justify-center gap-1.5"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>User Retention</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help inline-flex items-center p-0.5 text-muted-foreground/60 hover:text-muted-foreground">
                <HelpCircle className="h-3.5 w-3.5" />
              </span>
            </TooltipTrigger>
            <TooltipContent>
              Tracks D1, D7, and D30 cohort-based user retention over time.
            </TooltipContent>
          </Tooltip>
        </TabsTrigger>

        <TabsTrigger
          value="churn"
          className="flex items-center justify-center gap-1.5"
        >
          <UserMinus className="h-3.5 w-3.5" />
          <span>Monthly Churn</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help inline-flex items-center p-0.5 text-muted-foreground/60 hover:text-muted-foreground">
                <HelpCircle className="h-3.5 w-3.5" />
              </span>
            </TooltipTrigger>
            <TooltipContent>
              Measures the percentage of users active in the previous month who
              did not return.
            </TooltipContent>
          </Tooltip>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="dau" className="mt-0">
        {activeChartTab === "dau" && (
          <ActiveUsersChart source={source as "annam"} userType={userType} />
        )}
      </TabsContent>

      <TabsContent value="retention" className="mt-0">
        {activeChartTab === "retention" && (
          <RetentionMetricsChart source={source as "annam"} userType={userType} />
        )}
      </TabsContent>

      <TabsContent value="churn" className="mt-0">
        {activeChartTab === "churn" && (
          <ChurnRateChart source={source as "annam"} userType={userType} />
        )}
      </TabsContent>
    </Tabs>
  );
}

export default ActiveUsersSection;