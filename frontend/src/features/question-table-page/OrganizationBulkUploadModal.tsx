import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog";
import { Button } from "@/components/atoms/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  FileSpreadsheet,
  Loader2,
  MinusCircle,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useBulkCreateOrganizations } from "@/hooks/api/organization/useBulkCreateOrganizations";
import { OrganizationService } from "@/hooks/services/organizationService";
import type { OrganizationBulkResult } from "@/types";

type OrgType = "central" | "state" | "district";
type FieldKey = "name" | "address" | "state" | "district";
type Step = "upload" | "preview" | "importing" | "report";
/** How complete a parsed row is, and the filter buckets built on top of it. */
type RowState = "ready" | "warning" | "duplicate" | "blocked";
type RowFilter = RowState | "all";

interface SheetRow {
  /** Position among the data rows, shown as the serial number in the preview. */
  serial: number;
  /** The row's real line number in the uploaded sheet, for error messages. */
  sheetRow: number;
  name: string;
  address: string;
  state: string;
  district: string;
}

interface ReportEntry {
  row: SheetRow;
  status: OrganizationBulkResult["status"];
  reason: string;
}

const TYPE_OPTIONS: { value: OrgType; label: string }[] = [
  { value: "central", label: "Central" },
  { value: "state", label: "State" },
  { value: "district", label: "District" },
];

/** Columns of the sheet, in display order. `name` and `state` back required
 *  schema fields; the rest are optional but worth having. */
const COLUMNS: { key: FieldKey; label: string; required: boolean }[] = [
  { key: "name", label: "Name", required: true },
  { key: "address", label: "Address", required: false },
  { key: "state", label: "State", required: true },
  { key: "district", label: "District", required: false },
];

/** Header spellings accepted for each column, lowercased. */
const HEADER_ALIASES: Record<FieldKey, string[]> = {
  name: ["name", "org name", "org_name", "organization name", "organisation name"],
  address: ["address", "location"],
  state: ["state"],
  district: ["district"],
};

const ACCEPTED_EXTENSIONS = [".xlsx", ".xls", ".csv"];
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 5000;

const STATUS_META: Record<
  OrganizationBulkResult["status"],
  { label: string; className: string; Icon: typeof CheckCircle2 }
> = {
  created: {
    label: "Created",
    className: "text-emerald-600 dark:text-emerald-400",
    Icon: CheckCircle2,
  },
  skipped: {
    label: "Skipped",
    className: "text-amber-600 dark:text-amber-400",
    Icon: MinusCircle,
  },
  failed: {
    label: "Failed",
    className: "text-rose-600 dark:text-rose-400",
    Icon: XCircle,
  },
};

/** Splits a CSV line, honouring double-quoted fields and escaped quotes. */
const splitCsvLine = (line: string): string[] => {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((c) => c.trim());
};

/** A physical row of the uploaded sheet, keeping its real row number so the
 *  report can point back at the exact line to fix. */
interface RawRow {
  rowNumber: number;
  cells: string[];
}

const parseCsv = (text: string): RawRow[] =>
  text
    .replace(/^﻿/, "")
    .split(/\r\n|\n|\r/)
    .map((line, i) => ({ rowNumber: i + 1, cells: splitCsvLine(line) }))
    .filter((row) => row.cells.some((cell) => cell.length > 0));

/** Flattens an ExcelJS cell value (rich text, formula result, hyperlink) to plain text. */
const cellToText = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (Array.isArray(v.richText)) {
      return (v.richText as { text: string }[]).map((r) => r.text).join("");
    }
    if ("text" in v) return String(v.text ?? "");
    if ("result" in v) return String(v.result ?? "");
    return "";
  }
  return String(value).trim();
};

const parseXlsx = async (file: File): Promise<RawRow[]> => {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const grid: RawRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    // ExcelJS row.values is 1-based, so drop the leading hole.
    const cells = (row.values as unknown[]).slice(1).map(cellToText);
    if (cells.some((cell) => cell.length > 0)) {
      grid.push({ rowNumber, cells });
    }
  });
  return grid;
};

/** Maps the sheet's header row onto our four known columns. Only the required
 *  columns must be present; an absent optional column leaves its cells blank. */
