/* ============================================================
   DISTRICT DETAILS - Blocks, villages, and KVK display
============================================================ */

import { Building2, Sprout, MapPin } from "lucide-react";
import type { DistrictDetails as DistrictDetailsType } from "../lib/types";
import { fmt } from "../lib/formatters";

interface DistrictDetailsProps {
  details: DistrictDetailsType | null;
  selectedDistrict: string | null;
}

export function DistrictDetails({ details, selectedDistrict }: DistrictDetailsProps) {
  if (!details || !selectedDistrict) return null;

  return (
    <div className="space-y-4">
      {/* Blocks */}
      <div>
        <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Building2 className="h-3.5 w-3.5" /> Blocks ({details.blocks.length})
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {details.blocks.map((b) => (
            <span
              key={b}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
            >
              {b}
            </span>
          ))}
        </div>
      </div>

      {/* Villages */}
      <div>
        <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Sprout className="h-3.5 w-3.5" /> Villages ({details.villages.length})
        </h3>
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {details.villages.map((v) => (
            <li
              key={v.id}
              className="flex items-center justify-between gap-2 bg-background px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <div className="truncate font-medium text-foreground">
                  {v.name}
                </div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {v.block}
                </div>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {fmt(v.analytics.users)} users
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* KVK */}
      <div>
        <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" /> Krishi Vigyan Kendra (KVK)
        </h3>
        <div className="rounded-lg border border-primary/40 bg-primary/5 px-3 py-3 text-sm">
          <div className="font-medium text-foreground">{details.kvk}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            Primary extension center for {selectedDistrict}
          </div>
        </div>
      </div>
    </div>
  );
}