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
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  FileSpreadsheet,
  Info,
  Loader2,
  MinusCircle,
  RefreshCw,
  Search,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/atoms/tooltip";
import { useImportCropEntries } from "@/hooks/api/crop/useImportCropEntries";
import {
  CropService,
  type ICropAlias,
  type ICropImportEntry,
  type ICropImportResult,
} from "@/hooks/services/cropService";
import { Input } from "@/components/atoms/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select";
import {
  cellToText,
  parseCsv,
  useStreamedReveal,
  type RawRow,
  type RowState,
} from "./OrganizationBulkUploadModal";

type Step = "upload" | "preview" | "importing" | "report";
type FieldKey =
  | "name"
  | "scientificName"
  | "state"
  | "language"
  | "englishName"
  | "nativeName"
  | "sourceLink"
  | "pageNumber"
  | "agriExpert"
  | "remark";

interface SheetRow {
  /** Position among the data rows, shown as the serial number in the preview. */
  serial: number;
  /** The row's real line number in the uploaded sheet, for error messages. */
  sheetRow: number;
  name: string;
  scientificName: string;
  state: string;
  language: string;
  englishName: string;
  nativeName: string;
  sourceLink: string;
  pageNumber: string;
  agriExpert: string;
  remark: string;
  /** Sheet columns we do not recognise, keyed by their snake_case header. */
  extras: Record<string, string>;
}

interface ReportEntry {
  key: string;
  name: string;
  aliases: number;
  status: ICropImportResult["status"];
  reason: string;
  rows: SheetRow[];
}

/** Sheet columns in the order they appear in the template. `dbKey` is the field each
 *  column is stored under; `warnIfEmpty` marks optional columns that warn when blank. */
const COLUMNS: {
  key: FieldKey;
  label: string;
  header: string;
  required: boolean;
  warnIfEmpty: boolean;
  dbKey: string;
  aliases: string[];
}[] = [
  {
    key: "name",
    dbKey: "name",
    label: "Name",
    header: "Standardized Category Name",
    required: true,
    warnIfEmpty: true,
    aliases: ["standardized category name", "standardized name", "name", "crop name"],
  },
  {
    key: "scientificName",
    dbKey: "scientificName",
    label: "Scientific Name",
    header: "Scientific Name/Botanical Name",
    required: false,
    warnIfEmpty: true,
    aliases: ["scientific name/botanical name", "scientific name", "botanical name"],
  },
  {
    key: "state",
    dbKey: "region",
    label: "State",
    header: "State",
    required: false,
    warnIfEmpty: true,
    aliases: ["state", "region"],
  },
  {
    key: "language",
    dbKey: "language",
    label: "Language",
    header: "Language",
    required: false,
    warnIfEmpty: true,
    aliases: ["language"],
  },
  {
    key: "englishName",
    dbKey: "english_representation",
    label: "English Script Name",
    header: "Native Name in English Script",
    required: true,
    warnIfEmpty: true,
    aliases: ["native name in english script", "english name"],
  },
  {
    key: "nativeName",
    dbKey: "native_representation",
    label: "Native Script Name",
    header: "Native Name in Native Script",
    required: false,
    warnIfEmpty: true,
    aliases: ["native name in native script", "native name"],
  },
  {
    key: "sourceLink",
    dbKey: "source_link",
    label: "Source Link",
    header: "Source Link",
    required: false,
    warnIfEmpty: false,
    aliases: ["source link", "source_link"],
  },
  {
    key: "pageNumber",
    dbKey: "page_number",
    label: "Page No.",
    header: "Page No.",
    required: false,
    warnIfEmpty: false,
    aliases: ["page no.", "page no", "page number", "page_number"],
  },
  {
    key: "agriExpert",
    dbKey: "agri_expert",
    label: "Agri Expert",
    header: "Agri Expert",
    required: false,
    warnIfEmpty: false,
    aliases: ["agri expert", "agri_expert"],
  },
  {
    key: "remark",
    dbKey: "remark",
    label: "Remark",
    header: "Remark",
    required: false,
    warnIfEmpty: false,
    aliases: ["remark", "remarks"],
  },
];

/** Entry-level columns; every other column is stored on the vernacular term. */
const ENTRY_LEVEL_KEYS: FieldKey[] = ["name", "scientificName"];

/** Columns stored on each vernacular term (everything except the entry-level fields). */
const TERM_COLUMNS = COLUMNS.filter((c) => c.key !== "name" && c.key !== "scientificName");
/** Headers that are known but carry nothing to store (the type comes from the tab). */
const IGNORED_HEADERS = ["category"];
const SPECIAL_CHARACTERS = /[^A-Za-z ]/;

const ACCEPTED_EXTENSIONS = [".xlsx", ".xls", ".csv"];
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 5000;

const STATUS_META: Record<
  ICropImportResult["status"],
  { label: string; className: string; Icon: typeof CheckCircle2 }
> = {
  created: {
    label: "Created",
    className: "text-emerald-600 dark:text-emerald-400",
    Icon: CheckCircle2,
  },
  updated: {
    label: "Updated",
    className: "text-sky-600 dark:text-sky-400",
    Icon: RefreshCw,
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

const labelOf = (value: string) =>
  value ? value.charAt(0).toUpperCase() + value.slice(1) : "";

/** Lowercases and strips punctuation and a trailing "s", so the tab "practice"
 *  matches a sheet called "Practices". */
const normalizeSheetName = (value: string) =>
  value.toLowerCase().replace(/[^a-z]/g, "").replace(/s$/, "");

/** Reads the worksheet that matches the tab; a workbook with a single sheet is used as is. */
const parseXlsx = async (
  file: File,
  entryType: string,
): Promise<{ grid: RawRow[]; sheetName: string }> => {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());

  const sheet =
    workbook.worksheets.find(
      (ws) => normalizeSheetName(ws.name) === normalizeSheetName(entryType),
    ) ?? (workbook.worksheets.length === 1 ? workbook.worksheets[0] : undefined);

  if (!sheet) {
    const names = workbook.worksheets.map((ws) => ws.name).join(", ");
    throw new Error(
      `No sheet named "${labelOf(entryType)}" in this file. Sheets found: ${names}`,
    );
  }

  const grid: RawRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    // ExcelJS row.values is 1-based, so drop the leading hole.
    const cells = (row.values as unknown[]).slice(1).map(cellToText);
    if (cells.some((cell) => cell.length > 0)) grid.push({ rowNumber, cells });
  });
  return { grid, sheetName: sheet.name };
};

