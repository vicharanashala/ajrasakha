/* ============================================================
   STATE LIST - Clickable list of states
============================================================ */

import { MapPin } from "lucide-react";
import type { GeoFeature } from "../lib/types";
import { fmt } from "../lib/formatters";
import { Skeleton } from "@/components/atoms/skeleton";

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
}

export function StateList({ statesWithData, onSelectState, isLoading, renderCardValue,  }: StateListProps) {
  if (!statesWithData) return null;

  const sortedStates = [...statesWithData.features].sort(
    (a, b) =>
      (b.properties._analytics as { questions: number }).questions -
      (a.properties._analytics as { questions: number }).questions,
  );

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Top states by questions
      </h3>
      {isLoading ? <Skeleton className="w-full h-[540px]"/> : <ul className="space-y-1">
        {sortedStates.slice(0, 8).map((f) => (
          <li key={f.properties._name as string}>
            <button
              onClick={() => onSelectState(f.properties._name as string, f as unknown as GeoFeature)}
              className="flex w-full items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-accent"
            >
              <span className="flex items-center gap-2 text-foreground">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                {renderCardValue(f.properties._name as string)}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {renderCardValue(fmt((f.properties._analytics as { questions: number }).questions))}
              </span>
            </button>
          </li>
        ))}
      </ul>}
    </div>
  );
}