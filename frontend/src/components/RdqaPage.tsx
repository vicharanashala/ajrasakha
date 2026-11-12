import { useState, useMemo, useEffect } from "react";
import { Calendar, Eye, X, ChevronLeft, ChevronRight, BarChart3, Pencil, Edit } from "lucide-react";
import { useRdqaQuestions, type RdqaQuestion } from "@/hooks/api/question/useRdqaQuestions";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { Button } from "@/components/atoms/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/atoms/popover";
import { Calendar as CalendarComponent } from "@/components/atoms/calendar";
import { ScrollToTopButton } from "@/components/atoms/ScrollToTopButton";
import Spinner from "@/components/atoms/spinner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from "@/components/atoms/dialog";
import { Card, CardContent } from "@/components/atoms/card";
import { format, subDays } from "date-fns";
import { cn } from "@/lib/utils";
import { EditRdqaAnswerModal } from "./EditRdqaAnswerModal";
import { useQueryClient } from "@tanstack/react-query";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/atoms/context-menu";
import { AddOrEditQuestionDialog } from "@/features/question-table-page/AddOrEditQuestionDialog";
import type { IDetailedQuestion, QuestionStatus, UserRole } from "@/types";
import { useUpdateQuestion } from "@/hooks/api/question/useUpdateQuestion";
import { toast } from "sonner";

// Convert RdqaQuestion to IDetailedQuestion for the full edit dialog
function convertRdqaToDetailedQuestion(rdqaQuestion: RdqaQuestion): IDetailedQuestion {
  return {
    _id: rdqaQuestion.question._id,
    userId: rdqaQuestion.authorId,
    question: rdqaQuestion.question.question,
    context: rdqaQuestion.context || "",
    aiInitialAnswer: rdqaQuestion.answer.answer,
    status: "closed" as QuestionStatus,
    totalAnswersCount: 1,
    priority: "medium",
    metrics: {
      accepted: 0,
      pending: 0,
      rejected: 0,
      total: 0,
    },
    details: {
      state: rdqaQuestion.question.details?.state || "",
      district: rdqaQuestion.question.details?.district || "",
      crop: rdqaQuestion.question.details?.crop || "",
      season: "",
      domain: [],
    },
    source: "AJRASAKHA",
    createdAt: undefined,
    updatedAt: undefined,
    review_level_number: undefined,
    closedAt: rdqaQuestion.closedAt,
  };
}

const PAGE_HEIGHT_CLASSES = "h-[calc(100dvh-7.5rem)] md:h-[calc(100dvh-8.5rem)]";
const ITEMS_PER_PAGE = 12;
const API_LIMIT = 50;

