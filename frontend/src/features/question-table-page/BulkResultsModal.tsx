import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog";
import { Button } from "@/components/atoms/button";
import { Download, AlertTriangle, CheckCircle2, RefreshCw, MinusCircle, XCircle } from "lucide-react";
import type { IBulkJobResult } from "@/hooks/services/cropService";

const STATUS_META: Record<
  string,
  { label: string; className: string; Icon: typeof CheckCircle2 }
> = {
  created: { label: "Created", className: "text-emerald-600 dark:text-emerald-400", Icon: CheckCircle2 },
  updated: { label: "Updated", className: "text-blue-600 dark:text-blue-400", Icon: RefreshCw },
  skipped: { label: "Skipped", className: "text-amber-600 dark:text-amber-400", Icon: MinusCircle },
  failed: { label: "Failed", className: "text-rose-600 dark:text-rose-400", Icon: XCircle },
};

const csvEscape = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;

export const BulkResultsModal = ({
  open,
  onClose,
  results,
  type,
}: {
  open: boolean;
  onClose: () => void;
  results: IBulkJobResult[];
  type: "crop" | "chemical";
}) => {
  const counts = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  const downloadResults = () => {
    const label = type === "chemical" ? "Chemical" : "Crop";
    const rows = [
      `${label} Name,Status,Reason`,
      ...results.map(
        (r) =>
          `${csvEscape(r.name)},${csvEscape(STATUS_META[r.status]?.label ?? r.status)},${csvEscape(r.reason)}`,
      ),
    ].join("\n");
    const blob = new Blob(["﻿" + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${type}_bulk_upload_results.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[680px] max-w-[95vw] max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-lg flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            Bulk Upload Results
          </DialogTitle>
        </DialogHeader>

        {/* Summary counts */}
        <div className="flex flex-wrap gap-3 pb-3 border-b border-gray-100 dark:border-gray-800">
          {(["created", "updated", "skipped", "failed"] as const).map((s) => {
            const m = STATUS_META[s];
            return (
              <div key={s} className="flex items-center gap-1.5 text-sm">
                <m.Icon className={`h-4 w-4 ${m.className}`} />
                <span className="font-semibold text-gray-800 dark:text-gray-200">
                  {counts[s] ?? 0}
                </span>
                <span className="text-gray-500 dark:text-gray-400">{m.label}</span>
              </div>
            );
          })}
        </div>

        {/* One-time availability warning */}
        <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-3 py-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 dark:text-amber-300">
            If you want these results, download them now — they won't be available later.
          </p>
        </div>

        {/* Results table */}
        <div className="mt-3 flex-1 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700/60">
          <div className="grid grid-cols-[1fr_100px_1.4fr] bg-gray-50 dark:bg-white/[0.03] border-b border-gray-200 dark:border-gray-700/60 sticky top-0">
            {[type === "chemical" ? "Chemical Name" : "Crop Name", "Status", "Reason"].map((h) => (
              <div key={h} className="px-3 py-2 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {h}
              </div>
            ))}
          </div>
          {results.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">No entries processed.</div>
          ) : (
            results.map((r, i) => {
              const m = STATUS_META[r.status] ?? { label: r.status, className: "text-gray-500", Icon: MinusCircle };
              return (
                <div
                  key={`${r.name}-${i}`}
                  className={`grid grid-cols-[1fr_100px_1.4fr] items-center ${i < results.length - 1 ? "border-b border-gray-100 dark:border-gray-800/60" : ""}`}
                >
                  <div className="px-3 py-2 text-sm text-gray-800 dark:text-gray-200 truncate" title={r.name}>
                    {r.name}
                  </div>
                  <div className={`px-3 py-2 text-xs font-semibold flex items-center gap-1 ${m.className}`}>
                    <m.Icon className="h-3.5 w-3.5" />
                    {m.label}
                  </div>
                  <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 truncate" title={r.reason}>
                    {r.reason || "—"}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-3">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button
            size="sm"
            onClick={downloadResults}
            disabled={results.length === 0}
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Download className="h-3.5 w-3.5" />
            Download Results
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