const resolveHeaderIndexes = (
  header: string[],
): { indexes: Record<FieldKey, number>; missing: string[] } => {
  const normalized = header.map((h) => h.toLowerCase().trim());
  const indexes = {} as Record<FieldKey, number>;
  const missing: string[] = [];

  COLUMNS.forEach(({ key, label, required }) => {
    const index = normalized.findIndex((h) => HEADER_ALIASES[key].includes(h));
    indexes[key] = index;
    if (index === -1 && required) missing.push(label);
  });

  return { indexes, missing };
};

/** Reads a cell, treating a column that is absent from the sheet as blank. */
const readCell = (cells: string[], index: number) =>
  index === -1 ? "" : (cells[index] ?? "").trim();

const isRowEmpty = (row: SheetRow) =>
  !row.name && !row.address && !row.state && !row.district;

const missingRequiredFields = (row: SheetRow) =>
  COLUMNS.filter((c) => c.required && !row[c.key]).map((c) => c.label);

/** Identifies an organization the way the database does: name and state within a
 *  single type, case-insensitively. */
const duplicateKeyOf = (name: string, state: string) =>
  `${name.trim().toLowerCase()}|${state.trim().toLowerCase()}`;

/** A row is blocked when a required field is empty, a duplicate when the database
 *  already holds that name and state, a warning when only optional fields are
 *  empty, and ready when every column has a value. */
const rowStateOf = (row: SheetRow, duplicateKeys: Set<string>): RowState => {
  if (missingRequiredFields(row).length) return "blocked";
  if (duplicateKeys.has(duplicateKeyOf(row.name, row.state))) return "duplicate";
  return COLUMNS.some((c) => !c.required && !row[c.key]) ? "warning" : "ready";
};

/** Filter buckets deliberately overlap: a warning row is still importable, so it
 *  counts as ready as well. Blocked and duplicate rows are left out. */
const matchesFilter = (state: RowState, filter: RowFilter) => {
  if (filter === "all") return true;
  if (filter === "ready") return state === "ready" || state === "warning";
  return state === filter;
};

const FILTER_OPTIONS: { value: RowFilter; label: string; activeClassName: string }[] = [
  {
    value: "all",
    label: "All",
    activeClassName:
      "border-gray-300 bg-gray-100 text-gray-800 dark:border-gray-600 dark:bg-white/10 dark:text-gray-100",
  },
  {
    value: "ready",
    label: "Ready to import",
    activeClassName:
      "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-400",
  },
  {
    value: "warning",
    label: "Warning",
    activeClassName:
      "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-400",
  },
  {
    value: "duplicate",
    label: "Duplicate",
    activeClassName:
      "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-400",
  },
  {
    value: "blocked",
    label: "Missing",
    activeClassName:
      "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-400",
  },
];

/** Writes rows to an .xlsx using the import's own column headers and downloads it,
 *  so anything exported here can be corrected and uploaded straight back. */
const downloadSheet = async (
  fileName: string,
  rows: Pick<SheetRow, "name" | "address" | "state" | "district">[],
) => {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Organizations");

  sheet.columns = [
    { header: "Name", key: "name", width: 36 },
    { header: "Address", key: "address", width: 44 },
    { header: "State", key: "state", width: 22 },
    { header: "District", key: "district", width: 22 },
  ];
  sheet.getRow(1).font = { bold: true };
  rows.forEach((row) => sheet.addRow(row));

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};

const downloadTemplate = () =>
  downloadSheet("organization_upload_template.xlsx", [
    {
      name: "Krishi Vigyan Kendra, Wayanad",
      address: "Ambalavayal, Wayanad",
      state: "Kerala",
      district: "Wayanad",
    },
  ]);

/** Reveals list items a few at a time so long previews and reports stream in
 *  instead of appearing as one block. */
const useStreamedReveal = (total: number, active: boolean) => {
  const [revealed, setRevealed] = useState(0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      setRevealed(0);
      return;
    }
    setRevealed(0);
    const step = Math.max(1, Math.ceil(total / 60));
    let current = 0;

    const tick = () => {
      current = Math.min(total, current + step);
      setRevealed(current);
      if (current < total) frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [total, active]);

  return revealed;
};

