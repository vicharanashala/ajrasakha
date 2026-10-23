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
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/atoms/tooltip";
import { useImportCropEntries } from "@/hooks/api/crop/useImportCropEntries";
import {
  CropService,
  type ICropAlias,
  type ICropImportEntry,
  type ICropImportResult,
} from "@/hooks/services/cropService";
import {
  FILTER_OPTIONS,
  cellToText,
  matchesFilter,
  parseCsv,
  useStreamedReveal,
  type RawRow,
  type RowFilter,
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
  terms: number;
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
  const [rowFilter, setRowFilter] = useState<RowFilter>("all");
  const [existing, setExisting] = useState<Map<string, string>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { mutateAsync: importEntries } = useImportCropEntries();

  const resetToUpload = useCallback(() => {
    setStep("upload");
    setRows([]);
    setFileName("");
    setReport([]);
    setRowFilter("all");
    setExisting(new Map());
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
  const filterCounts = useMemo(() => {
    const count = (state: RowState) =>
      rows.filter((r) => rowStates.get(r.serial) === state).length;
    return {
      all: rows.length,
      ready: count("ready") + count("warning"),
      warning: count("warning"),
      duplicate: count("duplicate"),
      blocked: count("blocked"),
    };
  }, [rows, rowStates]);
  const visibleRows = useMemo(
    () =>
      rows.filter((r) => matchesFilter(rowStates.get(r.serial) ?? "ready", rowFilter)),
    [rows, rowStates, rowFilter],
  );

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

  const revealedPreview = useStreamedReveal(visibleGroups.length, step === "preview");
  const revealedReport = useStreamedReveal(report.length, step === "report");

  // Asks the database which names already exist, so the preview can flag them first.
  const fetchExisting = async (parsed: SheetRow[]): Promise<Map<string, string>> => {
    const names = [
      ...new Set(
        parsed.filter((r) => !missingRequiredFields(r).length).map((r) => r.name),
      ),
    ];
    if (!names.length) return new Map();
    try {
      const response = await new CropService().findImportDuplicates(names);
      return new Map(
        (response?.entries ?? []).map((e) => [nameKeyOf(e.name), e.type]),
      );
    } catch {
      toast.warning(
        "Could not check for existing entries — duplicates will be merged on import",
      );
      return new Map();
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
      setRowFilter("all");
      setFileName(sheetName ? `${file.name} — ${sheetName}` : file.name);
      setExisting(await fetchExisting(parsed));
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
          terms: entryRows.length,
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
        terms: 1,
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
      `${entryType}_${rowFilter}.xlsx`,
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
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            Import {typeLabel} Sheet
          </DialogTitle>
          <DialogDescription className="text-xs">
            Upload the vernacular sheet. Rows are matched to existing entries by
            Standardized Category Name and their terms are merged in; new names are
            created as {entryType}.
          </DialogDescription>
        </DialogHeader>

        {/* ── Step 1: file ───────────────────────────────────────────────── */}
        {step === "upload" && (
          <div className="flex flex-col gap-3 py-1">
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
                              {ENTRY_LEVEL_KEYS.includes(column.key) ? "Document" : "Each term in aliases"}
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
                          <td className="py-0.5 opacity-80">Each term in aliases</td>
                        </tr>
                      </tbody>
                    </table>
                    <p className="mt-2 text-[11px] opacity-80">
                      Rows with the same Standardized Category Name become one document.
                      A row matches an existing term when language, region,
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
          </div>
        )}

        {/* ── Step 2: preview with per-cell validation ───────────────────── */}
        {(step === "preview" || step === "importing") && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2 min-w-0">
                <FileSpreadsheet className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                <span className="text-xs text-gray-700 dark:text-gray-300 truncate">
                  {fileName}
                </span>
                <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                  {entryType}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter rows">
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
                Required field missing or type conflict — row will not be imported
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-amber-400" aria-hidden />
                Optional field missing or special characters in the name — row still imports
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-indigo-400" aria-hidden />
                Already exists (terms are merged) or repeated in the file (skipped)
              </span>
            </div>

            <p className="pb-2 text-[11px] text-gray-500 dark:text-gray-400">
              Shown as it will be stored: one {entryType} document per name, with each
              sheet row saved as a vernacular term in its <span className="font-mono">aliases</span>.
              {" "}Importing creates <strong className="font-semibold text-gray-700 dark:text-gray-200">{entrySummary.fresh}</strong> new
              {" "}and updates <strong className="font-semibold text-gray-700 dark:text-gray-200">{entrySummary.existing}</strong> existing
              {" "}document{entrySummary.total === 1 ? "" : "s"}.
            </p>

            <div className="flex-1 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700/60">
              <div className="min-w-[1080px]">
                {visibleGroups.slice(0, revealedPreview).map((group) => {
                  const existingType = existing.get(group.key);
                  const isConflict = Boolean(existingType && existingType !== entryType);
                  const status = !group.name
                    ? null
                    : isConflict
                      ? {
                          label: `Type conflict: exists as ${existingType}`,
                          className: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
                        }
                      : existingType
                        ? {
                            label: "Exists: terms will be merged",
                            className: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
                          }
                        : {
                            label: "New document",
                            className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
                          };
                  return (
                    <section
                      key={group.key || "missing-name"}
                      aria-label={group.name || "Rows without a name"}
                      className="border-b border-gray-200 dark:border-gray-700/60 last:border-b-0 animate-in fade-in duration-200"
                    >
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-3 py-2 bg-gray-50 dark:bg-white/[0.03]">
                        <div className="flex items-baseline gap-1.5 min-w-0">
                          <span className="text-[10px] font-mono text-gray-400">name</span>
                          <span
                            className={`text-sm font-semibold truncate ${
                              group.name ? "text-gray-900 dark:text-gray-100" : "text-rose-600 dark:text-rose-400"
                            }`}
                          >
                            {group.name || "Required"}
                          </span>
                        </div>
                        <div className="flex items-baseline gap-1.5 min-w-0">
                          <span className="text-[10px] font-mono text-gray-400">scientificName</span>
                          <span
                            className={`text-xs italic truncate ${
                              group.scientificName ? "text-gray-700 dark:text-gray-300" : "text-amber-600 dark:text-amber-400"
                            }`}
                          >
                            {group.scientificName || "Missing"}
                          </span>
                        </div>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-[10px] font-mono text-gray-400">type</span>
                          <span className="text-xs text-gray-700 dark:text-gray-300">{entryType}</span>
                        </div>
                        <div className="ml-auto flex flex-wrap items-center gap-1.5">
                          {group.name && SPECIAL_CHARACTERS.test(group.name) && (
                            <span
                              title="The name contains characters other than letters and spaces"
                              className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                            >
                              Special chars
                            </span>
                          )}
                          {status && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${status.className}`}>
                              {status.label}
                            </span>
                          )}
                          <span className="text-[10px] text-gray-500 dark:text-gray-400">
                            {group.rows.length} term{group.rows.length === 1 ? "" : "s"}
                          </span>
                        </div>
                      </div>

                      <table className="w-full table-fixed text-xs">
                        <thead>
                          <tr className="border-y border-gray-100 dark:border-gray-800/60">
                            <th scope="col" className="w-10 px-3 py-1.5 text-left font-normal text-[10px] text-gray-400">#</th>
                            {TERM_COLUMNS.map((column) => (
                              <th key={column.key} scope="col" className="px-3 py-1.5 text-left align-bottom">
                                <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                  {column.label}
                                  {column.required && <span className="text-rose-500"> *</span>}
                                </span>
                                <span
                                  title={column.dbKey}
                                  className="block truncate text-[10px] font-mono font-normal text-gray-400"
                                >
                                  {column.dbKey}
                                </span>
                              </th>
                            ))}
                            {hasExtras && (
                              <th scope="col" className="px-3 py-1.5 text-left align-bottom">
                                <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                  Extra Fields
                                </span>
                                <span className="block text-[10px] font-mono font-normal text-gray-400">extra_fields</span>
                              </th>
                            )}
                            <th scope="col" className="w-28 px-3 py-1.5 text-left align-bottom text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                              Row status
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.rows.map((row) => {
                            const state = rowStates.get(row.serial);
                            const isRepeat = repeatSerials.has(row.serial);
                            const rowStatus =
                              state === "blocked"
                                ? { label: "Not imported", className: "text-rose-600 dark:text-rose-400" }
                                : isRepeat
                                  ? { label: "Repeated, skipped", className: "text-indigo-600 dark:text-indigo-400" }
                                  : state === "duplicate"
                                    ? { label: "Will merge", className: "text-indigo-600 dark:text-indigo-400" }
                                    : state === "warning"
                                      ? { label: "Warning", className: "text-amber-600 dark:text-amber-400" }
                                      : { label: "Ready", className: "text-emerald-600 dark:text-emerald-400" };
                            const extras = Object.entries(row.extras)
                              .map(([key, value]) => `${key}: ${value}`)
                              .join("; ");
                            return (
                              <tr
                                key={row.serial}
                                className={`border-b border-gray-100 dark:border-gray-800/60 last:border-b-0 ${
                                  isRepeat ? "bg-indigo-50/50 dark:bg-indigo-500/[0.07]" : ""
                                }`}
                              >
                                <td className="px-3 py-1.5 text-gray-400" title={`Sheet row ${row.sheetRow}`}>
                                  {row.serial}
                                </td>
                                {TERM_COLUMNS.map((column) => (
                                  <td
                                    key={column.key}
                                    title={row[column.key] || `${column.label} is empty`}
                                    className={`px-3 py-1.5 truncate ${cellClassName(row, column)}`}
                                  >
                                    {row[column.key] ||
                                      (column.required ? "Required" : column.warnIfEmpty ? "Missing" : "—")}
                                  </td>
                                ))}
                                {hasExtras && (
                                  <td className="px-3 py-1.5 truncate text-gray-600 dark:text-gray-400" title={extras}>
                                    {extras || <span className="text-gray-300 dark:text-gray-600">—</span>}
                                  </td>
                                )}
                                <td
                                  className={`px-3 py-1.5 font-medium ${rowStatus.className}`}
                                  title={blockReasonOf(row) || undefined}
                                >
                                  {rowStatus.label}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </section>
                  );
                })}

                {visibleGroups.length === 0 && (
                  <div className="py-10 text-center text-xs text-gray-500 dark:text-gray-400">
                    No rows in this group.
                  </div>
                )}
              </div>
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
                  disabled={importRows.length === 0}
                  onClick={() => void handleImport()}
                  className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  Import {importRows.length} row{importRows.length === 1 ? "" : "s"}
                </Button>
              </div>
            )}
          </>
        )}

        {/* ── Step 3: report ─────────────────────────────────────────────── */}
        {step === "report" && (
          <>
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
                {["#", "Name", "Terms", "Status", "Reason"].map((heading) => (
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
                      {entry.terms}
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
