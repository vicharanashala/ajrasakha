/* ============================================================
   MAP LEGEND - Color scale legend for map visualization
============================================================ */

import { colorFor } from "../lib/colors";
import { fmt } from "../lib/formatters";

interface MapLegendProps {
  minV: number;
  maxV: number;
  dark: boolean;
}

export function MapLegend({ minV, maxV, dark }: MapLegendProps) {
  return (
    <div className="pointer-events-none absolute left-3 bottom-3 z-[400] rounded-xl border border-border bg-card/95 p-3 text-xs shadow backdrop-blur">
      <div className="mb-1 font-medium text-foreground">Questions asked</div>
      <div className="flex h-2 w-44 overflow-hidden rounded">
        {[0.1, 0.3, 0.5, 0.75, 1].map((t, i) => (
          <div
            key={i}
            className="flex-1"
            style={{
              background: colorFor(minV + (maxV - minV) * t, minV, maxV, dark),
            }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-muted-foreground">
        <span>{fmt(minV)}</span>
        <span>{fmt(maxV)}</span>
      </div>
    </div>
  );
}