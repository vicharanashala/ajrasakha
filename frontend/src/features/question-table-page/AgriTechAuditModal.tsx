import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  History,
  Loader2,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import { Skeleton } from "@/components/atoms/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select";
import { AuditItem } from "@/features/question_details/components/AuditTrailModal";
import {
  useGetCropManagementAudits,
  type CropManagementAuditFilters,
} from "@/hooks/api/auditTrails/useGetCropManagementAudits";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;
const ALL = "all";

/** Every action AgriTech Management records, with the label shown in the filter. */
const ACTION_OPTIONS: { value: string; label: string }[] = [
  { value: "ADD_CROP", label: "Entry added" },
  { value: "UPDATE_CROP", label: "Entry updated" },
  { value: "CREATE_ALIAS", label: "Alias created" },
  { value: "UPDATE_ALIAS", label: "Alias updated" },
  { value: "DELETE_ALIAS", label: "Alias deleted" },
  { value: "CROP_BULK_CREATE", label: "Bulk upload / sheet import" },
  { value: "ADD_ORGANIZATION", label: "Organization added" },
  { value: "UPDATE_ORGANIZATION", label: "Organization updated" },
  { value: "DELETE_ORGANIZATION", label: "Organization deleted" },
  { value: "ORGANIZATION_BULK_CREATE", label: "Organization bulk import" },
];

const STATUS_OPTIONS = [
  { value: "SUCCESS", label: "Success" },
  { value: "PARTIAL", label: "Partial" },
  { value: "FAILED", label: "Failed" },
];

const SOURCE_OPTIONS = [
  { value: ALL, label: "All changes" },
  { value: "sheet_import", label: "Sheet imports only" },
];

/** Turns a yyyy-mm-dd input value into the start or end of that local day, as ISO. */
const toDayBoundary = (date: string, edge: "start" | "end") =>
  date ? new Date(`${date}T${edge === "start" ? "00:00:00" : "23:59:59.999"}`).toISOString() : undefined;

