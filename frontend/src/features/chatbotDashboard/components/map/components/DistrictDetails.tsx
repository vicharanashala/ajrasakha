/* ============================================================
   DISTRICT DETAILS - Blocks, villages, and KVK display
============================================================ */

import { Building2, MapPin, X } from "lucide-react";
import type { DistrictDetails as DistrictDetailsType } from "../lib/types";
// import { fmt } from "../lib/formatters";
import {
  // BLOCKS,
  // VILLAGES,
  KVKS,
} from "@/features/chatbotDashboard/utils/metaData";
import { useState, useEffect } from "react";
// import { useVillageUserCounts } from "../hooks/useMapAnalytics";
import {
  useGetBlocks,
  useGetVillages,
} from "@/hooks/api/location/useLocations";
import { createPortal } from "react-dom";
interface DistrictDetailsProps {
  details?: DistrictDetailsType | null;
  state: string;
  selectedDistrict?: string | null;
  source: string;
  userType: string;
  districtAnalytic?: any;
}

export function DistrictDetails({
  details,
  state,
  selectedDistrict,
  source,
  userType,
  districtAnalytic,
}: DistrictDetailsProps) {
  // const district = selectedDistrict;
  // const { data: villageUserCounts } = useVillageUserCounts({
  //   state,
  //   district,
  //   source,
  //   userType,
  // });
  const targetDistrict = districtAnalytic.find(
    (d) => d.district === selectedDistrict,
  );
  const { data } = useGetBlocks(targetDistrict.districtCode);
  const blocksDetails = data;

  const [selectedBlock, setSelectedBlock] = useState<{
    blockCode: number;
    blockNameEnglish: string;
  } | null>(null);

  // const villagesDetails = villageUserCounts
  //   ? villageUserCounts
  //   : (VILLAGES[selectedDistrict] ?? []);
  const kvksDetails = KVKS[selectedDistrict] ?? [];
  // const VILLAGES_PER_PAGE = 10;

  // const [currentPage, setCurrentPage] = useState(1);

  // const totalPages = Math.ceil(villagesDetails.length / VILLAGES_PER_PAGE);

  // const paginatedVillages = villagesDetails.slice(
  //   (currentPage - 1) * VILLAGES_PER_PAGE,
  //   currentPage * VILLAGES_PER_PAGE,
  // );

  // useEffect(() => {
  //   setCurrentPage(1);
  // }, [selectedDistrict]);

  if (!selectedDistrict) return null;

  return (
    <div className="space-y-4">
      {/* Blocks */}
      <div>
        <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Building2 className="h-3.5 w-3.5" /> Blocks ({blocksDetails?.length})
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {blocksDetails?.map((b) => (
            <span
              key={b.blockCode}
              onClick={() => setSelectedBlock(b)}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
            >
              {b.blockNameEnglish}
            </span>
          ))}
        </div>
      </div>

      {/* Villages */}
      {/* <div>
        <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Sprout className="h-3.5 w-3.5" /> Villages ({villagesDetails.length})
        </h3>
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {paginatedVillages.map((v) => (
            <li
              key={v}
              className="flex items-center justify-between gap-2 bg-background px-3 py-2 text-sm"
            >
              <div className="min-w-full">
                <div className="font-medium text-foreground flex justify-between">
                  <span>{villageUserCounts ? v?.village?.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim().toUpperCase(): v.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim().toUpperCase()}</span>
                  <span className="text-foreground-muted flex items-center gap-0.5"><User className="h-3"/>{v?.totalUsers ?? 0}</span>
                </div>
              </div>
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
      </div> */}

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
      {selectedBlock && (
        <BlockVillagesModal
          block={selectedBlock}
          state={state}
          district={selectedDistrict}
          source={source}
          userType={userType}
          onClose={() => setSelectedBlock(null)}
        />
      )}
    </div>
  );
}

interface BlockVillagesModalProps {
  block: {
    blockCode: number;
    blockNameEnglish: string;
  };

  state: string;
  district?: string | null;
  source: string;
  userType: string;

  onClose: () => void;
}

function BlockVillagesModal({
  block,
  state,
  district,
  source,
  userType,
  onClose,
}: BlockVillagesModalProps) {
  const VILLAGES_PER_PAGE = 10;

  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [block.blockCode]);
  const { data: villages } = useGetVillages(block.blockCode);
  const totalPages = Math.ceil(villages?.length / VILLAGES_PER_PAGE);

  const paginatedVillages = villages?.slice(
    (currentPage - 1) * VILLAGES_PER_PAGE,
    currentPage * VILLAGES_PER_PAGE,
  );
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">{block.blockNameEnglish}</h2>
            <p className="text-sm text-muted-foreground">
              {villages?.length} Villages
            </p>
          </div>

          <button onClick={onClose} className="rounded p-2 hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Village List */}
        <div className="overflow-y-auto p-4">
          {villages?.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No villages found.
            </div>
          ) : (
            <ul className="divide-y rounded-lg border">
              {paginatedVillages?.map((village) => (
                <li
                  key={village.villageCode}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-accent/40"
                >
                  <MapPin className="h-4 w-4 text-muted-foreground" />

                  <span className="text-sm font-medium">
                    {village.villageNameEnglish}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="rounded border px-3 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>

            <span className="text-sm text-muted-foreground">
              Page {currentPage} of {totalPages}
            </span>

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="rounded border px-3 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