function formatDateStr(date: Date | undefined): string {
  return date ? format(date, "yyyy-MM-dd") : "";
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

function FormattedText({ text }: { text: string }) {
  return (
    <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed font-normal">
      {text}
    </pre>
  );
}

export const RdqaPage = () => {
  const { data: currentUser } = useGetCurrentUser({});
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(subDays(new Date(), 1));
  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState("");
  const [selectedQuestion, setSelectedQuestion] = useState<RdqaQuestion | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [editQuestion, setEditQuestion] = useState<RdqaQuestion | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const queryClient = useQueryClient();

  // Full edit dialog state
  const [fullEditQuestion, setFullEditQuestion] = useState<IDetailedQuestion | null>(null);
  const [updatedData, setUpdatedData] = useState<IDetailedQuestion | null>(null);
  const [showFullEditModal, setShowFullEditModal] = useState(false);
  const { mutateAsync: updateQuestion, isPending: updatingQuestion } = useUpdateQuestion();

  const { data: rdqaResponse, isLoading, error } = useRdqaQuestions(formatDateStr(selectedDate), API_LIMIT);
  const debouncedSearch = useDebounce(search, 300);

  const questions = rdqaResponse?.questions ?? [];

  const filteredQuestions = useMemo(() => {
    if (!questions) return [];
    if (!debouncedSearch.trim()) return questions;
    const searchLower = debouncedSearch.toLowerCase();
    return questions.filter(
      (q) =>
        q.question?.question?.toLowerCase().includes(searchLower) ||
        q.answer?.answer?.toLowerCase().includes(searchLower) ||
        q.question?.details?.crop?.toLowerCase().includes(searchLower) ||
        q.question?.details?.state?.toLowerCase().includes(searchLower)
    );
  }, [questions, debouncedSearch]);

  const totalQuestions = filteredQuestions.length;
  const totalPages = Math.ceil(totalQuestions / ITEMS_PER_PAGE);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedDate, debouncedSearch]);

  const paginatedQuestions = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredQuestions.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredQuestions, currentPage]);

  // Handle full question edit from context menu
  const handleFullEdit = (rdqaQuestion: RdqaQuestion) => {
    const detailedQuestion = convertRdqaToDetailedQuestion(rdqaQuestion);
    setFullEditQuestion(detailedQuestion);
    setUpdatedData(detailedQuestion);
    setShowFullEditModal(true);
  };

  // Handle save from the full edit dialog
  const handleUpdateQuestion = async (
    mode: "add" | "edit",
    entityId?: string,
    flagReason?: string,
    status?: QuestionStatus,
  ) => {
    try {
      if (!entityId) {
        toast.error(`Failed to identify and ${mode} the selected question.`);
        return;
      }

      if (!updatedData) {
        console.error("No data available to update.");
        return;
      }

      if (!updatedData.question?.trim()) {
        toast.error("Question text is required.");
        return;
      }

      if (!updatedData.priority) {
        toast.error("Priority is required.");
        return;
      }

      if (!updatedData.details?.state?.trim()) {
        toast.error("State is required.");
        return;
      }

      if (!updatedData.details?.district?.trim()) {
        toast.error("District is required.");
        return;
      }

      if (!updatedData.details?.crop?.trim()) {
        toast.error("Crop is required.");
        return;
      }

      if (!updatedData.details?.season?.trim()) {
        toast.error("Season is required.");
        return;
      }

      if (!updatedData.details?.domain?.length) {
        toast.error("Domain is required.");
        return;
      }

      // Build the update payload matching questions-table pattern
      const original = fullEditQuestion;
      const changed: Partial<IDetailedQuestion> = { _id: entityId };

      if (original) {
        const editableKeys: (keyof IDetailedQuestion)[] = [
          "question",
          "context",
          "aiInitialAnswer",
          "priority",
          "status",
          "isTrainingQuestion",
        ];
        for (const key of editableKeys) {
          if (updatedData[key] !== original[key]) {
            (changed as Record<string, unknown>)[key] = updatedData[key];
          }
        }
        if (
          JSON.stringify(updatedData.details) !==
          JSON.stringify(original.details)
        ) {
          changed.details = updatedData.details;
        }
        // Test-question toggle
        if (!!updatedData.isTesting !== !!original.isTesting) {
          changed.isTesting = !!updatedData.isTesting;
          changed.isAutoAllocate = !updatedData.isTesting;
        }
      } else {
        // No original to diff against — fall back to sending the edited data
        Object.assign(changed, updatedData);
      }

      await updateQuestion(changed);

      toast.success("Question updated successfully.");
      setShowFullEditModal(false);
      setFullEditQuestion(null);
      setUpdatedData(null);
      
      // Refresh the RDQA questions list
      queryClient.invalidateQueries({ queryKey: ["rdqa-questions"] });
    } catch (error) {
      console.error("Error updating question:", error);
      toast.error("Failed to update question. Please try again.");
    }
  };

  if (!currentUser || currentUser.role !== "admin") {
    return (
      <div className={cn("flex items-center justify-center", PAGE_HEIGHT_CLASSES)}>
        <p className="text-muted-foreground">You don&apos;t have permission to view this page.</p>
      </div>
    );
  }
  return (
    <>
      <div className={cn("flex flex-col h-full overflow-hidden", PAGE_HEIGHT_CLASSES)}>
        <div className="flex-shrink-0 border-b bg-background/50 px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-lg font-semibold">RDQA Review</h1>
              <p className="text-sm text-muted-foreground">Review finalized questions from a specific date</p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDetailsModal(true)}
              >
                <BarChart3 className="h-4 w-4 mr-1" />
                Details
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full sm:w-auto justify-start text-left font-normal">
                    <Calendar className="mr-2 h-4 w-4" />
                    {selectedDate ? format(selectedDate, "PPP") : "Select Date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <CalendarComponent
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    initialFocus
                    disabled={(date) => date > new Date() || date < new Date("2020-01-01")}
                  />
                </PopoverContent>
              </Popover>
              <input
                type="text"
                placeholder="Search questions..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Spinner />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
              <p className="text-muted-foreground">Failed to load questions.</p>
              <p className="text-xs text-muted-foreground">Please try again later.</p>
            </div>
          ) : filteredQuestions.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
              <p className="text-muted-foreground">No questions found for this date.</p>
              <p className="text-xs text-muted-foreground">Try selecting a different date.</p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-border">
                {paginatedQuestions.map((question) => (
                  <ContextMenu key={question._id}>
                    <ContextMenuTrigger>
                      <div className="border-b border-border p-4 transition-colors hover:bg-muted/30 cursor-pointer">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm leading-snug">{question.question?.question || "N/A"}</p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              {question.question?.details?.crop && (
                                <span className="rounded bg-green-100 px-1.5 py-0.5 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                  {question.question.details.crop}
                                </span>
                              )}
                              {question.question?.details?.state && (
                                <span className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                                  {question.question.details.state}
                                </span>
                              )}
                              {question.closedAt && (
                                <span className="text-muted-foreground/70">
                                  Closed: {new Date(question.closedAt).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <Button variant="outline" size="sm" onClick={() => setSelectedQuestion(question)} className="shrink-0">
                              <Eye className="h-4 w-4 mr-1" />View
                            </Button>
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => {
                                setEditQuestion(question);
                                setShowEditModal(true);
                              }}
                              className="shrink-0 bg-primary hover:bg-primary/90"
                            >
                              <Pencil className="h-4 w-4 mr-1" />Edit
                            </Button>
                          </div>
                        </div>
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem
                        onSelect={(e) => {
                          // SetTimeout is essential because it will resolve the UI Overlay conflicts happening due to edit modal being opened before closing the context menu
                          setTimeout(() => {
                            e.preventDefault();
                            handleFullEdit(question);
                          }, 0);
                        }}
                      >
                        <Edit className="w-4 h-4 mr-2 text-blue-500" />
                        Edit
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem onClick={() => setSelectedQuestion(question)}>
                        <Eye className="w-4 h-4 mr-2 text-primary" />
                        View
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                ))}
              </div>
              <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/50 sticky bottom-0">
                <div className="text-sm text-muted-foreground">
                  Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredQuestions.length)} of {filteredQuestions.length} questions
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="h-8 px-3"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm font-medium px-2">
                    {currentPage} / {totalPages || 1}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages || 1, p + 1))}
                    disabled={currentPage >= (totalPages || 1)}
                    className="h-8 px-3"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
        <ScrollToTopButton />
      </div>

      {selectedQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelectedQuestion(null)} />
          <div className="relative z-10 max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-background p-6 shadow-lg m-4">
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <h2 className="text-lg font-semibold mb-2">Question Details</h2>
                <div className="flex flex-wrap gap-2 text-xs">
                  {selectedQuestion.question?.details?.crop && (
                    <span className="rounded bg-green-100 px-2 py-1 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      {selectedQuestion.question.details.crop}
                    </span>
                  )}
                  {selectedQuestion.question?.details?.state && (
                    <span className="rounded bg-blue-100 px-2 py-1 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                      {selectedQuestion.question.details.state}
                    </span>
                  )}
                  {selectedQuestion.question?.details?.district && (
                    <span className="rounded bg-purple-100 px-2 py-1 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                      {selectedQuestion.question.details.district}
                    </span>
                  )}
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setSelectedQuestion(null)}>
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="mb-6">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">Question</h3>
              <div className="rounded-lg bg-muted/50 p-4">
                <FormattedText text={selectedQuestion.question?.question || "N/A"} />
              </div>
            </div>

            <div className="mb-6 grid grid-cols-2 gap-4 text-sm">
              <div><span className="font-medium text-muted-foreground">Source:</span><p className="mt-0.5">{selectedQuestion.question?.source || "N/A"}</p></div>
              <div><span className="font-medium text-muted-foreground">Status:</span><p className="mt-0.5">{selectedQuestion.question?.status || "N/A"}</p></div>
              <div><span className="font-medium text-muted-foreground">Priority:</span><p className="mt-0.5">{selectedQuestion.question?.priority || "N/A"}</p></div>
              <div><span className="font-medium text-muted-foreground">Auto Allocated:</span><p className="mt-0.5">{selectedQuestion.question?.isAutoAllocate ? "Yes" : "No"}</p></div>
              <div><span className="font-medium text-muted-foreground">Created:</span><p className="mt-0.5">{selectedQuestion.question?.createdAt ? new Date(selectedQuestion.question.createdAt).toLocaleString() : "N/A"}</p></div>
              <div><span className="font-medium text-muted-foreground">Closed:</span><p className="mt-0.5">{selectedQuestion.question?.closedAt ? new Date(selectedQuestion.question.closedAt).toLocaleString() : "N/A"}</p></div>
              <div><span className="font-medium text-muted-foreground">Season:</span><p className="mt-0.5">{selectedQuestion.question?.details?.season || "N/A"}</p></div>
              <div><span className="font-medium text-muted-foreground">Domain:</span><p className="mt-0.5">{selectedQuestion.question?.details?.domain?.join(", ") || "N/A"}</p></div>
            </div>

            <div className="border-t my-6" />

            <div className="mb-6">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">Final Answer</h3>
              <div className="rounded-lg bg-muted/50 p-4">
                <FormattedText text={selectedQuestion.answer?.answer || "No answer provided"} />
              </div>
            </div>

            <div className="mb-6 grid grid-cols-2 gap-4 text-sm">
              <div><span className="font-medium text-muted-foreground">Approved By:</span><p className="mt-0.5">{selectedQuestion.answer?.approvedByEmail || selectedQuestion.answer?.approvedBy || "N/A"}</p></div>
              <div><span className="font-medium text-muted-foreground">Author:</span><p className="mt-0.5">{selectedQuestion.authorIdEmail || selectedQuestion.authorId || "N/A"}</p></div>
              {selectedQuestion.answer?.modifiedBy && <div><span className="font-medium text-muted-foreground">Modified By:</span><p className="mt-0.5">{selectedQuestion.answer.modifiedBy}</p></div>}
              <div><span className="font-medium text-muted-foreground">Answer Status:</span><p className="mt-0.5">{selectedQuestion.answer?.status || "N/A"}</p></div>
              <div><span className="font-medium text-muted-foreground">Is Final Answer:</span><p className="mt-0.5">{selectedQuestion.answer?.isFinalAnswer ? "Yes" : "No"}</p></div>
              <div><span className="font-medium text-muted-foreground">Approval Count:</span><p className="mt-0.5">{selectedQuestion.answer?.approvalCount ?? "N/A"}</p></div>
              <div><span className="font-medium text-muted-foreground">Answer Created:</span><p className="mt-0.5">{selectedQuestion.answer?.createdAt ? new Date(selectedQuestion.answer.createdAt).toLocaleString() : "N/A"}</p></div>
              <div><span className="font-medium text-muted-foreground">Answer Updated:</span><p className="mt-0.5">{selectedQuestion.answer?.updatedAt ? new Date(selectedQuestion.answer.updatedAt).toLocaleString() : "N/A"}</p></div>
            </div>
            {selectedQuestion.answer?.sources && selectedQuestion.answer.sources.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">Sources</h3>
                <div className="rounded-lg bg-muted/50 p-4 space-y-3">
                  {selectedQuestion.answer.sources.map((source: any, index: number) => (
                    <div key={index} className="border-b border-border/50 last:border-0 pb-2 last:pb-0">
                      {source.sourceName && <p className="font-medium text-sm">{source.sourceName}</p>}
                      {source.source && <a href={source.source} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline break-all block">{source.source}</a>}
                      {source.page && <p className="text-xs text-muted-foreground mt-1">Page: {source.page}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t my-6" />

            <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
              <div><span className="font-medium">Question ID:</span><p className="mt-0.5 break-all">{selectedQuestion.question?._id || "N/A"}</p></div>
              <div><span className="font-medium">Answer ID:</span><p className="mt-0.5 break-all">{selectedQuestion.answer?._id || "N/A"}</p></div>
              <div><span className="font-medium">Context ID:</span><p className="mt-0.5 break-all">{selectedQuestion.context || "N/A"}</p></div>
              <div><span className="font-medium">Author ID:</span><p className="mt-0.5 break-all">{selectedQuestion.question?.userId || "N/A"}</p></div>
            </div>
          </div>
        </div>
      )}

      {/* Details Modal */}
      <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>RDQA Distribution Details</DialogTitle>
            <DialogDescription>
              Overview of question distribution for {selectedDate ? format(selectedDate, 'PPP') : 'selected date'}
            </DialogDescription>
          </DialogHeader>

          {/* Stats Cards */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-3xl font-bold text-primary">{rdqaResponse?.totalModerators ?? 0}</p>
                <p className="text-sm text-muted-foreground mt-1">Total Moderators</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-3xl font-bold text-primary">{rdqaResponse?.questionsPerModerator ?? 0}</p>
                <p className="text-sm text-muted-foreground mt-1">Questions/Moderator</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-3xl font-bold text-primary">{rdqaResponse?.totalQuestions ?? 0}</p>
                <p className="text-sm text-muted-foreground mt-1">Total Questions</p>
              </CardContent>
            </Card>
          </div>

          {/* Moderator Distribution */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Moderator Distribution</h3>
            <div className="space-y-3">
              {rdqaResponse?.moderatorDistribution?.map((moderator, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-sm font-medium text-primary">{index + 1}</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium">{moderator.approvedByEmail || moderator.approvedBy}</p>
                      <p className="text-xs text-muted-foreground">
                        {moderator.totalAvailable} available · {moderator.selectedCount} selected
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${Math.min(100, (moderator.selectedCount / moderator.totalAvailable) * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-12 text-right">
                      {Math.round((moderator.selectedCount / moderator.totalAvailable) * 100)}%
                    </span>
                  </div>
                </div>
              ))}
              {(!rdqaResponse?.moderatorDistribution || rdqaResponse.moderatorDistribution.length === 0) && (
                <p className="text-sm text-muted-foreground text-center py-4">No moderator data available</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit RDQA Answer Modal */}
      <EditRdqaAnswerModal
        question={editQuestion}
        open={showEditModal}
        onOpenChange={setShowEditModal}
        onSuccess={() => {
          // Refresh the RDQA questions list
          queryClient.invalidateQueries({ queryKey: ["rdqa-questions"] });
        }}
      />

      {/* Full Question Edit Dialog - Same as All Questions tab */}
      <AddOrEditQuestionDialog
        open={showFullEditModal}
        setOpen={setShowFullEditModal}
        updatedData={updatedData}
        setUpdatedData={setUpdatedData}
        onSave={handleUpdateQuestion}
        question={fullEditQuestion}
        userRole={(currentUser?.role as UserRole) || "expert"}
        isLoadingAction={updatingQuestion}
        mode="edit"
      />
    </>
  );
};
