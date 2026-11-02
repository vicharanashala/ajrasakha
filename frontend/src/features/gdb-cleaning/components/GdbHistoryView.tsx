import { useState } from "react";
import { Button } from "@/components/atoms/button";
import { useGdbHistory } from "@/hooks/api/gdbCleaning/useGdbCleaning";
import { ACTION_LABELS } from "../types";
import { PRESETS, toQueryRange, type IDayRange } from "../dateRange";
import { GdbDateRange } from "./GdbDateRange";

const LIMIT = 20;

// what the reviewer added to the action, in a few words
const detailText = (details: Record<string, unknown> | null) => {
  if (!details) return "";
  const parts: string[] = [];
  if (details.parameter) parts.push(`${String(details.parameter).replace(/_/g, " ")} set to ${String(details.result)}`);
  if (typeof details.count === "number") parts.push(`${details.count} source(s)`);
  if (details.comment) parts.push(String(details.comment));
  return parts.join(" - ");
};

export const GdbHistoryView = ({ onOpen }: { onOpen: (id: string) => void }) => {
  const [range, setRange] = useState<IDayRange>(PRESETS[0].range());
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useGdbHistory({ ...toQueryRange(range), scope, page, limit: LIMIT });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <GdbDateRange
          value={range}
          onChange={(next) => {
            setRange(next);
            setPage(1);
          }}
        />
        <div className="flex gap-2 text-sm">
          {(["mine", "all"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setScope(value);
                setPage(1);
              }}
              className={`rounded-md border px-3 py-1 ${
                scope === value ? "bg-primary text-primary-foreground" : "bg-background text-foreground"
              }`}
            >
              {value === "mine" ? "My actions" : "Everyone"}
            </button>
          ))}
        </div>
      </div>

      {data && (
        <p className="text-sm text-muted-foreground">
          {data.totalCount.toLocaleString("en-IN")} action(s) on {data.answersHandled.toLocaleString("en-IN")} answer(s)
        </p>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {isError && <p className="text-sm text-destructive">Could not load the history.</p>}

      {data && data.entries.length === 0 && (
        <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">Nothing in this period.</p>
      )}

      {data && data.entries.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-3">When</th>
                {scope === "all" && <th className="p-3">Who</th>}
                <th className="p-3">Action</th>
                <th className="p-3">Question</th>
                <th className="p-3">Details</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((entry, i) => (
                <tr key={`${entry.answerId}-${entry.at}-${i}`} className="border-t align-top">
                  <td className="whitespace-nowrap p-3">{new Date(entry.at).toLocaleString("en-IN")}</td>
                  {scope === "all" && <td className="p-3">{entry.userName ?? "-"}</td>}
                  <td className="whitespace-nowrap p-3">{ACTION_LABELS[entry.action] ?? entry.action}</td>
                  <td className="p-3">
                    <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => onOpen(entry.answerId)}>
                      {entry.question}
                    </button>
                  </td>
                  <td className="p-3 text-muted-foreground">{detailText(entry.details)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span>
            Page {data.page} of {data.totalPages}
          </span>
          <Button variant="outline" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
};
