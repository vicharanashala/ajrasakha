import { useEffect, useState } from "react";
import { Badge } from "@/components/atoms/badge";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import { MultiSelect } from "@/components/atoms/MultiSelect";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/atoms/table";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useGdbFilterOptions, useGdbList } from "@/hooks/api/gdbCleaning/useGdbCleaning";
import type { GdbStatus } from "../types";
import { CHECK_NAMES, humanize } from "../utils";

const STATUS_LABELS: Record<GdbStatus, string> = {
  pending: "Not checked",
  clean: "No flags",
  todo: "To do",
  fixed: "Fixed",
  dismissed: "Dismissed",
};

export const STATUS_CLASSES: Record<GdbStatus, string> = {
  pending: "bg-muted text-muted-foreground border-border",
  clean: "bg-muted text-muted-foreground border-border",
  todo: "bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
  fixed: "bg-green-100 text-green-700 border-green-700 dark:bg-green-900/30 dark:text-green-300",
  dismissed: "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-300",
};

export const StatusBadge = ({ status }: { status: GdbStatus }) => (
  <Badge className={`${STATUS_CLASSES[status]} rounded-full`}>
    {STATUS_LABELS[status]}
  </Badge>
);

interface GdbListViewProps {
  onOpen: (id: string) => void;
}

export const GdbListView = ({ onOpen }: GdbListViewProps) => {
  const [search, setSearch] = useState("");
  const [typed, setTyped] = useState("");
  const [state, setState] = useState<string[]>([]);
  const [crop, setCrop] = useState<string[]>([]);
  const [flag, setFlag] = useState<string[]>([]);
  const [status, setStatus] = useState<string[]>([]);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

  // wait for a pause in typing before asking the server
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(typed.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [typed]);

  const { data: options } = useGdbFilterOptions();
  const { data, isLoading, error } = useGdbList({
    search: search || undefined,
    states: state,
    crops: crop,
    flags: flag,
    statuses: status as GdbStatus[],
    page,
    limit: pageSize,
  });

  const rows = data?.items ?? [];
  const total = data?.totalCount ?? 0;
  const pageCount = data?.totalPages ?? 1;
  const current = Math.min(page, pageCount);

  // any filter change goes back to the first page
  const onFilter = (apply: () => void) => {
    apply();
    setPage(1);
  };

  const filterSelect = (
    selected: string[],
    set: (v: string[]) => void,
    label: string,
    options: string[],
    format: (v: string) => string = (v) => v
  ) => (
    <div className="w-[190px]">
      <MultiSelect
        items={options.map((option) => ({ value: option, label: format(option) }))}
        selected={selected}
        onChange={(next) => onFilter(() => set(next))}
        placeholder={`All ${label.toLowerCase()}`}
        searchable={options.length > 8}
        getDisplayLabel={(picked) =>
          picked.length === 0
            ? `All ${label.toLowerCase()}`
            : picked.length === 1
            ? format(picked[0])
            : `${picked.length} ${label.toLowerCase()} selected`
        }
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Search question or ID"
            className="pl-9"
          />
        </div>
        {filterSelect(state, setState, "States", options?.states ?? [])}
        {filterSelect(crop, setCrop, "Crops", options?.crops ?? [])}
        {filterSelect(flag, setFlag, "Flags", CHECK_NAMES, humanize)}
        {filterSelect(status, setStatus, "Status", ["todo", "fixed", "dismissed", "clean", "pending"], (v) => STATUS_LABELS[v as GdbStatus])}
      </div>

      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[90px]">ID</TableHead>
              <TableHead>Question</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Crop</TableHead>
              <TableHead>Flags</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[90px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                  {isLoading
                    ? "Loading answers..."
                    : error
                    ? `Could not load the answers: ${(error as Error).message}`
                    : "No answers match these filters"}
                </TableCell>
              </TableRow>
            )}
            {rows.map((item) => {
              const names = item.flags;
              return (
                <TableRow
                  key={item.id}
                  className="cursor-pointer"
                  onClick={() => onOpen(item.id)}
                >
                  <TableCell className="text-xs text-muted-foreground" title={item.id}>
                    {item.id.slice(-8)}
                  </TableCell>
                  <TableCell className="max-w-[360px] truncate" title={item.question}>
                    {item.question}
                  </TableCell>
                  <TableCell>{item.state}</TableCell>
                  <TableCell>{item.crop}</TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-1">
                      {names.map((name) => (
                        <Badge
                          key={name}
                          className="bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300 rounded-full"
                        >
                          {humanize(name)}
                        </Badge>
                      ))}
                      {names.length === 0 && item.notEvaluated.length === 0 && (
                        <span className="text-xs text-muted-foreground">None</span>
                      )}
                      {item.notEvaluated.length > 0 && (
                        <span
                          className="text-xs text-amber-700 dark:text-amber-400"
                          title="Some checks could not run"
                        >
                          {item.notEvaluated.length} could not run
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={item.status} />
                  </TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" onClick={() => onOpen(item.id)}>
                      Review
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">
          {total === 0
            ? "0 answers"
            : `${(current - 1) * pageSize + 1}-${Math.min(current * pageSize, total)} of ${total.toLocaleString("en-IN")} answers`}
        </span>
        <div className="flex items-center gap-2">
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              setPageSize(Number(v));
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[110px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 25, 50].map((size) => (
                <SelectItem key={size} value={String(size)}>{`${size} / page`}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" disabled={current <= 1} onClick={() => setPage(current - 1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span>
            Page {current} of {pageCount}
          </span>
          <Button variant="outline" size="sm" disabled={current >= pageCount} onClick={() => setPage(current + 1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