export const AgriTechAuditModal = ({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) => {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [action, setAction] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [source, setSource] = useState(ALL);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [importId, setImportId] = useState("");
  const [page, setPage] = useState(1);

  // Debounces typing so the list is queried once the user pauses.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Any filter change starts again from the first page.
  useEffect(() => {
    setPage(1);
  }, [search, action, status, source, startDate, endDate, order, importId]);

  const filters: CropManagementAuditFilters = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      order,
      action: action === ALL ? undefined : action,
      status: status === ALL ? undefined : status,
      source: source === ALL ? undefined : source,
      start: toDayBoundary(startDate, "start"),
      end: toDayBoundary(endDate, "end"),
      search: search || undefined,
      importId: importId || undefined,
    }),
    [page, order, action, status, source, startDate, endDate, search, importId],
  );

  const { data, isLoading, isFetching, isError, refetch } = useGetCropManagementAudits(filters, open);
  const audits = data?.data ?? [];
  const totalDocuments = data?.totalDocuments ?? 0;
  const totalPages = Math.max(1, data?.totalPages ?? 1);
  const isDateRangeInvalid = Boolean(startDate && endDate && startDate > endDate);
  const hasFilters =
    Boolean(searchInput || startDate || endDate || importId) ||
    action !== ALL ||
    status !== ALL ||
    source !== ALL;

  // Resets every filter back to its default.
  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setAction(ALL);
    setStatus(ALL);
    setSource(ALL);
    setStartDate("");
    setEndDate("");
    setImportId("");
  };

  const firstShown = totalDocuments ? (page - 1) * PAGE_SIZE + 1 : 0;
  const lastShown = Math.min(page * PAGE_SIZE, totalDocuments);

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="sm:max-w-[920px] max-w-[95vw] h-[85vh] p-0 gap-0 flex flex-col overflow-hidden">
        <MotionConfig reducedMotion="user">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-gray-100 dark:border-gray-800">
            <DialogTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4 text-indigo-600 dark:text-indigo-400" aria-hidden />
              AgriTech audit trail
            </DialogTitle>
            <DialogDescription className="text-xs">
              Every change made in AgriTech Management: entries, aliases, organizations and bulk imports.
            </DialogDescription>
          </DialogHeader>

          {/* Filters */}
          <div className="px-5 py-3 space-y-2 border-b border-gray-100 dark:border-gray-800">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" aria-hidden />
                <Input
                  type="search"
                  aria-label="Search audit entries"
                  placeholder="Search entry, organization, user or file name..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="h-8 pl-8 text-xs"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOrder((o) => (o === "desc" ? "asc" : "desc"))}
                className="h-8 text-xs shrink-0"
                aria-label={order === "desc" ? "Sorted newest first" : "Sorted oldest first"}
              >
                {order === "desc" ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />}
                {order === "desc" ? "Newest first" : "Oldest first"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void refetch()}
                disabled={isFetching}
                className="h-8 w-8 p-0 shrink-0"
                aria-label="Refresh"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
              </Button>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
              <Select value={action} onValueChange={setAction}>
                <SelectTrigger aria-label="Action" className="h-8 text-xs w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL} className="text-xs">All actions</SelectItem>
                  {ACTION_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value} className="text-xs">
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger aria-label="Outcome" className="h-8 text-xs w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL} className="text-xs">All outcomes</SelectItem>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value} className="text-xs">
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger aria-label="Source" className="h-8 text-xs w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value} className="text-xs">
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <label className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                <span className="shrink-0">From</span>
                <Input
                  type="date"
                  value={startDate}
                  max={endDate || undefined}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-8 text-xs"
                />
              </label>
              <label className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                <span className="shrink-0">To</span>
                <Input
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-8 text-xs"
                />
              </label>
            </div>

            {(importId || hasFilters || isDateRangeInvalid) && (
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                {importId && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700 ring-1 ring-inset ring-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/30">
                    <FileSpreadsheet className="h-3 w-3" aria-hidden />
                    One import only
                    <button
                      type="button"
                      onClick={() => setImportId("")}
                      aria-label="Show all imports"
                      className="rounded-full p-0.5 hover:bg-indigo-100 dark:hover:bg-indigo-500/20"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
                {isDateRangeInvalid && (
                  <span className="text-[11px] text-rose-600 dark:text-rose-400">
                    The start date is after the end date.
                  </span>
                )}
                {hasFilters && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="ml-auto text-[11px] font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Results */}
          <div className="relative flex-1 min-h-0 overflow-y-auto px-5 py-3">
            {isFetching && !isLoading && (
              <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 overflow-hidden">
                <div className="h-full w-1/3 bg-indigo-500 animate-indeterminate-bar" />
              </div>
            )}

            {isLoading ? (
              <div className="space-y-3" aria-busy="true" aria-label="Loading audit entries">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-28 w-full rounded-lg" />
                ))}
              </div>
            ) : isError ? (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <p className="text-sm text-gray-600 dark:text-gray-300">Could not load the audit trail.</p>
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => void refetch()}>
                  Try again
                </Button>
              </div>
            ) : audits.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-16 text-center">
                <History className="h-6 w-6 text-gray-300 dark:text-gray-600" aria-hidden />
                <p className="text-sm text-gray-600 dark:text-gray-300">No audit entries found.</p>
                {hasFilters && (
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={clearFilters}>
                    Clear filters
                  </Button>
                )}
              </div>
            ) : (
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.ul
                  key={`${page}|${JSON.stringify({ ...filters, page: undefined })}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.16 }}
                  className="space-y-3"
                >
                  {audits.map((audit, index) => {
                    const auditImportId = audit.context?.importId as string | undefined;
                    return (
                      <li key={(audit as { _id?: string })._id ?? `${page}-${index}`}>
                        <AuditItem audit={audit} entityLabel="AgriTech" />
                        {auditImportId && auditImportId !== importId && (
                          <button
                            type="button"
                            onClick={() => setImportId(auditImportId)}
                            className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
                          >
                            <FileSpreadsheet className="h-3 w-3" aria-hidden />
                            View every change from this import
                          </button>
                        )}
                      </li>
                    );
                  })}
                </motion.ul>
              </AnimatePresence>
            )}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-gray-100 dark:border-gray-800">
            <p className="text-[11px] text-gray-500 dark:text-gray-400 tabular-nums">
              {totalDocuments ? `Showing ${firstShown}–${lastShown} of ${totalDocuments}` : "No entries"}
            </p>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || isFetching}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="min-w-[72px] text-center text-[11px] text-gray-600 dark:text-gray-300 tabular-nums">
                {isFetching ? <Loader2 className="mx-auto h-3 w-3 animate-spin" /> : `Page ${page} of ${totalPages}`}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || isFetching}
                aria-label="Next page"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </MotionConfig>
      </DialogContent>
    </Dialog>
  );
};