/** Turns a sheet header into its extra_fields key, e.g. "Crop Season" -> "crop_season". */
const toFieldKey = (header: string) =>
  header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(\d)/, "col_$1")
    .slice(0, 50);

/** Maps the header row onto our known columns, collecting the rest as extra columns. */
const resolveHeaders = (
  header: string[],
): {
  indexes: Record<FieldKey, number>;
  extras: { key: string; index: number }[];
  missing: string[];
} => {
  const normalized = header.map((h) => h.toLowerCase().trim());
  const indexes = {} as Record<FieldKey, number>;
  const claimed = new Set<number>();

  COLUMNS.forEach(({ key, aliases }) => {
    const index = normalized.findIndex((h) => aliases.includes(h));
    indexes[key] = index;
    if (index !== -1) claimed.add(index);
  });

  const usedKeys = new Set<string>();
  const extras = header
    .map((h, index) => ({ header: h.trim(), key: toFieldKey(h), index }))
    .filter(({ header: h, key, index }) => {
      if (!key || claimed.has(index) || IGNORED_HEADERS.includes(h.toLowerCase())) return false;
      if (usedKeys.has(key)) return false;
      usedKeys.add(key);
      return true;
    })
    .map(({ key, index }) => ({ key, index }));
  const missing = COLUMNS.filter((c) => c.required && indexes[c.key] === -1).map(
    (c) => c.header,
  );
  return { indexes, extras, missing };
};

/** Reads a cell, treating a column that is absent from the sheet as blank. */
const readCell = (cells: string[], index: number) =>
  index === -1 ? "" : (cells[index] ?? "").trim();

const isRowEmpty = (row: SheetRow) =>
  COLUMNS.every((c) => !row[c.key]) && !Object.keys(row.extras).length;

const missingRequiredFields = (row: SheetRow) =>
  COLUMNS.filter((c) => c.required && !row[c.key]).map((c) => c.label);

const nameKeyOf = (name: string) => name.trim().toLowerCase();

/** Identifies a vernacular term, so an exact repeat of it in the sheet can be spotted. */
const termKeyOf = (row: SheetRow) =>
  [row.name, row.language, row.state, row.englishName, row.nativeName]
    .map((v) => v.trim().toLowerCase())
    .join("|");

/** What importing a row will do to its entry's aliases. */
type AliasOutcome = "new" | "fill" | "none";

/** What a preview row will do; drives the status pill, the filters and the counts. */
type RowCategory = AliasOutcome | "skipped" | "blocked";
type PreviewFilter = RowCategory | "all" | "warning";
type DocumentScope = "all" | "new" | "existing";

const CATEGORY_META: Record<
  RowCategory,
  { label: string; description: string; pillClassName: string; dotClassName: string }
> = {
  new: {
    label: "New alias",
    description: "Added to the document as a new alias",
    pillClassName: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30",
    dotClassName: "bg-emerald-500",
  },
  fill: {
    label: "Fills details",
    description: "Matches a stored alias and fills its empty fields",
    pillClassName: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/30",
    dotClassName: "bg-sky-500",
  },
  none: {
    label: "No change",
    description: "Matches a stored alias with nothing new to add",
    pillClassName: "bg-gray-100 text-gray-600 ring-gray-200 dark:bg-white/5 dark:text-gray-300 dark:ring-white/10",
    dotClassName: "bg-gray-400",
  },
  skipped: {
    label: "Repeated",
    description: "Exact copy of an earlier row in this file, skipped",
    pillClassName: "bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/30",
    dotClassName: "bg-indigo-500",
  },
  blocked: {
    label: "Not imported",
    description: "Required value missing or type conflict",
    pillClassName: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30",
    dotClassName: "bg-rose-500",
  },
};

const FILTER_ORDER: PreviewFilter[] = ["all", "new", "fill", "none", "warning", "skipped", "blocked"];

/** Cross-fade used when the import moves between upload, preview and report. */
const stepMotion = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const },
};

/** Short column labels for the preview table, with fixed widths so every block aligns. */
const PREVIEW_COLUMN_META: Partial<Record<FieldKey, { label: string; width: string }>> = {
  state: { label: "State", width: "w-[10%]" },
  language: { label: "Language", width: "w-[8%]" },
  englishName: { label: "English name", width: "w-[12%]" },
  nativeName: { label: "Native name", width: "w-[12%]" },
  sourceLink: { label: "Source link", width: "w-[12%]" },
  pageNumber: { label: "Page", width: "w-[5%]" },
  agriExpert: { label: "Agri expert", width: "w-[11%]" },
  remark: { label: "Remark", width: "w-[10%]" },
};

const SEARCH_FIELDS: FieldKey[] = [
  "name",
  "scientificName",
  "state",
  "language",
  "englishName",
  "nativeName",
  "agriExpert",
  "remark",
];

const lower = (value?: string) => (value ?? "").trim().toLowerCase();

/**
 * Mirrors the server merge: a row matching a stored alias (same language, region,
 * English and native name) only fills that alias's empty details; otherwise it adds
 * a new alias, unless it just repeats the entry's own name, which changes nothing.
 */
const aliasOutcomeOf = (row: SheetRow, match: ICropAlias | undefined): AliasOutcome => {
  if (!match) return lower(row.englishName) === lower(row.name) ? "none" : "new";
  const details: [keyof ICropAlias, string][] = [
    ["source_link", row.sourceLink],
    ["page_number", row.pageNumber],
    ["agri_expert", row.agriExpert],
    ["remark", row.remark],
  ];
  const fillsDetail = details.some(([key, value]) => value && !lower(match[key] as string));
  const fillsExtra = Object.entries(row.extras).some(
    ([key, value]) => value && !lower(match.extra_fields?.[key]),
  );
  return fillsDetail || fillsExtra ? "fill" : "none";
};

/** Finds the stored alias a row matches: same language, region, English and native name. */
const findMatchingAlias = (row: SheetRow, stored: ICropAlias[]) =>
  stored.find(
    (a) =>
      lower(a.language) === lower(row.language) &&
      lower(a.region) === lower(row.state) &&
      lower(a.english_representation) === lower(row.englishName) &&
      lower(a.native_representation) === lower(row.nativeName),
  );

