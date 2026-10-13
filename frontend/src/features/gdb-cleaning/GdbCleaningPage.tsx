import { useState } from "react";
import { useGdbSummary } from "@/hooks/api/gdbCleaning/useGdbCleaning";
import { GdbDetailPage } from "./components/GdbDetailPage";
import { GdbListView } from "./components/GdbListView";

export const GdbCleaningPage = () => {
  const [openId, setOpenId] = useState<string | null>(null);
  const { data: summary } = useGdbSummary();

  const cards: [string, number | undefined][] = [
    ["Total answers", summary?.total],
    ["Not checked", summary?.pending],
    ["To do", summary?.todo],
    ["Fixed", summary?.fixed],
    ["Dismissed", summary?.dismissed],
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

      {/* stays mounted while an answer is open, so the filters and the page are still there on return */}
      <div className={openId ? "hidden" : "space-y-5"}>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {cards.map(([label, value]) => (
            <div key={label} className="rounded-lg border bg-background p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-2xl font-semibold text-foreground">
                {value === undefined ? "-" : value.toLocaleString("en-IN")}
              </p>
            </div>
          ))}
        </div>
        <GdbListView onOpen={setOpenId} />
      </div>
    </div>
  );
};
