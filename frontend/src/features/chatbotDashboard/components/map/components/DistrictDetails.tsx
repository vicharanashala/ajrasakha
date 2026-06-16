/* ============================================================
   DISTRICT DETAILS - Blocks, villages, and KVK display
============================================================ */

import { Building2, Sprout, MapPin } from "lucide-react";
import type { DistrictDetails as DistrictDetailsType } from "../lib/types";
import { fmt } from "../lib/formatters";
import {
  BLOCKS,
  VILLAGES,
  KVKS,
} from "@/features/chatbotDashboard/utils/metaData";
import { useState, useEffect } from "react";
interface DistrictDetailsProps {
  details?: DistrictDetailsType | null;
  selectedDistrict?: string | null;
}

export function DistrictDetails({
  details,
  selectedDistrict,
}: DistrictDetailsProps) {
  const blocksDetails = BLOCKS[selectedDistrict];
  const villagesDetails = VILLAGES[selectedDistrict];
  const kvksDetails = KVKS[selectedDistrict];
  // console.log("Selected District", selectedDistrict);
  const VILLAGES_PER_PAGE = 10;

  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(villagesDetails.length / VILLAGES_PER_PAGE);

  const paginatedVillages = villagesDetails.slice(
    (currentPage - 1) * VILLAGES_PER_PAGE,
    currentPage * VILLAGES_PER_PAGE,
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedDistrict]);

  if (!selectedDistrict) return null;

  return (
    <div className="space-y-4">
      {/* Blocks */}
      <div>
        <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Building2 className="h-3.5 w-3.5" /> Blocks ({blocksDetails.length})
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {blocksDetails.map((b) => (
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
          <Sprout className="h-3.5 w-3.5" /> Villages ({villagesDetails.length})
        </h3>
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {paginatedVillages.map((v) => (
            <li
              key={v}
              className="flex items-center justify-between gap-2 bg-background px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <div className="truncate font-medium text-foreground">{v}</div>
                {/* <div className="truncate text-[11px] text-muted-foreground">
                  {v.block}
                </div> */}
              </div>
              {/* <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {fmt(v.analytics.users)} users
              </span> */}
            </li>
          ))}
        </ul>
        {totalPages > 1 && (
          <div className="mt-3 flex items-center justify-between">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="rounded border px-3 py-1 text-xs disabled:opacity-50"
            >
              Previous
            </button>

            <span className="text-xs text-muted-foreground">
              Page {currentPage} of {totalPages}
            </span>

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="rounded border px-3 py-1 text-xs disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* KVK */}
      <div>
        <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" /> Krishi Vigyan Kendra (KVK)
        </h3>
        <div className="rounded-lg border border-primary/40 bg-primary/5 px-3 py-3 text-sm">
          <div className="font-medium text-foreground">{kvksDetails[0]}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            Primary extension center for {selectedDistrict}
          </div>
        </div>
      </div>
    </div>
  );
}
