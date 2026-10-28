import { useState, useMemo, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
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
} from "lucide-react";
import { toast } from "@/shared/components/toast";
import { useGetCropAffectedQuestions } from "@/hooks/api/crop/useGetCropAffectedQuestions";
import { useGetNormalisedCrops } from "@/hooks/api/crop/useGetNormalisedCrops";
import { useDeleteCrop } from "@/hooks/api/crop/useDeleteCrop";
import type { ICropResponse, ICropAlias } from "@/hooks/services/cropService";

interface DeleteCropModalProps {
  crop: ICropResponse | null;
  open: boolean;
  onClose: () => void;
}

export const DeleteCropModal = ({ crop, open, onClose }: DeleteCropModalProps) => {
  const cropId = crop?._id;

  // 1. Fetch questions affected by this crop
  const {
    data: affectedData,
    isLoading: isQuestionsLoading,
    refetch: refetchQuestions,
  } = useGetCropAffectedQuestions(cropId, open);

  const questions = affectedData?.questions ?? [];
  const totalQuestions = questions.length;

  // 2. Fetch all normalized crops directly from crop_master
  const { data: allCropsData, isLoading: isCropsLoading } = useGetNormalisedCrops(open);

  // Filter out the crop being deleted from replacement candidates
  const availableReplacementCrops = useMemo(() => {
    if (!allCropsData?.crops || !crop) return [];
    const deletingId = typeof crop._id === "object" ? (crop._id as any)?.$oid || String(crop._id) : String(crop._id || "");
    const deletingName = crop.name.toLowerCase().trim();
    return allCropsData.crops.filter((c) => {
      const cid = typeof c._id === "object" ? (c._id as any)?.$oid || String(c._id) : String(c._id || "");
      const cname = c.name.toLowerCase().trim();
      return cid !== deletingId && cname !== deletingName;
    });
  }, [allCropsData?.crops, crop]);

  // Mutation
  const { mutateAsync: deleteOrReassign, isPending: isMutating } = useDeleteCrop();

  // Local state
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string>>(new Set());
  const [selectedReplacementCrop, setSelectedReplacementCrop] = useState<ICropResponse | null>(null);
  const [questionSearch, setQuestionSearch] = useState("");
  const [cropSearch, setCropSearch] = useState("");

  // Initialize all questions as selected when questions load
  useEffect(() => {
    if (questions.length > 0) {
      setSelectedQuestionIds(new Set(questions.map((q) => q._id)));
    } else {
      setSelectedQuestionIds(new Set());
    }
    setSelectedReplacementCrop(null);
    setQuestionSearch("");
    setCropSearch("");
  }, [cropId, questions.length]);

  // Filtered questions
  const filteredQuestions = useMemo(() => {
    if (!questionSearch.trim()) return questions;
    const q = questionSearch.toLowerCase();
    return questions.filter(
      (item) =>
        item.question?.toLowerCase().includes(q) ||
        item.details?.state?.toLowerCase().includes(q) ||
        item.details?.district?.toLowerCase().includes(q) ||
        item._id.toLowerCase().includes(q)
    );
  }, [questions, questionSearch]);

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

  // Selection handlers
  const handleToggleQuestion = (id: string) => {
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

  const isAllSelected =
    filteredQuestions.length > 0 &&
    filteredQuestions.every((q) => selectedQuestionIds.has(q._id));

  const isSomeSelected =
    filteredQuestions.some((q) => selectedQuestionIds.has(q._id)) && !isAllSelected;

  const handleToggleSelectAll = () => {
    setSelectedQuestionIds((prev) => {
      const next = new Set(prev);
      if (isAllSelected) {
        // Unselect filtered questions
        filteredQuestions.forEach((q) => next.delete(q._id));
      } else {
        // Select all filtered questions
        filteredQuestions.forEach((q) => next.add(q._id));
      }
      return next;
    });
  };

  const selectedCount = selectedQuestionIds.size;
  const isFullMigration = selectedCount >= totalQuestions && totalQuestions > 0;

  // Submission handler
  const handleSubmit = async () => {
    if (!cropId || !crop) return;

    // Zero questions: Direct deletion
    if (totalQuestions === 0) {
      const toastId = toast.loading(`Deleting crop "${crop.name}"...`);
      try {
        const res = await deleteOrReassign({
          cropId,
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

    if (selectedCount === 0) {
      toast.warning("No questions selected", {
        desc: "Please select at least one question to reassign, or select all to delete the crop.",
      });
      return;
    }

    const toastId = toast.loading(
      isFullMigration
        ? `Reassigning questions and deleting "${crop.name}"...`
        : `Reassigning ${selectedCount} questions to "${selectedReplacementCrop.name}"...`
    );

    try {
      const res = await deleteOrReassign({
        cropId,
        payload: {
          replacementCropId: selectedReplacementCrop._id,
          questionIds: Array.from(selectedQuestionIds),
        },
      });

      toast.dismiss(toastId);

      if (res?.cropDeleted || isFullMigration) {
        toast.success(`Crop "${crop.name}" deleted successfully`, {
          desc: `All ${selectedCount} questions reassigned to "${selectedReplacementCrop.name}".`,
        });
        onClose();
      } else {
        toast.info(`Questions reassigned successfully`, {
          desc: `${res?.reassignedCount || selectedCount} questions updated to "${selectedReplacementCrop.name}". "${crop.name}" remains until all questions are migrated.`,
        });
        // Refetch affected questions so the modal shows the updated remaining list
        refetchQuestions();
      }
    } catch (err: any) {
      toast.dismiss(toastId);
      toast.error("Operation failed", {
        desc: err?.message || "Failed to process crop deletion or reassignment",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden sm:rounded-2xl border-gray-200 dark:border-gray-800 bg-white dark:bg-[#111]">
        {/* Header */}
        <div className="flex-shrink-0 p-5 border-b border-gray-100 dark:border-gray-800/80 bg-gray-50/50 dark:bg-white/[0.02]">
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
                  "Checking questions using this crop..."
                ) : totalQuestions === 0 ? (
                  "This crop has no associated questions. It can be safely deleted directly."
                ) : (
                  <>
                    This crop is currently referenced by{" "}
                    <span className="font-semibold text-foreground">{totalQuestions}</span> questions.
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
              <p className="text-sm">Scanning questions with normalized crop "{crop?.name}"...</p>
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
            /* ── Questions exist: Dual-panel layout ── */
            <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-100 dark:divide-gray-800">
              {/* Left Column: Affected Questions */}
              <div className="flex flex-col min-h-0 p-4">
                <div className="flex items-center justify-between gap-2 pb-3 border-b border-gray-100 dark:border-gray-800">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-primary" />
                    <span className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                      Affected Questions
                    </span>
                    <Badge variant="secondary" className="text-[11px] font-mono px-2 py-0">
                      {selectedCount} of {totalQuestions}
                    </Badge>
                  </div>
                </div>

                {/* Question Search & Select All */}
                <div className="pt-3 pb-2 space-y-2">
                  <div className="relative">
                    <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search questions by text or ID..."
                      value={questionSearch}
                      onChange={(e) => setQuestionSearch(e.target.value)}
                      className="h-8 pl-8 text-xs rounded-lg"
                    />
                  </div>

                  <div className="flex items-center justify-between px-1 text-xs">
                    <label className="flex items-center gap-2 cursor-pointer select-none font-medium text-gray-700 dark:text-gray-300">
                      <Checkbox
                        checked={isAllSelected ? true : isSomeSelected ? "indeterminate" : false}
                        onCheckedChange={handleToggleSelectAll}
                        id="select-all-questions"
                      />
                      <span>Select All Questions</span>
                    </label>
                    <span className="text-[11px] text-muted-foreground">
                      {filteredQuestions.length} shown
                    </span>
                  </div>
                </div>

                {/* Questions Scrollable List */}
                <ScrollArea className="flex-1 -mx-2 px-2">
                  <div className="space-y-2 py-1">
                    {filteredQuestions.length === 0 ? (
                      <div className="text-center py-8 text-xs text-muted-foreground">
                        No questions match "{questionSearch}"
                      </div>
                    ) : (
                      filteredQuestions.map((q) => {
                        const isSelected = selectedQuestionIds.has(q._id);
                        return (
                          <div
                            key={q._id}
                            onClick={() => handleToggleQuestion(q._id)}
                            className={`p-3 rounded-xl border text-left cursor-pointer transition-all select-none ${
                              isSelected
                                ? "border-primary/40 bg-primary/[0.04] dark:bg-primary/[0.08]"
                                : "border-gray-200/60 dark:border-gray-800 bg-white dark:bg-[#151515] hover:border-gray-300 dark:hover:border-gray-700"
                            }`}
                          >
                            <div className="flex items-start gap-2.5">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => handleToggleQuestion(q._id)}
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
              </div>

              {/* Right Column: Replacement Crop Selector (Requirement 6, 7, 8) */}
              <div className="flex flex-col min-h-0 p-4">
                <div className="flex items-center justify-between gap-2 pb-3 border-b border-gray-100 dark:border-gray-800">
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

                {/* Replacement Crop Search */}
                <div className="pt-3 pb-2">
                  <div className="relative">
                    <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search replacement crop by name or alias..."
                      value={cropSearch}
                      onChange={(e) => setCropSearch(e.target.value)}
                      className="h-8 pl-8 text-xs rounded-lg"
                    />
                  </div>
                </div>

                {/* Replacement Crops Scrollable List */}
                <ScrollArea className="flex-1 -mx-2 px-2">
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
                      {filteredReplacementCrops.map((c) => {
                        const isSelected = selectedReplacementCrop?._id === c._id;
                        const aliasList = (c.aliases || [])
                          .map((a: any) =>
                            typeof a === "string"
                              ? a
                              : a.english_representation || a.native_representation || ""
                          )
                          .filter(Boolean);

                        return (
                          <div
                            key={c._id}
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
              </div>
            </div>
          )}
        </div>

        {/* Informative Migration Banner when questions exist */}
        {totalQuestions > 0 && (
          <div className="flex-shrink-0 px-5 py-2.5 bg-gray-50/80 dark:bg-white/[0.02] border-t border-gray-100 dark:border-gray-800 text-xs">
            {isFullMigration ? (
              <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>
                  <strong>Full Migration & Deletion:</strong> All {totalQuestions} questions will be
                  reassigned to{" "}
                  <strong>{selectedReplacementCrop?.name || "(select a crop)"}</strong> and{" "}
                  <strong>"{crop?.name}"</strong> will be permanently deleted from crop master.
                </span>
              </div>
            ) : selectedCount > 0 ? (
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <Info className="h-4 w-4 shrink-0" />
                <span>
                  <strong>Partial Migration:</strong> {selectedCount} of {totalQuestions} questions will
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
        <div className="flex-shrink-0 px-5 py-3.5 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3 bg-white dark:bg-[#111]">
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
                disabled={isMutating || !selectedReplacementCrop || selectedCount === 0}
                className="text-xs h-9 bg-rose-600 hover:bg-rose-700 text-white gap-1.5"
              >
                {isMutating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <Trash2 className="h-3.5 w-3.5" />
                Reassign All & Delete Crop
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
                Reassign Selected ({selectedCount}) Questions
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
