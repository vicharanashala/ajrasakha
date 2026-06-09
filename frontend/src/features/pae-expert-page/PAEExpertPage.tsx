"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle,
  RotateCcw,
  Loader2,
  Send,
  FileText,
  Bot,
  ChevronsRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/atoms/card";
import { Label } from "../../components/atoms/label";
import { Textarea } from "../../components/atoms/textarea";
import { Button } from "../../components/atoms/button";
import {
  useGetAllocatedQuestions,
} from "@/hooks/api/question/useGetAllocatedQuestions";
import { useGetQuestionById } from "@/hooks/api/question/useGetQuestionById";
import { SourceUrlManager } from "../../components/source-url-manager";
import type { IReviewParmeters, SourceItem } from "@/types";
import { ConfirmationModal } from "../../components/confirmation-modal";
import {
  useReviewAnswer,
  type IReviewAnswerPayload,
} from "@/hooks/api/answer/useReviewAnswer";
import { QaHeader } from "../qa-interface-page/QaHeader";
import type { QuestionFilter } from "../qa-interface-page/QA-interface";
import SarvamTranslateDropdown from "@/components/SarvamTranslateDropdown";
import { QuestionDetailsDialog } from "../qa-interface-page/QuestionDetailsDialog";
import { toast } from "@/shared/components/toast";