export const OrganizationBulkUploadModal = ({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) => {
  const [orgType, setOrgType] = useState<OrgType | "">("");
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [report, setReport] = useState<ReportEntry[]>([]);
  const [rowFilter, setRowFilter] = useState<RowFilter>("all");
  const [duplicateKeys, setDuplicateKeys] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { mutateAsync: bulkCreateOrganizations } = useBulkCreateOrganizations();

  const resetToUpload = useCallback(() => {
    setStep("upload");
    setRows([]);
    setFileName("");
    setReport([]);
    setRowFilter("all");
    setDuplicateKeys(new Set());
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  useEffect(() => {
    if (!open) {
      setOrgType("");
      resetToUpload();
    }
  }, [open, resetToUpload]);

  const rowStates = useMemo(
    () => new Map(rows.map((row) => [row.serial, rowStateOf(row, duplicateKeys)])),
    [rows, duplicateKeys],
  );
  const blockedRows = useMemo(
    () => rows.filter((r) => rowStates.get(r.serial) === "blocked"),
    [rows, rowStates],
  );
  const duplicateRows = useMemo(
    () => rows.filter((r) => rowStates.get(r.serial) === "duplicate"),
    [rows, rowStates],
  );
  const readyRows = useMemo(
    () =>
      rows.filter((r) => {
        const state = rowStates.get(r.serial);
        return state === "ready" || state === "warning";
      }),
    [rows, rowStates],
  );
  const filterCounts = useMemo(
    () => ({
      all: rows.length,
      ready: readyRows.length,
      warning: rows.filter((r) => rowStates.get(r.serial) === "warning").length,
      duplicate: duplicateRows.length,
      blocked: blockedRows.length,
    }),
    [rows, rowStates, readyRows, duplicateRows, blockedRows],
  );
  const visibleRows = useMemo(
    () =>
      rows.filter((r) =>
        matchesFilter(rowStates.get(r.serial) ?? "ready", rowFilter),
      ),
    [rows, rowStates, rowFilter],
  );

  const revealedPreview = useStreamedReveal(
    visibleRows.length,
    step === "preview",
  );
  const revealedReport = useStreamedReveal(report.length, step === "report");

  const handleFile = async (file: File) => {
    const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(extension)) {
      toast.error("Upload an .xlsx, .xls or .csv file");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error("File is larger than 5 MB");
      return;
    }

    setIsParsing(true);
    try {
      const grid =
        extension === ".csv" ? parseCsv(await file.text()) : await parseXlsx(file);

      if (grid.length < 2) {
        toast.error("The sheet needs a header row and at least one data row");
        return;
      }

      const { indexes, missing } = resolveHeaderIndexes(grid[0].cells);
      if (missing.length) {
        toast.error(
          `Missing required column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`,
        );
        return;
      }

      const parsed = grid
        .slice(1)
        .map(({ rowNumber, cells }) => ({
          serial: 0,
          sheetRow: rowNumber,
          name: readCell(cells, indexes.name),
          address: readCell(cells, indexes.address),
          state: readCell(cells, indexes.state),
          district: readCell(cells, indexes.district),
        }))
        .filter((row) => !isRowEmpty(row))
        .map((row, i) => ({ ...row, serial: i + 1 }));

      if (!parsed.length) {
        toast.error("No data rows found in the sheet");
        return;
      }
      if (parsed.length > MAX_ROWS) {
        toast.error(`A single import is limited to ${MAX_ROWS} rows`);
        return;
      }

      setRows(parsed);
      setRowFilter("all");
      setFileName(file.name);
      setDuplicateKeys(await fetchDuplicateKeys(parsed));
      setStep("preview");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not read that file",
      );
    } finally {
      setIsParsing(false);
    }
  };

  // Asks the directory which of these name/state pairs it already holds, so the
  // preview can flag them before anything is written.
  const fetchDuplicateKeys = async (parsed: SheetRow[]): Promise<Set<string>> => {
    if (!orgType) return new Set();
    const names = parsed
      .filter((row) => !missingRequiredFields(row).length)
      .map((row) => row.name);
    if (!names.length) return new Set();

    try {
      const response = await new OrganizationService().findBulkDuplicates(
        orgType,
        names,
      );
      return new Set(
        (response?.organizations ?? []).map((org) =>
          duplicateKeyOf(org.org_name ?? "", org.state ?? ""),
        ),
      );
    } catch {
      toast.warning(
        "Could not check for existing organizations — duplicates will be caught on import",
      );
      return new Set();
    }
  };

  const handleImport = async () => {
    if (!orgType || !readyRows.length) return;
    setStep("importing");

    try {
      const response = await bulkCreateOrganizations({
        type: orgType,
        rows: readyRows.map((r) => ({
          org_name: r.name,
          state: r.state,
          district: r.district,
          address: r.address,
        })),
      });

      const serverEntries: ReportEntry[] = (response?.results ?? []).map(
        (result, i) => ({
          row: readyRows[i],
          status: result.status,
          reason: result.reason,
        }),
      );
      const blockedEntries: ReportEntry[] = blockedRows.map((row) => ({
        row,
        status: "failed" as const,
        reason: `Missing required field: ${missingRequiredFields(row).join(", ")}`,
      }));
      const duplicateEntries: ReportEntry[] = duplicateRows.map((row) => ({
        row,
        status: "skipped" as const,
        reason: "An organization with this name, type and state already exists",
      }));

      setReport(
        [...serverEntries, ...blockedEntries, ...duplicateEntries].sort(
          (a, b) => a.row.serial - b.row.serial,
        ),
      );
      setStep("report");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Import failed",
      );
      setStep("preview");
    }
  };

  // Exports whatever the active filter is showing, so a user can pull out just the
  // blocked or incomplete rows, fix them, and upload the corrected sheet.
  const downloadVisibleRows = () =>
    downloadSheet(
      `organizations_${rowFilter}.xlsx`,
      visibleRows.map(({ name, address, state, district }) => ({
        name,
        address,
        state,
        district,
      })),
    );

  const failedEntries = useMemo(
    () => report.filter((entry) => entry.status === "failed"),
    [report],
  );
  const skippedEntries = useMemo(
    () => report.filter((entry) => entry.status === "skipped"),
    [report],
  );
  const unimportedCount = failedEntries.length + skippedEntries.length;

  // Copies rows as TSV so they paste straight into a spreadsheet for fixing.
  const copyEntries = async (entries: ReportEntry[], label: string) => {
    const header = [
      "Sheet Row",
      "Name",
      "Address",
      "State",
      "District",
      "Reason",
    ].join("\t");
    const body = entries
      .map((e) =>
        [
          e.row.sheetRow,
          e.row.name,
          e.row.address,
          e.row.state,
          e.row.district,
          e.reason,
        ].join("\t"),
      )
      .join("\n");
    try {
      await navigator.clipboard.writeText(`${header}\n${body}`);
      toast.success(`Copied ${entries.length} ${label} rows — paste into a sheet`);
    } catch {
      toast.error("Could not access the clipboard");
    }
  };

  const reportCounts = useMemo(
    () =>
      report.reduce<Record<string, number>>((acc, entry) => {
        acc[entry.status] = (acc[entry.status] ?? 0) + 1;
        return acc;
      }, {}),
    [report],
  );

  const cellClassName = (row: SheetRow, column: (typeof COLUMNS)[number]) => {
    if (row[column.key]) return "text-gray-700 dark:text-gray-300";
    return column.required
      ? "bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 font-medium"
      : "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400";
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[860px] max-w-[95vw] max-h-[88vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            Import Organizations
          </DialogTitle>
          <DialogDescription className="text-xs">
            Upload a sheet of organizations. The list type you pick is applied to
            every row in the file.
          </DialogDescription>
        </DialogHeader>

        {/* ── Step 1: list type + file ───────────────────────────────────── */}
        {step === "upload" && (
          <div className="flex flex-col gap-4 py-1">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="org-bulk-type"
                className="text-xs font-medium text-gray-700 dark:text-gray-300"
              >
                List type <span className="text-rose-500">*</span>
              </label>
              <Select
                value={orgType || undefined}
                onValueChange={(v: OrgType) => setOrgType(v)}
              >
                <SelectTrigger
                  id="org-bulk-type"
                  className="h-9 text-xs bg-white dark:bg-[#1a1a1a] sm:max-w-[260px]"
                >
                  <SelectValue placeholder="Select the type of this list" />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      className="text-xs"
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {orgType && (
                <p className="text-[11px] text-amber-700 dark:text-amber-400 flex items-start gap-1.5 animate-in fade-in duration-200">
                  <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" aria-hidden />
                  Every organization in the file you upload next will be saved as{" "}
                  <strong className="font-semibold capitalize">{orgType}</strong>.
                  Upload one file per type.
                </p>
              )}
            </div>

            {orgType && (
              <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Upload a spreadsheet of organizations"
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) void handleFile(file);
                  }}
                  className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                    isDragging
                      ? "border-emerald-500 bg-emerald-50/60 dark:bg-emerald-500/10"
                      : "border-gray-200 dark:border-gray-700 hover:border-emerald-400 hover:bg-gray-50/60 dark:hover:bg-white/[0.02]"
                  }`}
                >
                  {isParsing ? (
                    <Loader2 className="h-6 w-6 animate-spin text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Upload className="h-6 w-6 text-gray-400" />
                  )}
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                    {isParsing
                      ? "Reading your file and checking for duplicates..."
                      : "Drop your file here, or click to browse"}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    .xlsx, .xls or .csv with the columns Name, Address, State, District
                  </p>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleFile(file);
                  }}
                />

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void downloadTemplate()}
                  className="h-8 w-fit text-xs"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download sample template
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: preview with per-cell validation ────────────────────── */}
        {(step === "preview" || step === "importing") && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2 min-w-0">
                <FileSpreadsheet className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                <span className="text-xs text-gray-700 dark:text-gray-300 truncate">
                  {fileName}
                </span>
                <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                  {orgType}
                </span>
              </div>
              <div className="flex items-center gap-1.5" role="group" aria-label="Filter rows">
                {FILTER_OPTIONS.map((option) => {
                  const isActive = rowFilter === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => setRowFilter(option.value)}
                      className={`h-6 px-2 rounded-full border text-[11px] transition-colors ${
                        isActive
                          ? option.activeClassName
                          : "border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.04]"
                      }`}
                    >
                      {option.label} ({filterCounts[option.value]})
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 py-2 text-[11px] text-gray-500 dark:text-gray-400">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-rose-400" aria-hidden />
                Required field missing — row will not be imported
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-amber-400" aria-hidden />
                Optional field missing — row still imports
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-indigo-400" aria-hidden />
                Already in the directory — row will be skipped
              </span>
            </div>

            <div className="flex-1 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700/60">
              <div className="grid grid-cols-[48px_2fr_2fr_1.2fr_1.2fr] sticky top-0 bg-gray-50 dark:bg-[#161616] border-b border-gray-200 dark:border-gray-700/60 z-10">
                <div className="px-3 py-2 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  #
                </div>
                {COLUMNS.map((column) => (
                  <div
                    key={column.key}
                    className="px-3 py-2 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    {column.label}
                    {column.required && <span className="text-rose-500"> *</span>}
                  </div>
                ))}
              </div>

              {visibleRows.slice(0, revealedPreview).map((row) => {
                const isDuplicate = rowStates.get(row.serial) === "duplicate";
                return (
                <div
                  key={row.serial}
                  className={`grid grid-cols-[48px_2fr_2fr_1.2fr_1.2fr] border-b border-gray-100 dark:border-gray-800/60 last:border-b-0 animate-in fade-in duration-200 ${
                    isDuplicate ? "bg-indigo-50/50 dark:bg-indigo-500/[0.07]" : ""
                  }`}
                >
                  <div
                    className="px-3 py-2 text-xs text-gray-400"
                    title={`Sheet row ${row.sheetRow}`}
                  >
                    {row.serial}
                  </div>
                  {COLUMNS.map((column) => (
                    <div
                      key={column.key}
                      title={
                        row[column.key] ||
                        (column.required
                          ? `${column.label} is required`
                          : `${column.label} is missing`)
                      }
                      className={`px-3 py-2 text-xs flex items-center gap-1.5 min-w-0 ${cellClassName(row, column)}`}
                    >
                      <span className="truncate">
                        {row[column.key] || (column.required ? "Required" : "Missing")}
                      </span>
                      {isDuplicate && column.key === "name" && (
                        <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                          Duplicate
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                );
              })}

              {visibleRows.length === 0 && (
                <div className="py-10 text-center text-xs text-gray-500 dark:text-gray-400">
                  No rows in this group.
                </div>
              )}
            </div>

            {step === "importing" ? (
              <div className="pt-3 flex flex-col gap-2">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                  <div className="h-full w-1/3 rounded-full bg-emerald-500 animate-indeterminate-bar" />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Importing {readyRows.length} organizations...
                </p>
              </div>
            ) : (
              <div className="flex justify-end gap-2 pt-3">
                {rowFilter !== "all" && visibleRows.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void downloadVisibleRows()}
                    className="h-8 text-xs mr-auto"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download these {visibleRows.length} rows
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetToUpload}
                  className="h-8 text-xs"
                >
                  Choose another file
                </Button>
                <Button
                  size="sm"
                  disabled={readyRows.length === 0}
                  onClick={() => void handleImport()}
                  className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  Import {readyRows.length} organization
                  {readyRows.length === 1 ? "" : "s"}
                </Button>
              </div>
            )}
          </>
        )}

        {/* ── Step 3: report ─────────────────────────────────────────────── */}
        {step === "report" && (
          <>
            <div className="flex flex-wrap gap-4 pb-3 border-b border-gray-100 dark:border-gray-800">
              {(["created", "skipped", "failed"] as const).map((status) => {
                const meta = STATUS_META[status];
                return (
                  <div key={status} className="flex items-center gap-1.5 text-sm">
                    <meta.Icon className={`h-4 w-4 ${meta.className}`} />
                    <span className="font-semibold text-gray-800 dark:text-gray-200">
                      {reportCounts[status] ?? 0}
                    </span>
                    <span className="text-gray-500 dark:text-gray-400">
                      {meta.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {unimportedCount > 0 && (
              <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-3 py-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  {unimportedCount} row{unimportedCount === 1 ? "" : "s"} did not reach
                  the database. Copy them, fix the reason listed, and upload again.
                </p>
              </div>
            )}

            <div className="mt-3 flex-1 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700/60">
              <div className="grid grid-cols-[48px_1.6fr_1fr_100px_1.6fr] sticky top-0 bg-gray-50 dark:bg-[#161616] border-b border-gray-200 dark:border-gray-700/60 z-10">
                {["#", "Name", "State", "Status", "Reason"].map((heading) => (
                  <div
                    key={heading}
                    className="px-3 py-2 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    {heading}
                  </div>
                ))}
              </div>
              {report.slice(0, revealedReport).map((entry) => {
                const meta = STATUS_META[entry.status];
                return (
                  <div
                    key={entry.row.serial}
                    className="grid grid-cols-[48px_1.6fr_1fr_100px_1.6fr] items-center border-b border-gray-100 dark:border-gray-800/60 last:border-b-0 animate-in fade-in duration-200"
                  >
                    <div
                      className="px-3 py-2 text-xs text-gray-400"
                      title={`Sheet row ${entry.row.sheetRow}`}
                    >
                      {entry.row.serial}
                    </div>
                    <div
                      className="px-3 py-2 text-xs text-gray-800 dark:text-gray-200 truncate"
                      title={entry.row.name}
                    >
                      {entry.row.name || "—"}
                    </div>
                    <div
                      className="px-3 py-2 text-xs text-gray-600 dark:text-gray-400 truncate"
                      title={entry.row.state}
                    >
                      {entry.row.state || "—"}
                    </div>
                    <div className={`px-3 py-2 flex items-center gap-1.5 text-xs ${meta.className}`}>
                      <meta.Icon className="h-3.5 w-3.5 shrink-0" />
                      {meta.label}
                    </div>
                    <div
                      className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 truncate"
                      title={entry.reason}
                    >
                      {entry.reason || "—"}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-2 pt-3">
              {failedEntries.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void copyEntries(failedEntries, "failed")}
                  className="h-8 text-xs mr-auto"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy failed ({failedEntries.length})
                </Button>
              )}
              {skippedEntries.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void copyEntries(skippedEntries, "skipped")}
                  className={`h-8 text-xs ${failedEntries.length ? "" : "mr-auto"}`}
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy skipped ({skippedEntries.length})
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={resetToUpload}
                className="h-8 text-xs"
              >
                Import another file
              </Button>
              <Button
                size="sm"
                onClick={onClose}
                className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <X className="h-3.5 w-3.5" />
                Done
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
