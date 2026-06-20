/* ============================================================
   DISTRICT LIST - Clickable list of districts
============================================================ */

import { ClipboardList, MapPin, User } from "lucide-react";
import type { GeoFeature } from "../lib/types";
import { fmt } from "../lib/formatters";

interface DistrictListProps {
  districtsOfState: {
    features: Array<{
      type: string;
      properties: Record<string, unknown>;
      geometry?: unknown;
    }>;
  } | null;
  selectedState: string;
  onSelectDistrict: (name: string, feature: GeoFeature) => void;
}

export function DistrictList({
  districtsOfState,
  selectedState,
  onSelectDistrict,
}: DistrictListProps) {
  if (!districtsOfState) return null;

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Districts in {selectedState}
      </h3>
      <ul className="space-y-1">
        {districtsOfState.features.map((f) => (
          <li key={f.properties._name as string}>
            <button
              onClick={() =>
                onSelectDistrict(f.properties._name as string, f as unknown as GeoFeature)
              }
              className="flex w-full items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-accent"
            >
              <span className="flex items-center gap-2 text-foreground">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                {f.properties._name as string}
              </span>
              <span className="flex items-center gap-3">
              <span className="flex items-center text-xs text-muted-foreground tabular-nums">
                <User className="h-3"/>{fmt((f.properties._analytics as {users: number}).users)}
              </span>
              <div>|</div>
              <span className="flex items-center text-xs text-muted-foreground tabular-nums">
                <ClipboardList className="h-3"/>
                {fmt((f.properties._analytics as { questions: number }).questions)}
              </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}