export const PAEExpertPage = () => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState<string | null>(null);
  const [newAnswer, setNewAnswer] = useState("");
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [remarks, setRemarks] = useState("");
  const [isFinalAnswer, setIsFinalAnswer] = useState(false);
  const [filter] = useState<QuestionFilter>("newest");
  const [translatedText, setTranslatedText] = useState("");
  const [translatedDraftText, setTranslatedDraftText] = useState("");

  const [isLoaded, setIsLoaded] = useState(false);
  const [drafts, setDrafts] = useState<
    Record<string, { answer: string; sources: any[]; remarks: string }>
  >({});

  const scrollRef = useRef<HTMLDivElement>(null);
  const questionItemRefs = useRef<Record<string, HTMLDivElement>>({});

  const preferences = useMemo(
    () => ({
      status: "all" as const,
      state: "all",
      states: [],
      source: "all" as const,
      crop: "all",
      crops: [],
      normalised_crop: "all",
      answersCount: [0, 100] as [number, number],
      dateRange: "all" as const,
      priority: "all" as const,
      domain: "all",
      user: "all",
    }),
    []
  );

  const LIMIT = 10;
  const {
    data: questionPages,
    isLoading: isQuestionsLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useGetAllocatedQuestions(LIMIT, filter, preferences, "allocated", null, "all");

  const questions = useMemo(() => {
    if (!questionPages?.pages) return [];
    return questionPages.pages.flat();
  }, [questionPages]);

  const { data: selectedQuestionData, isLoading: isSelectedQuestionLoading } =
    useGetQuestionById(selectedQuestion, "allocated");

  const { mutateAsync: respondQuestion, isPending: isResponding } = useReviewAnswer();

  const setQuestionRef = (questionId: string, element: HTMLDivElement | null) => {
    if (element) {
      questionItemRefs.current[questionId] = element;
    } else {
      delete questionItemRefs.current[questionId];
    }
  };

  // Load drafts and selected question from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("pae_questionDrafts");
    if (saved) setDrafts(JSON.parse(saved));
    const savedSelected = localStorage.getItem("pae_selectedQuestion");
    if (savedSelected) setSelectedQuestion(savedSelected);
    setIsLoaded(true);
  }, []);

  // Select first question on initial load, or if saved question is no longer in the list
  useEffect(() => {
    if (!isLoaded || !questionPages?.pages || questions.length === 0) return;
    if (selectedQuestion && questions.some((q) => q.id === selectedQuestion)) return;
    const firstId = questions[0]?.id ?? null;
    setSelectedQuestion(firstId);
  }, [isLoaded, questions, questionPages]);

  // Restore draft when question changes
  useEffect(() => {
    if (!selectedQuestion) {
      localStorage.removeItem("pae_selectedQuestion");
      return;
    }
    localStorage.setItem("pae_selectedQuestion", selectedQuestion);
    const draft = drafts[selectedQuestion];
    if (draft) {
      setNewAnswer(draft.answer);
      setSources(draft.sources);
      setRemarks(draft.remarks);
    } else {
      setNewAnswer("");
      setSources([]);
      setRemarks("");
    }
    setTranslatedText("");
    setTranslatedDraftText("");
  }, [selectedQuestion]);

  // Auto-save draft
  useEffect(() => {
    if (!selectedQuestion) return;
    setDrafts((prev) => {
      const existing = prev[selectedQuestion];
      if (
        existing &&
        existing.answer === newAnswer &&
        JSON.stringify(existing.sources) === JSON.stringify(sources) &&
        existing.remarks === remarks
      ) {
        return prev;
      }
      return { ...prev, [selectedQuestion]: { answer: newAnswer, sources, remarks } };
    });
  }, [newAnswer, sources, remarks, selectedQuestion]);

  useEffect(() => {
    if (!isLoaded) return;
    localStorage.setItem("pae_questionDrafts", JSON.stringify(drafts));
  }, [drafts, isLoaded]);

  // Pre-fill AI answer
  useEffect(() => {
    if (!selectedQuestion || !selectedQuestionData) return;
    const hasPrefilledAnswer =
      selectedQuestionData.aiInitialAnswer || selectedQuestionData.aiApprovedAnswer;
    if (!hasPrefilledAnswer) return;
    const draft = drafts[selectedQuestion];
    if (!newAnswer && !draft?.answer) {
      const prefill =
        selectedQuestionData.aiInitialAnswer ||
        selectedQuestionData.aiApprovedAnswer ||
        "";
      if (prefill) setNewAnswer(prefill);
    }
    if (
      selectedQuestionData.source === "AJRASAKHA" &&
      selectedQuestionData.aiApprovedSources?.length &&
      !draft?.sources?.length
    ) {
      setSources(selectedQuestionData.aiApprovedSources);
    }
  }, [selectedQuestionData]);

  // Scroll to selected question
  useEffect(() => {
    setIsFinalAnswer(false);
    if (!selectedQuestion || !scrollRef.current) return;
    const timer = setTimeout(() => {
      const el = questionItemRefs.current[selectedQuestion];
      if (el && scrollRef.current) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [selectedQuestion]);

  // Pagination
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      if (scrollTop + clientHeight >= scrollHeight - 10) {
        if (hasNextPage && !isFetchingNextPage) fetchNextPage();
      }
    };
    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const handleReset = () => {
    setNewAnswer("");
    setTranslatedDraftText("");
    setSources([]);
    setRemarks("");
  };

  const handleSubmitResponse = async (
    status?: "accepted" | "rejected" | "modified",
    parameters?: IReviewParmeters,
    currentReviewingAnswerId?: string,
    rejectionReason?: string,
    overrideAnswer?: string,
  ) => {
    if (!selectedQuestion || isResponding) return;
    setIsSidebarCollapsed(false);

    const requiresSources = !status || status === "rejected" || status === "modified";
    if (requiresSources && sources.length === 0) {
      toast.error("At least one source is required!");
      return;
    }

    const payload = { questionId: selectedQuestion, parameters } as IReviewAnswerPayload;

    const answerToSubmit = overrideAnswer ?? newAnswer;

    if (!status) {
      payload.answer = answerToSubmit;
      payload.sources = overrideAnswer ? [] : sources;
      payload.remarks = overrideAnswer ? "AI Approved Answer" : remarks;
    }
    if (status === "accepted") {
      payload.status = "accepted";
      payload.approvedAnswer = currentReviewingAnswerId;
    }
    if (status === "rejected") {
      payload.status = "rejected";
      payload.rejectedAnswer = currentReviewingAnswerId;
      payload.reasonForRejection = rejectionReason;
      payload.answer = newAnswer;
      payload.sources = sources;
      payload.remarks = remarks;
    }
    if (status === "modified") {
      payload.status = "modified";
      payload.modifiedAnswer = currentReviewingAnswerId;
      payload.reasonForModification = rejectionReason;
      payload.answer = newAnswer;
      payload.sources = sources;
    }
    payload.type = "allocated";

    try {
      await respondQuestion(payload);
      setDrafts((prev) => {
        const updated = { ...prev };
        delete updated[selectedQuestion];
        return updated;
      });
      setSelectedQuestion(null);
      handleReset();
    } catch (error) {
      console.error("Failed to submit:", error);
    }
  };

  const handleQuestionClick = (id: string) => {
    setSelectedQuestion(id);
    handleReset();
  };

  const handleAiAnswerFetched = (
    questionId: string,
    answer: string,
    aiSources: SourceItem[],
  ) => {
    setSelectedQuestion(questionId);
    setTranslatedDraftText("");
    setNewAnswer(answer);
    setSources(aiSources);
    setRemarks("AI Generated Answer");
  };

  const renderRightPanel = () => {
    if (!selectedQuestionData) return null;

    return (
      <Card className="w-full border border-gray-200 dark:border-gray-700 shadow-sm rounded-lg bg-transparent mb-3 md:mb-0">
        <CardHeader className="flex items-center justify-between gap-2 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <CardTitle className="text-lg font-semibold">Response</CardTitle>
          </div>
          <QuestionDetailsDialog question={selectedQuestionData} />
        </CardHeader>
        <CardContent className="h-full flex flex-col space-y-6 p-4 overflow-hidden">
          {isSelectedQuestionLoading ? (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="mt-2 text-sm text-muted-foreground">Loading...</p>
            </div>
          ) : (
            <>
              <div className="flex flex-col w-full">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm font-medium text-muted-foreground">
                    Current Query:
                  </Label>
                  <SarvamTranslateDropdown
                    query={selectedQuestionData.text}
                    onTranslate={(result) => setTranslatedText(result)}
                  />
                </div>
                <p className="text-sm mt-1 p-3 rounded-md border border-gray-200 dark:border-gray-600 break-words">
                  {translatedText || selectedQuestionData.text}
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="pae-answer" className="text-sm font-medium flex items-center gap-1">
                    {selectedQuestionData.aiInitialAnswer &&
                    newAnswer.trim() === selectedQuestionData.aiInitialAnswer ? (
                      <>
                        <Bot className="h-4 w-4 text-blue-600" />
                        AI Suggested Answer:
                      </>
                    ) : (
                      "Draft Response:"
                    )}
                  </Label>
                  <div className="flex items-center gap-2">
                    <SarvamTranslateDropdown
                      query={newAnswer}
                      onTranslate={(result) => setTranslatedDraftText(result)}
                    />
                    {selectedQuestionData.aiInitialAnswer && !newAnswer && (
                      <button
                        onClick={() => {
                          setNewAnswer(selectedQuestionData.aiInitialAnswer || "");
                          setTranslatedDraftText("");
                          setRemarks("AI Suggested Answer");
                        }}
                        className="inline-flex items-center justify-center text-blue-500 dark:text-blue-400 bg-transparent rounded-lg p-1 hover:shadow-[0_0_10px_rgba(59,130,246,0.5)] transition-all duration-200 focus:outline-none focus:ring-1 focus:ring-blue-300"
                        aria-label="Apply Suggested AI Answer"
                      >
                        <Bot className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                </div>
                <Textarea
                  id="pae-answer"
                  placeholder="Enter your answer here..."
                  value={translatedDraftText || newAnswer}
                  onChange={(e) => {
                    setTranslatedDraftText("");
                    setNewAnswer(e.target.value);
                  }}
                  className={`mt-1 md:max-h-[240px] max-h-[170px] min-h-[210px] resize-y border text-sm md:text-md rounded-md overflow-y-auto p-3 pb-0 bg-transparent ${
                    newAnswer.trim() === selectedQuestionData?.aiInitialAnswer &&
                    selectedQuestionData.aiInitialAnswer
                      ? "border-blue-400/70 bg-blue-50 dark:bg-blue-950/30 italic"
                      : "border-gray-200 dark:border-gray-600"
                  }`}
                />

                <div className="mt-3">
                  <Label htmlFor="pae-remarks" className="text-sm font-medium">
                    Remarks
                  </Label>
                  <Textarea
                    id="pae-remarks"
                    placeholder="Enter remarks..."
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    className="mt-1 md:max-h-[190px] max-h-[170px] min-h-[80px] resize-y border border-gray-200 dark:border-gray-600 text-sm rounded-md overflow-y-auto p-3 pb-0 bg-transparent"
                  />
                </div>

                <div className="bg-card border border-border rounded-xl p-6 shadow-sm mt-3 md:mt-6">
                  <SourceUrlManager
                    sources={sources}
                    onSourcesChange={setSources}
                    allowAnyUrl
                  />
                  {sources.length > 0 && (
                    <div className="mt-6 pt-6 border-t border-border">
                      <p className="text-sm text-muted-foreground">
                        {sources.length} {sources.length === 1 ? "source" : "sources"} added
                      </p>
                    </div>
                  )}
                </div>

                {isFinalAnswer && (
                  <p className="mt-2 flex items-center gap-2 text-green-600 dark:text-green-400 text-sm font-medium">
                    <CheckCircle className="w-4 h-4" />
                    Congratulations! Your response was selected as the final answer.
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between p-4 pt-0">
                <div className="flex items-center space-x-3">
                  <ConfirmationModal
                    title="Submit Response"
                    description="Please cross-check your answer carefully before submitting."
                    confirmText="Submit Response"
                    cancelText="Cancel"
                    onConfirm={() => handleSubmitResponse()}
                    trigger={
                      <Button disabled={!newAnswer.trim() || isResponding} className="flex items-center gap-2">
                        {isResponding ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Submitting…</span>
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4" />
                            <span>Submit</span>
                          </>
                        )}
                      </Button>
                    }
                  />
                  <Button variant="secondary" onClick={handleReset}>
                    <RotateCcw className="h-4 w-4" />
                    <span className="sr-only">Reset</span>
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="mx-auto px-4 md:px-6 bg-transparent py-4">
      <div className="flex flex-col space-y-6">
        <div
          className={`grid grid-cols-1 ${
            questions.length
              ? isSidebarCollapsed
                ? "lg:grid-cols-[minmax(0,_1fr)]"
                : "lg:grid-cols-[minmax(400px,_1fr)_minmax(400px,_1fr)]"
              : ""
          } gap-6 transition-all duration-300 relative`}
        >
          {isSidebarCollapsed && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsSidebarCollapsed(false)}
              className="absolute -left-12 h-full text-center ml-2 px-2 z-10 border border-gray-200 dark:border-gray-700 shadow-sm rounded-lg bg-transparent"
              title="Expand Questions"
            >
              <ChevronsRight className="w-4 h-4" />
              <span className="sr-only">Expand Questions</span>
            </Button>
          )}

          <div className={`transition-all duration-300 ${isSidebarCollapsed ? "hidden" : "w-full"}`}>
            <QaHeader
              questions={questions}
              selectedQuestion={selectedQuestion}
              onQuestionSelect={handleQuestionClick}
              isLoading={isQuestionsLoading}
              isLoadingTarget={false}
              isFetchingNextPage={isFetchingNextPage}
              onRefresh={refetch}
              actionType="allocated"
              onActionTypeChange={() => {}}
              reviewLevel="all"
              source="all"
              states={[]}
              crops={[]}
              onFilterChange={() => {}}
              scrollRef={scrollRef}
              questionItemRefs={questionItemRefs}
              setQuestionRef={setQuestionRef}
              onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              onAiAnswerFetched={handleAiAnswerFetched}
              hideControls={true}
            />
          </div>

          {selectedQuestionData && (
            <div className="transition-all duration-300 w-full">
              {renderRightPanel()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
