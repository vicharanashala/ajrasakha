import { useState, useMemo, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/atoms/dialog";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import { Checkbox } from "@/components/atoms/checkbox";
import { Badge } from "@/components/atoms/badge";
import { ScrollArea } from "@/components/atoms/scroll-area";
import {
  Trash2,
  AlertTriangle,
  Search,
  Loader2,
  Check,
  Leaf,
  Layers,
  ArrowRight,
  Info,
  CheckCircle2,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { toast } from "@/shared/components/toast";
import { useGetCropAffectedQuestions } from "@/hooks/api/crop/useGetCropAffectedQuestions";
import { useGetNormalisedCrops } from "@/hooks/api/crop/useGetNormalisedCrops";
import { useDeleteCrop } from "@/hooks/api/crop/useDeleteCrop";
import type { ICropResponse } from "@/hooks/services/cropService";

interface DeleteCropModalProps {
  crop: ICropResponse | null;
  open: boolean;
  onClose: () => void;
}

/** Robustly converts any MongoDB ID (hex string, ObjectId, $oid, or BSON Buffer) to a 24-char hex string */
const getCleanId = (raw: any): string => {
  if (!raw) return "";
  if (typeof raw === "string") return raw;
  if (typeof raw === "object") {
    if (raw.$oid) return String(raw.$oid);
    if (raw.buffer && Array.isArray(raw.buffer.data)) {
      return raw.buffer.data
        .map((b: number) => b.toString(16).padStart(2, "0"))
        .join("");
    }
    if (raw._id) return getCleanId(raw._id);
    if (raw.toString && typeof raw.toString === "function" && raw.toString() !== "[object Object]") {
      return raw.toString();
    }
  }
  return String(raw);
};

export const DeleteCropModal = ({ crop, open, onClose }: DeleteCropModalProps) => {
  const cropId = crop ? getCleanId(crop._id) : undefined;

  // Question search & pagination state (Server-side)
  const [questionSearch, setQuestionSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [questionPage, setQuestionPage] = useState(1);
  const [questionLimit, setQuestionLimit] = useState(10);

  // Debounce search input by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(questionSearch);
      setQuestionPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [questionSearch]);

  // 1. Fetch questions affected by this crop with server-side pagination & search
  const {
    data: affectedData,
    isLoading: isQuestionsLoading,
    isFetching: isQuestionsFetching,
    refetch: refetchQuestions,
  } = useGetCropAffectedQuestions(
    cropId,
    {
      page: questionPage,
      limit: questionLimit,
      search: debouncedSearch,
    },
    open,
  );

  const questions = affectedData?.questions ?? [];
  const totalQuestions = affectedData?.total ?? 0;
  const totalQuestionPages = Math.max(1, affectedData?.totalPages ?? 1);

  // 2. Fetch all normalized crops directly from crop_master
  const { data: allCropsData, isLoading: isCropsLoading } = useGetNormalisedCrops(open);

  // Filter out the crop being deleted from replacement candidates
  const availableReplacementCrops = useMemo(() => {
    if (!allCropsData?.crops || !crop) return [];
    const deletingId = getCleanId(crop._id);
    const deletingName = crop.name.toLowerCase().trim();
    return allCropsData.crops.filter((c) => {
      const cid = getCleanId(c._id);
      const cname = c.name.toLowerCase().trim();
      return cid !== deletingId && cname !== deletingName;
    });
  }, [allCropsData?.crops, crop]);

  // Mutation
  const { mutateAsync: deleteOrReassign, isPending: isMutating } = useDeleteCrop();

  // Selection state:
  // selectAllMode = true -> Reassigns ALL questions across entire database (atomic on MongoDB) and deletes crop
  // selectAllMode = false -> Reassigns only questions explicitly in selectedQuestionIds
  const [selectAllMode, setSelectAllMode] = useState(true);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string>>(new Set());
  const [selectedReplacementCrop, setSelectedReplacementCrop] = useState<ICropResponse | null>(null);

  // Replacement crop search & pagination state (Client-side over cached crop master list)
  const [cropSearch, setCropSearch] = useState("");
  const [cropPage, setCropPage] = useState(1);
  const [cropLimit, setCropLimit] = useState(10);

  // Reset modal state when crop target changes or modal opens
  useEffect(() => {
    setSelectAllMode(true);
    setSelectedQuestionIds(new Set());
    setSelectedReplacementCrop(null);
    setQuestionSearch("");
    setDebouncedSearch("");
    setQuestionPage(1);
    setCropSearch("");
    setCropPage(1);
  }, [cropId, open]);

  // When questionLimit changes, reset page to 1
  useEffect(() => {
    setQuestionPage(1);
  }, [questionLimit]);

  // When cropSearch or cropLimit changes, reset cropPage to 1
  useEffect(() => {
    setCropPage(1);
  }, [cropSearch, cropLimit]);

  // Filtered replacement crops
  const filteredReplacementCrops = useMemo(() => {
    if (!cropSearch.trim()) return availableReplacementCrops;
    const query = cropSearch.toLowerCase().trim();
    return availableReplacementCrops.filter((c) => {
      if (c.name.toLowerCase().includes(query)) return true;
      if (c.scientificName?.toLowerCase().includes(query)) return true;
      return (c.aliases || []).some((a) => {
        if (typeof a === "string") return a.toLowerCase().includes(query);
        return (
          a.english_representation?.toLowerCase().includes(query) ||
          a.native_representation?.toLowerCase().includes(query) ||
          a.language?.toLowerCase().includes(query) ||
          a.region?.toLowerCase().includes(query)
        );
      });
    });
  }, [availableReplacementCrops, cropSearch]);

  // Paginated replacement crops
  const totalCropPages = Math.max(1, Math.ceil(filteredReplacementCrops.length / cropLimit));
  const validCropPage = Math.min(Math.max(1, cropPage), totalCropPages);
  const cropStartIndex = (validCropPage - 1) * cropLimit;
  const cropEndIndex = Math.min(cropStartIndex + cropLimit, filteredReplacementCrops.length);
  const paginatedCrops = useMemo(() => {
    return filteredReplacementCrops.slice(cropStartIndex, cropEndIndex);
  }, [filteredReplacementCrops, cropStartIndex, cropEndIndex]);

  // Question selection handlers
  const handleToggleQuestion = (rawId: any) => {
    const id = getCleanId(rawId);
    if (selectAllMode) {
      // Switching from Select All to Partial selection:
      const newSet = new Set(questions.map((q) => getCleanId(q._id)));
      newSet.delete(id);
      setSelectedQuestionIds(newSet);
      setSelectAllMode(false);
      return;
    }

    setSelectedQuestionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    if (selectAllMode) {
      // Deselect all
      setSelectAllMode(false);
      setSelectedQuestionIds(new Set());
    } else {
      // Select all across all pages
      setSelectAllMode(true);
      setSelectedQuestionIds(new Set());
    }
  };

  const isCurrentPageAllSelected =
    questions.length > 0 &&
    (selectAllMode || questions.every((q) => selectedQuestionIds.has(getCleanId(q._id))));

  const handleToggleSelectCurrentPage = () => {
    if (selectAllMode) {
      // Deselect current page items
      setSelectAllMode(false);
      setSelectedQuestionIds(new Set());
      return;
    }

    setSelectedQuestionIds((prev) => {
      const next = new Set(prev);
      if (isCurrentPageAllSelected) {
        questions.forEach((q) => next.delete(getCleanId(q._id)));
      } else {
        questions.forEach((q) => next.add(getCleanId(q._id)));
      }
      return next;
    });
  };

  const selectedCount = selectAllMode ? totalQuestions : selectedQuestionIds.size;
  const isFullMigration = selectAllMode || (selectedCount >= totalQuestions && totalQuestions > 0);

  // Submission handler
  const handleSubmit = async () => {
    if (!cropId || !crop) return;

    // Zero questions: Direct deletion
    if (totalQuestions === 0) {
      const toastId = toast.loading(`Deleting crop "${crop.name}"...`);
      try {
        await deleteOrReassign({
          cropId: getCleanId(cropId),
          payload: {},
        });
        toast.dismiss(toastId);
        toast.success(`Crop "${crop.name}" deleted successfully`, {
          desc: "Entry removed from crop master.",
        });
        onClose();
      } catch (err: any) {
        toast.dismiss(toastId);
        toast.error("Failed to delete crop", {
          desc: err?.message || "An unexpected error occurred",
        });
      }
      return;
    }

    // Questions exist -> Replacement crop is mandatory
    if (!selectedReplacementCrop) {
      toast.warning("Replacement crop required", {
        desc: "Please select a replacement crop before proceeding.",
      });
      return;
    }

    if (!selectAllMode && selectedCount === 0) {
      toast.warning("No questions selected", {
        desc: "Please select at least one question to reassign, or select all to delete the crop.",
      });
      return;
    }

    const toastId = toast.loading(
      isFullMigration
        ? `Reassigning all ${totalQuestions.toLocaleString()} questions and deleting "${crop.name}"...`
        : `Reassigning ${selectedCount.toLocaleString()} questions to "${selectedReplacementCrop.name}"...`
    );

    try {
      const cleanCropId = getCleanId(cropId);
      const cleanReplacementCropId = getCleanId(selectedReplacementCrop._id);
      const cleanQuestionIds = selectAllMode
        ? undefined
        : Array.from(selectedQuestionIds).map((id) => getCleanId(id));

      const res = await deleteOrReassign({
        cropId: cleanCropId,
        payload: {
          replacementCropId: cleanReplacementCropId,
          reassignAll: selectAllMode,
          questionIds: cleanQuestionIds,
        },
      });

      toast.dismiss(toastId);

      if (res?.cropDeleted || isFullMigration) {
        toast.success(`Crop "${crop.name}" deleted successfully`, {
          desc: `All questions reassigned to "${selectedReplacementCrop.name}".`,
        });
        onClose();
      } else {
        toast.info(`Questions reassigned successfully`, {
          desc: `${res?.reassignedCount || selectedCount} questions updated to "${selectedReplacementCrop.name}". "${crop.name}" remains until all questions are migrated.`,
        });
        onClose();
      }
    } catch (err: any) {
      toast.dismiss(toastId);
      toast.error("Operation failed", {
        desc: err?.message || "Failed to process crop deletion or reassignment",
      });
    }
  };

  const questionRangeStart = (questionPage - 1) * questionLimit + 1;
  const questionRangeEnd = Math.min(questionPage * questionLimit, totalQuestions);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className={`${!isQuestionsLoading && totalQuestions === 0 ? "sm:max-w-lg" : "sm:max-w-[1200px]"} max-w-[95vw] max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden sm:rounded-2xl border-gray-200 dark:border-gray-800 bg-white dark:bg-[#111] transition-[max-width] duration-150`}>
        {/* Header */}
        <div className="flex-shrink-0 p-5 sm:px-6 border-b border-gray-100 dark:border-gray-800/80 bg-gray-50/50 dark:bg-white/[0.02]">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 shrink-0">
              <Trash2 className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <DialogTitle className="text-lg font-bold text-gray-900 dark:text-white truncate">
                  Delete Crop: {crop?.name}
                </DialogTitle>
                {crop?.scientificName && (
                  <span className="text-xs italic text-muted-foreground truncate hidden sm:inline">
                    ({crop.scientificName})
                  </span>
                )}
              </div>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                {isQuestionsLoading ? (
                  "Scanning database for questions using this crop..."
                ) : totalQuestions === 0 ? (
                  "This crop has no associated questions. It can be safely deleted directly."
                ) : (
                  <>
                    This crop is currently referenced by{" "}
                    <span className="font-semibold text-foreground">{totalQuestions.toLocaleString()}</span> questions.
                    Select questions to migrate and choose a new normalized crop.
                  </>
                )}
              </DialogDescription>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {isQuestionsLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm">Scanning database for normalized crop "{crop?.name}"...</p>
            </div>
          ) : totalQuestions === 0 ? (
            /* ── Zero questions case: direct deletion confirmation ── */
            <div className="flex-1 p-6 flex flex-col items-center justify-center text-center max-w-md mx-auto">
              <div className="h-14 w-14 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4 border border-emerald-500/20">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                Safe to Delete Directly
              </h3>
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                There are <span className="font-bold text-foreground">0 questions</span> currently
                using <span className="font-semibold text-foreground">"{crop?.name}"</span> as their
                normalized crop. No question migration is needed.
              </p>
              <div className="mt-4 p-3 rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-gray-800 w-full text-left">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Crop Details
                </div>
                <div className="text-sm font-medium text-foreground">{crop?.name}</div>
                {crop?.scientificName && (
                  <div className="text-xs italic text-muted-foreground">{crop.scientificName}</div>
                )}
                <div className="text-xs text-muted-foreground mt-1">
                  Aliases: {crop?.aliases?.length || 0} registered
                </div>
              </div>
            </div>
          ) : (
            /* ── Questions exist: Dual-panel layout with server-side pagination ── */
            <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-100 dark:divide-gray-800">
              {/* Left Column: Affected Questions */}
              <div className="flex flex-col min-h-0 p-4 sm:p-5">
                <div className="flex items-center justify-between gap-2 pb-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-primary" />
                    <span className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                      Affected Questions
                    </span>
                    <Badge variant="secondary" className="text-[11px] font-mono px-2 py-0">
                      {selectedCount.toLocaleString()} of {totalQuestions.toLocaleString()}
                    </Badge>
                  </div>
                  {isQuestionsFetching && !isQuestionsLoading && (
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin text-primary" />
                      <span>Updating...</span>
                    </div>
                  )}
                </div>

                {/* Question Search & Select Controls */}
                <div className="pt-3 pb-2 space-y-2 shrink-0">
                  <div className="relative">
                    <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search questions by text, crop or location..."
                      value={questionSearch}
                      onChange={(e) => setQuestionSearch(e.target.value)}
                      className="h-8 pl-8 text-xs rounded-lg"
                    />
                  </div>

                  <div className="flex items-center justify-between px-1 text-xs">
                    <label className="flex items-center gap-2 cursor-pointer select-none font-medium text-gray-700 dark:text-gray-300">
                      <Checkbox
                        checked={selectAllMode ? true : isCurrentPageAllSelected ? "indeterminate" : false}
                        onCheckedChange={handleToggleSelectAll}
                        id="select-all-questions"
                      />
                      <span>Select All Questions ({totalQuestions.toLocaleString()})</span>
                    </label>

                    <div className="flex items-center gap-2">
                      {!selectAllMode && (
                        <button
                          type="button"
                          onClick={handleToggleSelectCurrentPage}
                          className="text-[11px] text-primary hover:underline font-medium cursor-pointer"
                        >
                          {isCurrentPageAllSelected ? "Deselect Page" : "Select Page"}
                        </button>
                      )}
                      <span className="text-[11px] text-muted-foreground">
                        {selectedCount.toLocaleString()} selected
                      </span>
                    </div>
                  </div>
                </div>

                {/* Questions Scrollable List */}
                <ScrollArea className="flex-1 -mx-2 px-2 min-h-0">
                  <div className="space-y-2 py-1">
                    {questions.length === 0 ? (
                      <div className="text-center py-8 text-xs text-muted-foreground">
                        {debouncedSearch ? `No questions match "${debouncedSearch}"` : "No questions found"}
                      </div>
                    ) : (
                      questions.map((q) => {
                        const qId = getCleanId(q._id);
                        const isSelected = selectAllMode || selectedQuestionIds.has(qId);
                        return (
                          <div
                            key={qId}
                            onClick={() => handleToggleQuestion(qId)}
                            className={`p-3 rounded-xl border text-left cursor-pointer transition-all select-none ${
                              isSelected
                                ? "border-primary/40 bg-primary/[0.04] dark:bg-primary/[0.08]"
                                : "border-gray-200/60 dark:border-gray-800 bg-white dark:bg-[#151515] hover:border-gray-300 dark:hover:border-gray-700"
                            }`}
                          >
                            <div className="flex items-start gap-2.5">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => handleToggleQuestion(qId)}
                                onClick={(e) => e.stopPropagation()}
                                className="mt-0.5"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-gray-900 dark:text-gray-100 font-medium line-clamp-2 leading-relaxed">
                                  {q.question}
                                </p>
                                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                  {/* Normalized Crop badge (Requirement 4) */}
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                                    <Leaf className="h-2.5 w-2.5" />
                                    Normalized: {q.details?.normalised_crop || crop?.name}
                                  </span>

                                  {q.details?.crop && q.details.crop !== q.details?.normalised_crop && (
                                    <span className="text-[10px] text-muted-foreground truncate">
                                      Raw: {typeof q.details.crop === "string" ? q.details.crop : ""}
                                    </span>
                                  )}

                                  {(q.details?.state || q.details?.district) && (
                                    <span className="text-[10px] text-muted-foreground/80 truncate">
                                      {[q.details?.district, q.details?.state].filter(Boolean).join(", ")}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>

                {/* Questions Pagination Footer (Backend-driven) */}
                {totalQuestions > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 mt-2 border-t border-gray-100 dark:border-gray-800 text-xs text-muted-foreground select-none shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px]">
                        {questionRangeStart}–{questionRangeEnd} of {totalQuestions.toLocaleString()}
                      </span>
                      <div className="flex items-center gap-1.5 ml-1">
                        <span className="text-[11px] text-muted-foreground/70">Per page:</span>
                        <select
                          value={questionLimit}
                          onChange={(e) => setQuestionLimit(Number(e.target.value))}
                          disabled={isQuestionsFetching}
                          className="h-6 px-1.5 text-[11px] rounded bg-gray-50 dark:bg-white/[0.04] border border-gray-200 dark:border-gray-800 text-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                        >
                          <option value={10}>10</option>
                          <option value={20}>20</option>
                          <option value={50}>50</option>
                          <option value={100}>100</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-foreground disabled:opacity-30"
                        disabled={questionPage <= 1 || isQuestionsFetching}
                        onClick={() => setQuestionPage(1)}
                        title="First Page"
                      >
                        <ChevronsLeft className="h-3 w-3" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-foreground disabled:opacity-30"
                        disabled={questionPage <= 1 || isQuestionsFetching}
                        onClick={() => setQuestionPage((p) => Math.max(1, p - 1))}
                        title="Previous Page"
                      >
                        <ChevronLeft className="h-3 w-3" />
                      </Button>

                      <span className="px-1.5 text-[11px] font-medium text-foreground">
                        {questionPage} / {totalQuestionPages}
                      </span>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-foreground disabled:opacity-30"
                        disabled={questionPage >= totalQuestionPages || isQuestionsFetching}
                        onClick={() => setQuestionPage((p) => Math.min(totalQuestionPages, p + 1))}
                        title="Next Page"
                      >
                        <ChevronRight className="h-3 w-3" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-foreground disabled:opacity-30"
                        disabled={questionPage >= totalQuestionPages || isQuestionsFetching}
                        onClick={() => setQuestionPage(totalQuestionPages)}
                        title="Last Page"
                      >
                        <ChevronsRight className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Replacement Crop Selector (Requirement 6, 7, 8) */}
              <div className="flex flex-col min-h-0 p-4 sm:p-5">
                <div className="flex items-center justify-between gap-2 pb-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
                  <div className="flex items-center gap-2">
                    <Leaf className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                      Select Replacement Crop
                    </span>
                    <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                      Required
                    </Badge>
                  </div>
                </div>

                {/* Replacement Crop Search & Active Selection */}
                <div className="pt-3 pb-2 space-y-2 shrink-0">
                  <div className="relative">
                    <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search replacement crop by name or alias..."
                      value={cropSearch}
                      onChange={(e) => setCropSearch(e.target.value)}
                      className="h-8 pl-8 text-xs rounded-lg"
                    />
                  </div>

                  {selectedReplacementCrop && (
                    <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-500/30 text-xs">
                      <div className="flex items-center gap-1.5 truncate">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span className="text-[11px] text-muted-foreground">Selected:</span>
                        <span className="font-semibold text-emerald-700 dark:text-emerald-300 truncate">
                          {selectedReplacementCrop.name}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedReplacementCrop(null)}
                        className="text-[11px] text-muted-foreground hover:text-foreground ml-2 font-medium cursor-pointer"
                      >
                        Clear
                      </button>
                    </div>
                  )}
                </div>

                {/* Replacement Crops Scrollable List */}
                <ScrollArea className="flex-1 -mx-2 px-2 min-h-0">
                  {isCropsLoading ? (
                    <div className="py-8 flex justify-center text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  ) : availableReplacementCrops.length === 0 ? (
                    <div className="text-center py-8 text-xs text-muted-foreground">
                      No other crops found in crop master
                    </div>
                  ) : filteredReplacementCrops.length === 0 ? (
                    <div className="text-center py-8 text-xs text-muted-foreground">
                      No crops matching "{cropSearch}"
                    </div>
                  ) : (
                    <div className="space-y-2 py-1">
                      {paginatedCrops.map((c) => {
                        const cleanCId = getCleanId(c._id);
                        const isSelected = selectedReplacementCrop && getCleanId(selectedReplacementCrop._id) === cleanCId;
                        const aliasList = (c.aliases || [])
                          .map((a: any) =>
                            typeof a === "string"
                              ? a
                              : a.english_representation || a.native_representation || ""
                          )
                          .filter(Boolean);

                        return (
                          <div
                            key={cleanCId}
                            onClick={() => setSelectedReplacementCrop(c)}
                            className={`p-3 rounded-xl border text-left cursor-pointer transition-all select-none ${
                              isSelected
                                ? "border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/20 shadow-xs ring-1 ring-emerald-500/30"
                                : "border-gray-200/60 dark:border-gray-800 bg-white dark:bg-[#151515] hover:border-gray-300 dark:hover:border-gray-700"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-gray-900 dark:text-white truncate">
                                    {c.name}
                                  </span>
                                  {c.scientificName && (
                                    <span className="text-[11px] italic text-muted-foreground truncate">
                                      ({c.scientificName})
                                    </span>
                                  )}
                                </div>

                                {/* Vernacular Aliases Chips (Requirement 6) */}
                                {aliasList.length > 0 ? (
                                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                                    {aliasList.slice(0, 4).map((alias, i) => (
                                      <span
                                        key={i}
                                        className="inline-flex rounded-md bg-gray-100 dark:bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-gray-600 dark:text-gray-300"
                                      >
                                        {alias}
                                      </span>
                                    ))}
                                    {aliasList.length > 4 && (
                                      <span className="text-[10px] text-muted-foreground">
                                        +{aliasList.length - 4} more
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-muted-foreground/60 italic block mt-1">
                                    No aliases registered
                                  </span>
                                )}
                              </div>

                              <div
                                className={`h-4 w-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                                  isSelected
                                    ? "border-emerald-500 bg-emerald-500 text-white"
                                    : "border-gray-300 dark:border-gray-700 bg-transparent"
                                }`}
                              >
                                {isSelected && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>

                {/* Replacement Crops Pagination Footer */}
                {filteredReplacementCrops.length > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 mt-2 border-t border-gray-100 dark:border-gray-800 text-xs text-muted-foreground select-none shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px]">
                        {cropStartIndex + 1}–{cropEndIndex} of {filteredReplacementCrops.length}
                      </span>
                      <div className="flex items-center gap-1.5 ml-1">
                        <span className="text-[11px] text-muted-foreground/70">Per page:</span>
                        <select
                          value={cropLimit}
                          onChange={(e) => setCropLimit(Number(e.target.value))}
                          className="h-6 px-1.5 text-[11px] rounded bg-gray-50 dark:bg-white/[0.04] border border-gray-200 dark:border-gray-800 text-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                          <option value={10}>10</option>
                          <option value={20}>20</option>
                          <option value={50}>50</option>
                          <option value={100}>100</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-foreground disabled:opacity-30"
                        disabled={validCropPage <= 1}
                        onClick={() => setCropPage(1)}
                        title="First Page"
                      >
                        <ChevronsLeft className="h-3 w-3" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-foreground disabled:opacity-30"
                        disabled={validCropPage <= 1}
                        onClick={() => setCropPage((p) => Math.max(1, p - 1))}
                        title="Previous Page"
                      >
                        <ChevronLeft className="h-3 w-3" />
                      </Button>

                      <span className="px-1.5 text-[11px] font-medium text-foreground">
                        {validCropPage} / {totalCropPages}
                      </span>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-foreground disabled:opacity-30"
                        disabled={validCropPage >= totalCropPages}
                        onClick={() => setCropPage((p) => Math.min(totalCropPages, p + 1))}
                        title="Next Page"
                      >
                        <ChevronRight className="h-3 w-3" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-foreground disabled:opacity-30"
                        disabled={validCropPage >= totalCropPages}
                        onClick={() => setCropPage(totalCropPages)}
                        title="Last Page"
                      >
                        <ChevronsRight className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Informative Migration Banner when questions exist */}
        {totalQuestions > 0 && (
          <div className="flex-shrink-0 px-5 sm:px-6 py-2.5 bg-gray-50/80 dark:bg-white/[0.02] border-t border-gray-100 dark:border-gray-800 text-xs">
            {isFullMigration ? (
              <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>
                  <strong>Full Migration & Deletion:</strong> All {totalQuestions.toLocaleString()} questions will be
                  reassigned to{" "}
                  <strong>{selectedReplacementCrop?.name || "(select a crop)"}</strong> and{" "}
                  <strong>"{crop?.name}"</strong> will be permanently deleted from crop master.
                </span>
              </div>
            ) : selectedCount > 0 ? (
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <Info className="h-4 w-4 shrink-0" />
                <span>
                  <strong>Partial Migration:</strong> {selectedCount.toLocaleString()} of {totalQuestions.toLocaleString()} questions will
                  be reassigned to{" "}
                  <strong>{selectedReplacementCrop?.name || "(select a crop)"}</strong>.{" "}
                  "{crop?.name}" will <strong>remain in crop master</strong> until all questions are
                  reassigned.
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <HelpCircle className="h-4 w-4 shrink-0" />
                <span>Select questions and a replacement crop to proceed.</span>
              </div>
            )}
          </div>
        )}

        {/* Modal Footer */}
        <div className="flex-shrink-0 px-5 sm:px-6 py-3.5 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3 bg-white dark:bg-[#111]">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isMutating}
            className="text-xs h-9"
          >
            Cancel
          </Button>

          <div className="flex items-center gap-2">
            {totalQuestions === 0 ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleSubmit}
                disabled={isMutating}
                className="text-xs h-9 bg-rose-600 hover:bg-rose-700 text-white gap-1.5"
              >
                {isMutating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <Trash2 className="h-3.5 w-3.5" />
                Delete Crop Directly
              </Button>
            ) : isFullMigration ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleSubmit}
                disabled={isMutating || !selectedReplacementCrop}
                className="text-xs h-9 bg-rose-600 hover:bg-rose-700 text-white gap-1.5"
              >
                {isMutating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <Trash2 className="h-3.5 w-3.5" />
                Reassign All ({totalQuestions.toLocaleString()}) & Delete Crop
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={handleSubmit}
                disabled={isMutating || !selectedReplacementCrop || selectedCount === 0}
                className="text-xs h-9 bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
              >
                {isMutating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <ArrowRight className="h-3.5 w-3.5" />
                Reassign Selected ({selectedCount.toLocaleString()}) Questions
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
