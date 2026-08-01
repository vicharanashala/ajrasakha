/* ============================================================
   STATE LIST - Clickable list of states
============================================================ */

import { MapPin, Users, FileQuestionIcon } from "lucide-react";
import type { Analytics, GeoFeature } from "../lib/types";
import { fmt } from "../lib/formatters";
import { Skeleton } from "@/components/atoms/skeleton";
import { ScrollArea } from "@/components/atoms/scroll-area";
interface StateListProps {
  statesWithData: {
    features: Array<{
      type: string;
      properties: Record<string, unknown>;
      geometry?: unknown;
    }>;
  } | null;
  onSelectState: (name: string, feature: GeoFeature) => void;
  isLoading: boolean
  renderCardValue: (value: string | number)=> string | number;
  metric: "questions" | "users" | "activeUsers"
  questionStatusRange?: any
}

export function StateList({ statesWithData, onSelectState, isLoading, renderCardValue, metric = "questions", questionStatusRange}: StateListProps) {
  const getMetricValue = (
  analytics: {
    questions: number;
    users: number;
    activeUsers: number;
  },
) => {
  switch (metric) {
    case "users":
      return analytics.users;

    case "activeUsers":
      return analytics.activeUsers;

    default:
      return analytics.questions;
  }
};

  if (!statesWithData) return null;

  // const sortedStates = [...statesWithData.features].sort(
  //   (a, b) =>
  //     (b.properties._analytics as { questions: number }).questions -
  //     (a.properties._analytics as { questions: number }).questions,
  // );

  const sortedStates = [...statesWithData.features].sort(
  (a, b) => {
    const aAnalytics = a.properties._analytics as Analytics;
    const bAnalytics = b.properties._analytics as Analytics;

    return (
      getMetricValue(bAnalytics) -
      getMetricValue(aAnalytics)
    );
  },
);

  return (
    <div>
      <h3>
  {metric === "users"
    ? "Top States By Users"
    : metric === "activeUsers"
    ? "Top States By Active Users"
    : "Top States By Questions"}
</h3>
{isLoading ? (
  <Skeleton className="h-[245px] w-full" />
) : (
  <ScrollArea className="h-[245px]">
    <ul className="space-y-1 pr-3">
      {sortedStates.map((f) => (
        <li key={f.properties._name as string}>
          <button
            onClick={() =>
              onSelectState(
                f.properties._name as string,
                f as unknown as GeoFeature,
              )
            }
            className="flex w-full items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-accent"
          >
            <span className="flex items-center gap-2 text-foreground">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
              {renderCardValue(f.properties._name as string)}
            </span>

            <div className="grid grid-cols-[56px_48px] gap-3 text-xs text-muted-foreground">
              <div className="flex items-center justify-end gap-1">
                <FileQuestionIcon className="h-3.5 w-3.5 shrink-0" />
                <span className="tabular-nums">
                  {fmt((f.properties._analytics as Analytics).questions)}
                </span>
              </div>

              <div className="flex items-center justify-end gap-1">
                <Users className="h-3.5 w-3.5 shrink-0" />
                <span className="tabular-nums">
                  {questionStatusRange !== undefined ? fmt((f.properties._analytics as Analytics).activeUsers):fmt((f.properties._analytics as Analytics).users)}
                </span>
              </div>
            </div>
          </button>
        </li>
      ))}
    </ul>
  </ScrollArea>
)}
    </div>
  );
}