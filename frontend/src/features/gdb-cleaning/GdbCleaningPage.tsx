import { useState } from "react";
import { useGdbSummary, useRefillGdb } from "@/hooks/api/gdbCleaning/useGdbCleaning";
import { GdbDetailPage } from "./components/GdbDetailPage";
import { GdbListView } from "./components/GdbListView";
import { GdbDateRange } from "./components/GdbDateRange";
import { GdbHistoryView } from "./components/GdbHistoryView";
import { PRESETS, toQueryRange, type IDayRange } from "./dateRange";

export const GdbCleaningPage = () => {
  const [openId, setOpenId] = useState<string | null>(null);
  // "all" is the first tab, so looking at the page never assigns anything
  const [tab, setTab] = useState<"mine" | "all" | "history">("all");
  const refill = useRefillGdb();
  const [range, setRange] = useState<IDayRange>(PRESETS[3].range());
  const { data: summary } = useGdbSummary(toQueryRange(range));

  const cards: [string, number | undefined][] = [
    ["Total answers", summary?.total],
    ["Not checked", summary?.pending],
    ["To do", summary?.todo],
    ["Fixed", summary?.fixed],
    ["Dismissed", summary?.dismissed],
    ["Pushed to GDB", summary?.pushed],
    ["No flags", summary?.clean],
  ];

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-6 space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">GDB Cleaning</h1>
        <p className="text-sm text-muted-foreground">
          Answers flagged by the quality checks, with a suggested correction.
        </p>
      </div>

      {openId && <GdbDetailPage id={openId} onBack={() => setOpenId(null)} />}

      {!openId && (
        <div className="flex gap-2 text-sm">
          {([["mine", "My answers"], ["all", "All answers"], ["history", "History"]] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setTab(value);
                // opening My answers tops the reviewer up to 50 of their own
                if (value === "mine") refill.mutate();
              }}
              className={`rounded-md border px-3 py-1 ${
                tab === value ? "bg-primary text-primary-foreground" : "bg-background text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {!openId && tab === "history" && <GdbHistoryView onOpen={setOpenId} />}

      {/* stays mounted while an answer is open, so the filters and the page are still there on return */}
      <div className={openId || tab === "history" ? "hidden" : "space-y-5"}>
        <div className="space-y-1">
          <GdbDateRange value={range} onChange={setRange} />
          <p className="text-xs text-muted-foreground">
            Fixed, Dismissed and Pushed follow these dates. The other cards show how things are now.
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
          {cards.map(([label, value]) => (
            <div key={label} className="rounded-lg border bg-background p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-2xl font-semibold text-foreground">
                {value === undefined ? "-" : value.toLocaleString("en-IN")}
              </p>
            </div>
          ))}
        </div>
        <GdbListView key={tab} assignee={tab === "mine" ? "me" : undefined} onOpen={setOpenId} />
      </div>
    </div>
  );
};