/** Columns used to match a row to a stored alias; the rest are details that can be filled. */
const MATCH_KEYS: FieldKey[] = ["state", "language", "englishName", "nativeName"];

/** How one cell relates to the database: written, already there, kept over the sheet, or empty. */
type CellChange = "add" | "same" | "kept" | "differs" | "empty";

/** Compares one sheet cell with the matched alias to show what the import writes. */
const cellChangeOf = (
  row: SheetRow,
  key: FieldKey,
  dbKey: string,
  match: ICropAlias | undefined,
): { change: CellChange; dbValue: string } => {
  const sheetValue = row[key];
  if (!match) return { change: sheetValue ? "add" : "empty", dbValue: "" };
  const dbValue = String((match as unknown as Record<string, unknown>)[dbKey] ?? "").trim();
  if (MATCH_KEYS.includes(key)) return { change: "same", dbValue };
  if (sheetValue && !dbValue) return { change: "add", dbValue };
  if (sheetValue && lower(sheetValue) === lower(dbValue)) return { change: "same", dbValue };
  if (sheetValue) return { change: "differs", dbValue };
  return { change: dbValue ? "kept" : "empty", dbValue };
};

/** Writes rows to an .xlsx using the import's own headers and downloads it, so
 *  anything exported here can be corrected and uploaded straight back. */
const downloadSheet = async (
  fileName: string,
  sheetName: string,
  rows: Record<FieldKey, string>[],
) => {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);

  sheet.columns = COLUMNS.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.warnIfEmpty || c.required ? 30 : 24,
  }));
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

const pickColumns = (row: SheetRow): Record<FieldKey, string> => ({
  name: row.name,
  scientificName: row.scientificName,
  state: row.state,
  language: row.language,
  englishName: row.englishName,
  nativeName: row.nativeName,
  sourceLink: row.sourceLink,
  pageNumber: row.pageNumber,
  agriExpert: row.agriExpert,
  remark: row.remark,
});

/** Turns one sheet row into a vernacular term of its entry. */
const toAlias = (row: SheetRow): ICropAlias => ({
  language: row.language,
  region: row.state,
  english_representation: row.englishName,
  native_representation: row.nativeName,
  ...(row.sourceLink && { source_link: row.sourceLink }),
  ...(row.pageNumber && { page_number: row.pageNumber }),
  ...(row.agriExpert && { agri_expert: row.agriExpert }),
  ...(row.remark && { remark: row.remark }),
  ...(Object.keys(row.extras).length && { extra_fields: row.extras }),
});

/** Groups rows that share a name into one entry carrying all of their terms. */
const toEntries = (rows: SheetRow[]): ICropImportEntry[] => {
  const entries = new Map<string, ICropImportEntry>();
  rows.forEach((row) => {
    const key = nameKeyOf(row.name);
    const entry = entries.get(key) ?? { name: row.name, aliases: [] };
    if (!entry.scientificName && row.scientificName) {
      entry.scientificName = row.scientificName;
    }
    entry.aliases.push(toAlias(row));
    entries.set(key, entry);
  });
  return [...entries.values()];
};

/** Groups shown at once, and added per frame after that, when the preview list changes. */
const PREVIEW_BATCH = 40;

/**
 * Renders a long list in batches without blanking it: the first batch appears
 * immediately and the rest follow frame by frame. Restarts when `resetKey` changes.
 */
const useProgressiveCount = (total: number, resetKey: string) => {
  const [count, setCount] = useState(PREVIEW_BATCH);

  useEffect(() => {
    let frame = 0;
    let current = Math.min(total, PREVIEW_BATCH);
    setCount(current);
    const grow = () => {
      if (current >= total) return;
      current = Math.min(total, current + PREVIEW_BATCH);
      setCount(current);
      frame = requestAnimationFrame(grow);
    };
    frame = requestAnimationFrame(grow);
    return () => cancelAnimationFrame(frame);
  }, [total, resetKey]);

  return count;
};

export const CropSheetImportModal = ({
  open,
  onClose,
  entryType,
}: {
  open: boolean;
  onClose: () => void;
  /** The AgriTech tab being imported into, e.g. "crop", "weed" or "deficiency". */
  entryType: string;
}) => {
  const typeLabel = entryType === "crop" ? "Crop" : labelOf(entryType);
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [report, setReport] = useState<ReportEntry[]>([]);
  const [previewFilter, setPreviewFilter] = useState<PreviewFilter>("all");
  const [documentScope, setDocumentScope] = useState<DocumentScope>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [existing, setExisting] = useState<Map<string, string>>(new Map());
  const [existingAliases, setExistingAliases] = useState<Map<string, ICropAlias[]>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { mutateAsync: importEntries } = useImportCropEntries();

  const resetToUpload = useCallback(() => {
    setStep("upload");
    setRows([]);
    setFileName("");
    setReport([]);
    setPreviewFilter("all");
    setDocumentScope("all");
    setSearchQuery("");
    setExisting(new Map());
    setExistingAliases(new Map());
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  useEffect(() => {
    if (!open) resetToUpload();
  }, [open, resetToUpload]);

  // Serials of rows that exactly repeat an earlier row, which are skipped on import.
  const repeatSerials = useMemo(() => {
    const seen = new Set<string>();
    const repeats = new Set<number>();
    rows.forEach((row) => {
      const key = termKeyOf(row);
      if (seen.has(key)) repeats.add(row.serial);
      else seen.add(key);
    });
    return repeats;
  }, [rows]);

  // Why a row cannot be imported at all, or an empty string when it can.
  const blockReasonOf = useCallback(
    (row: SheetRow): string => {
      const missing = missingRequiredFields(row);
      if (missing.length) return `Missing required field: ${missing.join(", ")}`;
      const existingType = existing.get(nameKeyOf(row.name));
      if (existingType && existingType !== entryType) {
        return `Already exists under the "${existingType}" type`;
      }
      return "";
    },
    [existing, entryType],
  );

  // Blocked when it cannot be imported, a duplicate when it repeats an earlier row
  // or its name is already in the database (terms are merged), a warning when only
  // optional fields are empty or the name has special characters, otherwise ready.
  const rowStateOf = useCallback(
    (row: SheetRow): RowState => {
      if (blockReasonOf(row)) return "blocked";
      if (repeatSerials.has(row.serial) || existing.has(nameKeyOf(row.name))) {
        return "duplicate";
      }
      const hasEmptyOptional = COLUMNS.some(
        (c) => c.warnIfEmpty && !row[c.key],
      );
      return hasEmptyOptional || SPECIAL_CHARACTERS.test(row.name)
        ? "warning"
        : "ready";
    },
    [blockReasonOf, repeatSerials, existing],
  );

  const rowStates = useMemo(
    () => new Map(rows.map((row) => [row.serial, rowStateOf(row)])),
    [rows, rowStateOf],
  );
  const blockedRows = useMemo(
    () => rows.filter((r) => rowStates.get(r.serial) === "blocked"),
    [rows, rowStates],
  );
  const repeatedRows = useMemo(
    () => rows.filter((r) => repeatSerials.has(r.serial) && !blockReasonOf(r)),
    [rows, repeatSerials, blockReasonOf],
  );
  // Rows that reach the database: everything except blocked rows and exact repeats.
  const importRows = useMemo(
    () =>
      rows.filter(
        (r) => rowStates.get(r.serial) !== "blocked" && !repeatSerials.has(r.serial),
      ),
    [rows, rowStates, repeatSerials],
  );
  const hasExtras = useMemo(
    () => rows.some((row) => Object.keys(row.extras).length > 0),
    [rows],
  );
  // How many documents the import will create versus merge into.
  const entrySummary = useMemo(() => {
    const names = new Set(importRows.map((r) => nameKeyOf(r.name)));
    const existingCount = [...names].filter((key) => existing.has(key)).length;
    return { total: names.size, existing: existingCount, fresh: names.size - existingCount };
  }, [importRows, existing]);

  // The stored alias each importable row matches, if any, keyed by serial.
  const rowMatches = useMemo(
    () =>
      new Map(
        importRows.map((row) => [
          row.serial,
          findMatchingAlias(row, existingAliases.get(nameKeyOf(row.name)) ?? []),
        ]),
      ),
    [importRows, existingAliases],
  );
  // What each importable row will do, keyed by serial.
  const rowOutcomes = useMemo(
    () =>
      new Map(
        importRows.map((row) => [row.serial, aliasOutcomeOf(row, rowMatches.get(row.serial))]),
      ),
    [importRows, rowMatches],
  );
  const outcomeCounts = useMemo(() => {
    const counts: Record<AliasOutcome, number> = { new: 0, fill: 0, none: 0 };
    rowOutcomes.forEach((outcome) => counts[outcome]++);
    return counts;
  }, [rowOutcomes]);

  // Sorts every row into one category: what the import will do with it.
  const categoryOf = useCallback(
    (row: SheetRow): RowCategory => {
      if (rowStates.get(row.serial) === "blocked") return "blocked";
      if (repeatSerials.has(row.serial)) return "skipped";
      return rowOutcomes.get(row.serial) ?? "new";
    },
    [rowStates, repeatSerials, rowOutcomes],
  );
  const filterCounts = useMemo(() => {
    const counts: Record<PreviewFilter, number> = {
      all: rows.length, new: 0, fill: 0, none: 0, skipped: 0, blocked: 0, warning: 0,
    };
    rows.forEach((row) => {
      counts[categoryOf(row)]++;
      if (rowStates.get(row.serial) === "warning") counts.warning++;
    });
    return counts;
  }, [rows, rowStates, categoryOf]);
  const isFiltered = previewFilter !== "all" || documentScope !== "all" || searchQuery.trim() !== "";

  // Rows passing the status filter, the document scope and the search box.
  const visibleRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return rows.filter((row) => {
      if (previewFilter === "warning" && rowStates.get(row.serial) !== "warning") return false;
      if (previewFilter !== "all" && previewFilter !== "warning" && categoryOf(row) !== previewFilter) {
        return false;
      }
      const isExistingDocument = existing.has(nameKeyOf(row.name));
      if (documentScope === "new" && isExistingDocument) return false;
      if (documentScope === "existing" && !isExistingDocument) return false;
      return !query || SEARCH_FIELDS.some((key) => row[key].toLowerCase().includes(query));
    });
  }, [rows, rowStates, categoryOf, previewFilter, documentScope, searchQuery, existing]);

  // Groups the visible rows by name, mirroring the one-document-per-entry storage.
  const visibleGroups = useMemo(() => {
    const groups = new Map<string, { key: string; name: string; scientificName: string; rows: SheetRow[] }>();
    visibleRows.forEach((row) => {
      const key = nameKeyOf(row.name);
      const group = groups.get(key) ?? { key, name: row.name, scientificName: "", rows: [] };
      if (!group.scientificName && row.scientificName) group.scientificName = row.scientificName;
      group.rows.push(row);
      groups.set(key, group);
    });
    return [...groups.values()];
  }, [visibleRows]);
  // Filter changes cross-fade the table and scroll it back to the top.
  const filterKey = `${previewFilter}|${documentScope}`;
  const previewScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    previewScrollRef.current?.scrollTo({ top: 0 });
  }, [filterKey]);
  const revealedPreview = useProgressiveCount(visibleGroups.length, filterKey);
  const revealedReport = useStreamedReveal(report.length, step === "report");

  // Asks the database which names already exist, with their aliases, so the preview
  // can show exactly what each row will change.
  const fetchExisting = async (
    parsed: SheetRow[],
  ): Promise<{ types: Map<string, string>; aliases: Map<string, ICropAlias[]> }> => {
    const empty = { types: new Map<string, string>(), aliases: new Map<string, ICropAlias[]>() };
    const names = [
      ...new Set(
        parsed.filter((r) => !missingRequiredFields(r).length).map((r) => r.name),
      ),
    ];
    if (!names.length) return empty;
    try {
      const entries = (await new CropService().findImportDuplicates(names))?.entries ?? [];
      return {
        types: new Map(entries.map((e) => [nameKeyOf(e.name), e.type])),
        aliases: new Map(entries.map((e) => [nameKeyOf(e.name), e.aliases ?? []])),
      };
    } catch {
      toast.warning(
        "Could not check for existing entries — duplicates will be merged on import",
      );
      return empty;
    }
  };

  // Reads the chosen file, validates its headers and rows, then opens the preview.
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
      const { grid, sheetName } =
        extension === ".csv"
          ? { grid: parseCsv(await file.text()), sheetName: "" }
          : await parseXlsx(file, entryType);

      if (grid.length < 2) {
        toast.error("The sheet needs a header row and at least one data row");
        return;
      }

      const { indexes, extras, missing } = resolveHeaders(grid[0].cells);
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
          scientificName: readCell(cells, indexes.scientificName),
          state: readCell(cells, indexes.state),
          language: readCell(cells, indexes.language),
          englishName: readCell(cells, indexes.englishName),
          nativeName: readCell(cells, indexes.nativeName),
          sourceLink: readCell(cells, indexes.sourceLink),
          pageNumber: readCell(cells, indexes.pageNumber),
          agriExpert: readCell(cells, indexes.agriExpert),
          remark: readCell(cells, indexes.remark),
          extras: Object.fromEntries(
            extras
              .map(({ key, index }) => [key, readCell(cells, index)])
              .filter(([, value]) => value),
          ),
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
      setPreviewFilter("all");
      setDocumentScope("all");
      setSearchQuery("");
      setFileName(sheetName ? `${file.name} — ${sheetName}` : file.name);
      const found = await fetchExisting(parsed);
      setExisting(found.types);
      setExistingAliases(found.aliases);
      setStep("preview");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not read that file");
    } finally {
      setIsParsing(false);
    }
  };

  // Sends the importable rows, then builds the per-entry report.
  const handleImport = async () => {
    if (!importRows.length) return;
    setStep("importing");

    try {
      const entries = toEntries(importRows);
      const response = await importEntries({ type: entryType, entries });
      const rowsByName = new Map<string, SheetRow[]>();
      importRows.forEach((row) => {
        const key = nameKeyOf(row.name);
        rowsByName.set(key, [...(rowsByName.get(key) ?? []), row]);
      });

      const serverEntries: ReportEntry[] = (response?.results ?? []).map((result) => {
        const entryRows = rowsByName.get(nameKeyOf(result.name)) ?? [];
        return {
          key: `entry-${nameKeyOf(result.name)}`,
          name: result.name,
          aliases: entryRows.length,
          status: result.status,
          reason: result.reason,
          rows: entryRows,
        };
      });
      const rowEntry = (
        row: SheetRow,
        status: ReportEntry["status"],
        reason: string,
      ): ReportEntry => ({
        key: `row-${row.serial}`,
        name: row.name,
        aliases: 1,
        status,
        reason,
        rows: [row],
      });

      setReport([
        ...serverEntries,
        ...blockedRows.map((row) => rowEntry(row, "failed", blockReasonOf(row))),
        ...repeatedRows.map((row) =>
          rowEntry(row, "skipped", "Repeats an earlier row in this file"),
        ),
      ]);
      setStep("report");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed");
      setStep("preview");
    }
  };

  const downloadTemplate = () =>
    downloadSheet(`${entryType}_import_template.xlsx`, typeLabel, [
      {
        name: entryType === "crop" ? "Paddy" : `Sample ${typeLabel}`,
        scientificName: "Oryza sativa",
        state: "Odisha",
        language: "Odia",
        englishName: "Dhana",
        nativeName: "ଧାନ",
        sourceLink: "",
        pageNumber: "",
        agriExpert: "",
        remark: "",
      },
    ]);

  // Exports whatever the active filter is showing, so a user can fix those rows
  // and upload the corrected sheet.
  const downloadVisibleRows = () =>
    downloadSheet(
      `${entryType}_${previewFilter}.xlsx`,
      typeLabel,
      visibleRows.map(pickColumns),
    );

  const failedEntries = useMemo(
    () => report.filter((entry) => entry.status === "failed"),
    [report],
  );
  const skippedEntries = useMemo(
    () => report.filter((entry) => entry.status === "skipped"),
    [report],
  );
  const reportCounts = useMemo(
    () =>
      report.reduce<Record<string, number>>((acc, entry) => {
        acc[entry.status] = (acc[entry.status] ?? 0) + 1;
        return acc;
      }, {}),
    [report],
  );
  const unimportedCount = failedEntries.length + skippedEntries.length;

  // Copies the sheet rows of the given entries as TSV so they paste into a spreadsheet.
  const copyEntries = async (entries: ReportEntry[], label: string) => {
    const header = ["Sheet Row", ...COLUMNS.map((c) => c.header), "Reason"].join("\t");
    const body = entries
      .flatMap((entry) =>
        entry.rows.map((row) =>
          [
            row.sheetRow,
            ...COLUMNS.map((c) => row[c.key]),
            entry.reason,
          ].join("\t"),
        ),
      )
      .join("\n");
    try {
      await navigator.clipboard.writeText(`${header}\n${body}`);
      toast.success(`Copied ${label} rows — paste into a sheet`);
    } catch {
      toast.error("Could not access the clipboard");
    }
  };

  const cellClassName = (row: SheetRow, column: (typeof COLUMNS)[number]) => {
    if (row[column.key]) return "text-gray-700 dark:text-gray-300";
    if (!column.required && !column.warnIfEmpty) return "text-gray-300 dark:text-gray-600";
    return column.required
      ? "bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 font-medium"
      : "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400";
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[1200px] max-w-[95vw] max-h-[88vh] overflow-hidden flex flex-col">
        <MotionConfig reducedMotion="user">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            Import {typeLabel} Sheet
          </DialogTitle>
          <DialogDescription className="text-xs">
            Upload the vernacular sheet. Rows are matched to existing entries by
            Standardized Category Name and their aliases are merged in; new names are
            created as {entryType}.
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait" initial={false}>
        {/* ── Step 1: file ───────────────────────────────────────────────── */}
        {step === "upload" && (
          <motion.div key="upload" {...stepMotion} className="flex flex-col gap-3 py-1">
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-3 py-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 dark:text-amber-300">
                Every entry in this file is saved as{" "}
                <strong className="font-semibold capitalize">{entryType}</strong>. For a
                workbook with several sheets, the sheet named{" "}
                <strong className="font-semibold">{typeLabel}</strong> is read.
              </p>
            </div>

            <div
              role="button"
              tabIndex={0}
              aria-label={`Upload a spreadsheet of ${entryType} entries`}
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
                .xlsx, .xls or .csv
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

            <div className="rounded-lg border border-gray-200 dark:border-gray-700/60 px-3 py-2.5">
              <div className="flex items-center gap-1.5 mb-2">
                <p className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                  Sheet columns <span className="font-normal text-gray-400">(header names must match)</span>
                </p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="How sheet columns are saved"
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" align="start" className="max-w-[480px] p-3">
                    <p className="text-[11px] font-semibold mb-2">How sheet columns are saved</p>
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="text-left opacity-70">
                          <th scope="col" className="pr-3 pb-1 font-medium">Sheet column</th>
                          <th scope="col" className="pr-3 pb-1 font-medium">Saved as</th>
                          <th scope="col" className="pb-1 font-medium">Where</th>
                        </tr>
                      </thead>
                      <tbody>
                        {COLUMNS.map((column) => (
                          <tr key={column.key}>
                            <td className="pr-3 py-0.5">
                              {column.header}
                              {column.required && <span className="text-rose-400"> *</span>}
                            </td>
                            <td className="pr-3 py-0.5 font-mono">{column.dbKey}</td>
                            <td className="py-0.5 opacity-80">
                              {ENTRY_LEVEL_KEYS.includes(column.key) ? "Document" : "Each alias in aliases"}
                            </td>
                          </tr>
                        ))}
                        <tr>
                          <td className="pr-3 py-0.5">Category</td>
                          <td className="pr-3 py-0.5 font-mono">not saved</td>
                          <td className="py-0.5 opacity-80">Type comes from the tab ({entryType})</td>
                        </tr>
                        <tr>
                          <td className="pr-3 py-0.5">Any other column</td>
                          <td className="pr-3 py-0.5 font-mono">extra_fields.column_name</td>
                          <td className="py-0.5 opacity-80">Each alias in aliases</td>
                        </tr>
                      </tbody>
                    </table>
                    <p className="mt-2 text-[11px] opacity-80">
                      Rows with the same Standardized Category Name become one document.
                      A row matches an existing alias when language, region,
                      english_representation and native_representation are the same; its
                      empty fields are then filled in, never overwritten.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <ul className="flex flex-wrap gap-1.5" aria-label="Sheet columns">
                {COLUMNS.map((column) => (
                  <li
                    key={column.key}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] ${
                      column.required
                        ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 font-medium"
                        : "border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-white/[0.03] dark:text-gray-400"
                    }`}
                  >
                    {column.header}
                    {column.required ? (
                      <span className="text-[10px] uppercase tracking-wide">· Required</span>
                    ) : (
                      <span className="text-[10px] text-gray-400 dark:text-gray-500">· Optional</span>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                Rows missing a required value are not imported. An empty Scientific
                Name, State, Language or Native Script value shows as a warning but
                still imports. Any other column is saved under extra fields.
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => void downloadTemplate()}
              className="h-8 w-fit text-xs"
            >
              <Download className="h-3.5 w-3.5" />
              Download sample template
            </Button>
          </motion.div>
        )}

        {/* ── Step 2: preview, grouped as it will be stored ──────────────── */}
        {(step === "preview" || step === "importing") && (
          <motion.div key="preview" {...stepMotion} className="flex min-h-0 flex-1 flex-col">
            {/* File and document summary */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pb-3 border-b border-gray-100 dark:border-gray-800">
              <FileSpreadsheet className="h-4 w-4 text-gray-400 shrink-0" aria-hidden />
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate max-w-[50%]" title={fileName}>
                {fileName}
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                {entryType}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400 sm:ml-auto">
                {entrySummary.total} document{entrySummary.total === 1 ? "" : "s"}:{" "}
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">{entrySummary.fresh} new</span>
                {" · "}
                <span className="font-semibold text-gray-700 dark:text-gray-200">{entrySummary.existing} existing</span>
              </span>
            </div>

            {/* Status tiles double as filters */}
            <div
              className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 pt-3"
              role="group"
              aria-label="Filter rows by what the import will do"
            >
              {FILTER_ORDER.map((filter) => {
                const isActive = previewFilter === filter;
                const meta =
                  filter === "all"
                    ? { label: "All rows", description: "Every row in the sheet", dotClassName: "bg-gray-500" }
                    : filter === "warning"
                      ? { label: "Warnings", description: "Optional value missing or special characters in the name; still imports", dotClassName: "bg-amber-500" }
                      : CATEGORY_META[filter];
                return (
                  <motion.button whileTap={{ scale: 0.97 }}
                    key={filter}
                    type="button"
                    aria-pressed={isActive}
                    title={meta.description}
                    onClick={() => setPreviewFilter(filter)}
                    className={`relative flex flex-col items-start gap-0.5 rounded-lg border border-gray-200 dark:border-gray-700/70 px-3 py-2 text-left transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                      isActive ? "" : "hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                    }`}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="import-filter-active"
                        transition={{ type: "spring", stiffness: 420, damping: 36 }}
                        className="absolute -inset-px rounded-lg border border-emerald-500/70 bg-emerald-50/70 dark:bg-emerald-500/[0.08]"
                        aria-hidden
                      />
                    )}
                    <span className="relative text-lg font-semibold leading-none text-gray-900 dark:text-gray-100 tabular-nums">
                      {filterCounts[filter]}
                    </span>
                    <span className="relative flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                      <span className={`h-1.5 w-1.5 rounded-full ${meta.dotClassName}`} aria-hidden />
                      {meta.label}
                    </span>
                  </motion.button>
                );
              })}
            </div>

            {/* Search and document scope */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 py-3">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" aria-hidden />
                <Input
                  type="search"
                  aria-label="Search the preview"
                  placeholder="Search crop, alias, state, language or expert..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 pl-8 text-xs"
                />
              </div>
              <Select value={documentScope} onValueChange={(v: DocumentScope) => setDocumentScope(v)}>
                <SelectTrigger aria-label="Document scope" className="h-8 text-xs sm:w-[190px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All documents</SelectItem>
                  <SelectItem value="existing" className="text-xs">Existing documents</SelectItem>
                  <SelectItem value="new" className="text-xs">New documents</SelectItem>
                </SelectContent>
              </Select>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="How to read this table"
                    className="hidden sm:inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                  >
                    <Info className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="end" className="max-w-[340px] p-3">
                  <p className="text-[11px] font-semibold mb-1.5">How to read this table</p>
                  <ul className="space-y-1 text-[11px]">
                    <li>Each block is one {entryType} document; each row is one entry in its aliases.</li>
                    <li><span className="font-semibold">+ value</span> will be written to the database.</li>
                    <li>Plain text is already in the database and stays as is.</li>
                    <li><span className="italic">Italic</span> is a stored value kept because the sheet cell is empty.</li>
                    <li>&quot;Sheet: … not applied&quot; means the database already has a different value, which is kept.</li>
                  </ul>
                </TooltipContent>
              </Tooltip>
            </div>

            <div ref={previewScrollRef} className="flex-1 min-h-0 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700/60">
              <motion.table
                key={filterKey}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="w-full min-w-[1100px] table-fixed text-xs"
              >
                <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-[#161616] shadow-[0_1px_0_0] shadow-gray-200 dark:shadow-gray-700/60">
                  <tr>
                    <th scope="col" className="w-12 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Row
                    </th>
                    {TERM_COLUMNS.map((column) => {
                      const meta = PREVIEW_COLUMN_META[column.key];
                      return (
                        <th key={column.key} scope="col" className={`${meta?.width ?? ""} px-3 py-2 text-left align-bottom`}>
                          <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            {meta?.label ?? column.label}
                            {column.required && <span className="text-rose-500" aria-label="required"> *</span>}
                          </span>
                          <span className="block truncate text-[10px] font-mono font-normal normal-case text-gray-400" title={column.dbKey}>
                            {column.dbKey}
                          </span>
                        </th>
                      );
                    })}
                    {hasExtras && (
                      <th scope="col" className="w-[10%] px-3 py-2 text-left align-bottom">
                        <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Extra</span>
                        <span className="block text-[10px] font-mono font-normal text-gray-400">extra_fields</span>
                      </th>
                    )}
                    <th scope="col" className="w-[150px] px-3 py-2 text-left align-bottom text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Status
                    </th>
                  </tr>
                </thead>

                {visibleGroups.slice(0, revealedPreview).map((group) => {
                  const existingType = existing.get(group.key);
                  const isConflict = Boolean(existingType && existingType !== entryType);
                  const documentBadge = !group.name
                    ? null
                    : isConflict
                      ? { label: `Type conflict: exists as ${existingType}`, className: CATEGORY_META.blocked.pillClassName }
                      : existingType
                        ? { label: "Existing document", className: CATEGORY_META.none.pillClassName }
                        : { label: "New document", className: CATEGORY_META.new.pillClassName };
                  const columnCount = TERM_COLUMNS.length + (hasExtras ? 3 : 2);
                  return (
                    <tbody key={group.key || "missing-name"}>
                      <tr className="border-t border-gray-200 dark:border-gray-700/60 bg-gray-50/70 dark:bg-white/[0.025]">
                        <th scope="rowgroup" colSpan={columnCount} className="px-3 py-2 text-left font-normal">
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                            <span className={`text-sm font-semibold ${group.name ? "text-gray-900 dark:text-gray-100" : "text-rose-600 dark:text-rose-400"}`}>
                              {group.name || "Name required"}
                            </span>
                            <span className="text-xs italic text-gray-500 dark:text-gray-400">
                              {group.scientificName || <span className="not-italic text-amber-600 dark:text-amber-400">No scientific name</span>}
                            </span>
                            {documentBadge && (
                              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ring-1 ring-inset ${documentBadge.className}`}>
                                {documentBadge.label}
                              </span>
                            )}
                            {group.name && SPECIAL_CHARACTERS.test(group.name) && (
                              <span
                                title="The name contains characters other than letters and spaces"
                                className="text-[10px] font-medium px-2 py-0.5 rounded-full ring-1 ring-inset bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30"
                              >
                                Special characters
                              </span>
                            )}
                            <span className="ml-auto text-[11px] text-gray-500 dark:text-gray-400">
                              {group.rows.length} alias row{group.rows.length === 1 ? "" : "s"}
                            </span>
                          </div>
                        </th>
                      </tr>

                      {group.rows.map((row) => {
                        const category = categoryOf(row);
                        const categoryMeta = CATEGORY_META[category];
                        const match = rowMatches.get(row.serial);
                        const isImportable = category === "new" || category === "fill" || (category === "none" && Boolean(match));
                        const hasWarning = rowStates.get(row.serial) === "warning";
                        const filledFields = match
                          ? TERM_COLUMNS.filter((c) => cellChangeOf(row, c.key, c.dbKey, match).change === "add").map((c) => c.dbKey)
                          : [];
                        const extras = Object.entries(row.extras).map(([key, value]) => `${key}: ${value}`).join("; ");
                        return (
                          <tr
                            key={row.serial}
                            className="border-t border-gray-100 dark:border-gray-800/60 hover:bg-gray-50/60 dark:hover:bg-white/[0.02]"
                          >
                            <td className="px-3 py-2 align-top tabular-nums text-gray-400" title={`Row ${row.sheetRow} in the sheet`}>
                              {row.sheetRow}
                            </td>
                            {TERM_COLUMNS.map((column) => {
                              const emptyLabel = column.required ? "Required" : column.warnIfEmpty ? "Missing" : "—";
                              const value = row[column.key];
                              if (!isImportable) {
                                return (
                                  <td key={column.key} className="px-3 py-2 align-top">
                                    <span
                                      title={value || `${column.label} is empty`}
                                      className={`line-clamp-2 break-words rounded ${value ? "text-gray-500 dark:text-gray-400" : cellClassName(row, column)} ${!value && column.required ? "px-1" : ""}`}
                                    >
                                      {value || emptyLabel}
                                    </span>
                                  </td>
                                );
                              }
                              const { change, dbValue } = cellChangeOf(row, column.key, column.dbKey, match);
                              return (
                                <td key={column.key} className="px-3 py-2 align-top">
                                  {change === "add" && (
                                    <span
                                      title={`Will be saved: ${value}`}
                                      className="inline-flex max-w-full items-start gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300"
                                    >
                                      <span aria-hidden className="font-semibold">+</span>
                                      <span className="sr-only">Will be saved: </span>
                                      <span className="line-clamp-2 break-words">{value}</span>
                                    </span>
                                  )}
                                  {change === "same" && (
                                    <span title={`Already in the database: ${dbValue || value}`} className="line-clamp-2 break-words text-gray-700 dark:text-gray-300">
                                      {value}
                                    </span>
                                  )}
                                  {change === "kept" && (
                                    <span title={`Stored value kept: ${dbValue}`} className="line-clamp-2 break-words italic text-gray-400 dark:text-gray-500">
                                      {dbValue}
                                    </span>
                                  )}
                                  {change === "differs" && (
                                    <span title={`Database keeps: ${dbValue}. Sheet value not applied: ${value}`} className="block">
                                      <span className="line-clamp-1 break-words text-gray-700 dark:text-gray-300">{dbValue}</span>
                                      <span className="line-clamp-1 break-words text-[10px] text-amber-600 dark:text-amber-400">
                                        Sheet: {value} · not applied
                                      </span>
                                    </span>
                                  )}
                                  {change === "empty" && (
                                    <span
                                      title={`${column.label} is empty`}
                                      className={column.warnIfEmpty || column.required ? `rounded px-1 ${cellClassName(row, column)}` : "text-gray-300 dark:text-gray-600"}
                                    >
                                      {emptyLabel}
                                    </span>
                                  )}
                                </td>
                              );
                            })}
                            {hasExtras && (
                              <td className="px-3 py-2 align-top text-gray-600 dark:text-gray-400">
                                <span className="line-clamp-2 break-words" title={extras}>
                                  {extras || <span className="text-gray-300 dark:text-gray-600">—</span>}
                                </span>
                              </td>
                            )}
                            <td className="px-3 py-2 align-top" title={blockReasonOf(row) || categoryMeta.description}>
                              <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${categoryMeta.pillClassName}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${categoryMeta.dotClassName}`} aria-hidden />
                                {categoryMeta.label}
                              </span>
                              {filledFields.length > 0 && (
                                <span className="mt-1 block text-[10px] leading-snug text-sky-700 dark:text-sky-300">
                                  Adds <span className="font-mono">{filledFields.join(", ")}</span>
                                </span>
                              )}
                              {category === "blocked" && (
                                <span className="mt-1 block text-[10px] leading-snug text-rose-600 dark:text-rose-400">
                                  {blockReasonOf(row)}
                                </span>
                              )}
                              {hasWarning && (
                                <span className="mt-1 flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
                                  <AlertTriangle className="h-3 w-3" aria-hidden />
                                  Warning
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  );
                })}
              </motion.table>

              {visibleGroups.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-12 text-center">
                  <Search className="h-5 w-5 text-gray-300 dark:text-gray-600" aria-hidden />
                  <p className="text-xs text-gray-500 dark:text-gray-400">No rows match these filters.</p>
                  {isFiltered && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        setPreviewFilter("all");
                        setDocumentScope("all");
                        setSearchQuery("");
                      }}
                    >
                      Clear filters
                    </Button>
                  )}
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
                  Importing {importRows.length} rows...
                </p>
              </div>
            ) : (
              <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2 pt-3">
                {isFiltered && visibleRows.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void downloadVisibleRows()}
                    className="h-8 text-xs sm:mr-auto"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download these {visibleRows.length} rows
                  </Button>
                )}
                <p className="text-[11px] text-gray-500 dark:text-gray-400 sm:ml-auto">
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">{outcomeCounts.new}</span> new
                  {" · "}
                  <span className="font-semibold text-sky-600 dark:text-sky-400">{outcomeCounts.fill}</span> fill details
                  {" · "}
                  <span className="font-semibold text-gray-700 dark:text-gray-200">{outcomeCounts.none}</span> unchanged
                </p>
                <Button variant="outline" size="sm" onClick={resetToUpload} className="h-8 text-xs">
                  Choose another file
                </Button>
                <Button
                  size="sm"
                  disabled={importRows.length === 0}
                  onClick={() => void handleImport()}
                  className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  Import {importRows.length} row{importRows.length === 1 ? "" : "s"}
                </Button>
              </div>
            )}
          </motion.div>
        )}

        {/* ── Step 3: report ─────────────────────────────────────────────── */}
        {step === "report" && (
          <motion.div key="report" {...stepMotion} className="flex min-h-0 flex-1 flex-col">
            <div className="flex flex-wrap gap-4 pb-3 border-b border-gray-100 dark:border-gray-800">
              {(["created", "updated", "skipped", "failed"] as const).map((status) => {
                const meta = STATUS_META[status];
                return (
                  <div key={status} className="flex items-center gap-1.5 text-sm">
                    <meta.Icon className={`h-4 w-4 ${meta.className}`} />
                    <span className="font-semibold text-gray-800 dark:text-gray-200">
                      {reportCounts[status] ?? 0}
                    </span>
                    <span className="text-gray-500 dark:text-gray-400">{meta.label}</span>
                  </div>
                );
              })}
            </div>

            {unimportedCount > 0 && (
              <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-3 py-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  {unimportedCount} entr{unimportedCount === 1 ? "y" : "ies"} did not
                  reach the database. Copy them, fix the reason listed, and upload again.
                </p>
              </div>
            )}

            <div className="mt-3 flex-1 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700/60">
              <div className="grid grid-cols-[48px_1.6fr_70px_100px_2fr] sticky top-0 bg-gray-50 dark:bg-[#161616] border-b border-gray-200 dark:border-gray-700/60 z-10">
                {["#", "Name", "Aliases", "Status", "Reason"].map((heading) => (
                  <div
                    key={heading}
                    className="px-3 py-2 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    {heading}
                  </div>
                ))}
              </div>
              {report.slice(0, revealedReport).map((entry, i) => {
                const meta = STATUS_META[entry.status];
                return (
                  <div
                    key={entry.key}
                    className="grid grid-cols-[48px_1.6fr_70px_100px_2fr] items-center border-b border-gray-100 dark:border-gray-800/60 last:border-b-0 animate-in fade-in duration-200"
                  >
                    <div className="px-3 py-2 text-xs text-gray-400">{i + 1}</div>
                    <div
                      className="px-3 py-2 text-xs text-gray-800 dark:text-gray-200 truncate"
                      title={entry.name}
                    >
                      {entry.name || "—"}
                    </div>
                    <div className="px-3 py-2 text-xs text-gray-600 dark:text-gray-400">
                      {entry.aliases}
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
          </motion.div>
        )}
        </AnimatePresence>
        </MotionConfig>
      </DialogContent>
    </Dialog>
  );
};
