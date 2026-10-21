import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { QuestionAndContextPanel } from "./components/QuestionAndContextPanel";
import { AnswerReviewDraftPanel } from "./components/AnswerReviewDraftPanel";
import { SourceReferencePanel } from "./components/SourceReferencePanel";
import { ChecksPipelinePanel } from "./components/ChecksPipelinePanel";
import { FarmerFriendlyVersionsPanel } from "./components/FarmerFriendlyVersionsPanel";
import { OcrExtractionPanel } from "./components/OcrExtractionPanel";
import type { IQuestionContextData, IPanelCollapseState, PanelKey } from "./types";
import {
  useGetAllocatedQuestions,
} from "@/hooks/api/question/useGetAllocatedQuestions";
import { useGetQuestionById } from "@/hooks/api/question/useGetQuestionById";
import { useReviewAnswer, type IReviewAnswerPayload } from "@/hooks/api/answer/useReviewAnswer";
import { QuestionService } from "@/hooks/services/questionService";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { setPopIdentity } from "@/features/faq-pop/api";
import { toast } from "sonner";
import type { IReviewParmeters, SourceItem } from "@/types";

const EMPTY_SOURCES: SourceItem[] = [];

interface RevampQaLayoutProps {
  questionData?: IQuestionContextData | null;
  onRefresh?: () => void;
}

export const RevampQaLayout: React.FC<RevampQaLayoutProps> = ({
  questionData,
}) => {
  // Collapsible state for each of the 6 panels
  const [collapsed, setCollapsed] = useState<IPanelCollapseState>({
    questionContext: false,
    ocrExtraction: false,
    answerDraft: false,
    sourceReference: false,
    checksPipeline: false,
    ffv: false,
  });

  // Enlarged (Full Screen single page view) state for any of the 6 panels
  const [enlargedPanel, setEnlargedPanel] = useState<PanelKey | null>(null);

  const toggleEnlarge = useCallback((panelKey: PanelKey) => {
    setEnlargedPanel((prev) => (prev === panelKey ? null : panelKey));
  }, []);

  // Keyboard shortcut: Press Escape to exit full-screen view
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && enlargedPanel) {
        setEnlargedPanel(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enlargedPanel]);

  // Lock background body scroll when a panel is enlarged
  useEffect(() => {
    if (enlargedPanel) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [enlargedPanel]);

  // Every faq-pop/api.ts request needs X-User-Id/X-User-Role or the backend 401s — this page
  // never rendered under DataProcessingDashboard.tsx (the only other place that currently sets
  // this module-level identity), so the Source Reference panel's PoP requests would 401 without
  // this.
  const { data: currentUser } = useGetCurrentUser();
  useEffect(() => {
    setPopIdentity(currentUser?._id?.toString(), currentUser?.role || undefined);
  }, [currentUser]);

  // Action type state for the question filter (allocated vs reroute)
  const [actionType, setActionType] = useState<"allocated" | "reroute">("allocated");

  // Selected question ID tracking
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);

  // Active draft answer & sources tracked across panels
  const [currentDraftAnswer, setCurrentDraftAnswer] = useState<string>("");
  const [currentDraftSources, setCurrentDraftSources] = useState<SourceItem[]>(EMPTY_SOURCES);

  const handleDraftChange = useCallback((draft: string, sourcesList?: SourceItem[]) => {
    setCurrentDraftAnswer(draft);
    if (sourcesList) {
      setCurrentDraftSources(sourcesList);
    }
  }, []);

  // Reset active draft when question selection changes
  useEffect(() => {
    setCurrentDraftAnswer("");
    setCurrentDraftSources(EMPTY_SOURCES);
  }, [selectedQuestionId]);

  // Preferences state
  const [reviewLevel, setReviewLevel] = useState<string>("all");
  const [source, setSource] = useState<string>("all");
  const [states, setStates] = useState<string[]>([]);
  const [crops, setCrops] = useState<string[]>([]);

  // Memoized preferences object matching the old QA interface
  const preferences = useMemo(
    () => ({
      source,
      states,
      crops,
      review_level: reviewLevel,
    }),
    [source, states, crops, reviewLevel]
  );

  // Call the hook to get allocated questions
  const LIMIT = 10;
  const filter = "newest";
  const {
    data: questionPages,
    isLoading: isQuestionsLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useGetAllocatedQuestions(LIMIT, filter, preferences as any, actionType, null, reviewLevel);

  const questions = useMemo(
    () => (questionPages?.pages?.flat() || []).filter(Boolean) as any[],
    [questionPages?.pages]
  );

  // Check if there are any timebound questions in the list
  const hasTimeboundQuestions = useMemo(
    () => questions.some((q) => q?.source === "AJRASAKHA" || q?.source === "WHATSAPP"),
    [questions]
  );

  // Auto-select first question or timebound question with priority
  useEffect(() => {
    if (questions.length > 0 && !selectedQuestionId) {
      const timebound = questions.find(
        (q) => q?.source === "AJRASAKHA" || q?.source === "WHATSAPP"
      );
      if (timebound) {
        setSelectedQuestionId(timebound?.id || timebound?._id);
      } else {
        const first = questions[0];
        setSelectedQuestionId(first?.id || first?._id);
      }
    }
  }, [questions, selectedQuestionId]);

  // Auto-select next question when current question is no longer in the list
  // This handles the case when a question is accepted/rejected/answered
  useEffect(() => {
    if (!questions || questions.length === 0) {
      if (selectedQuestionId !== null) {
        setSelectedQuestionId(null);
      }
      return;
    }

    if (!selectedQuestionId) return;

    const currentExists = questions.some(
      (q) => (q?.id || q?._id) === selectedQuestionId
    );

    if (!currentExists) {
      // Current question is no longer in the list, select the first available
      const timebound = questions.find(
        (q) => q?.source === "AJRASAKHA" || q?.source === "WHATSAPP"
      );
      const nextId = timebound
        ? (timebound?.id || timebound?._id)
        : (questions[0]?.id || questions[0]?._id);
      if (nextId && nextId !== selectedQuestionId) {
        setSelectedQuestionId(nextId);
      }
    }
  }, [questions, selectedQuestionId]);

  // Fetch full details of the selected question
  const { data: selectedQuestionData, isLoading: isSelectedQuestionLoading } =
    useGetQuestionById(selectedQuestionId, actionType);

  // Time-bound question opened tracking
  const questionServiceRef = useRef(new QuestionService());
  const pendingClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastOpenedTimeBoundRef = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedQuestionId || actionType !== "allocated") return;

    const q = questions.find((item) => (item.id || item._id) === selectedQuestionId);
    const isCurrentTimeBound = q?.source === "AJRASAKHA" || q?.source === "WHATSAPP";

    if (isCurrentTimeBound && selectedQuestionId === lastOpenedTimeBoundRef.current) {
      if (pendingClearTimerRef.current) {
        clearTimeout(pendingClearTimerRef.current);
        pendingClearTimerRef.current = null;
      }
      return;
    }

    if (isCurrentTimeBound) {
      if (pendingClearTimerRef.current) {
        clearTimeout(pendingClearTimerRef.current);
        pendingClearTimerRef.current = null;
      }
      questionServiceRef.current.markQuestionOpened(selectedQuestionId);
      lastOpenedTimeBoundRef.current = selectedQuestionId;
      return;
    }

    if (lastOpenedTimeBoundRef.current && !pendingClearTimerRef.current) {
      pendingClearTimerRef.current = setTimeout(() => {
        questionServiceRef.current.markQuestionOpened(selectedQuestionId);
        lastOpenedTimeBoundRef.current = null;
        pendingClearTimerRef.current = null;
      }, 5 * 60 * 1000);
    }
  }, [selectedQuestionId, actionType, questions]);

  // Cleanup timebound timer on unmount
  useEffect(() => {
    return () => {
      if (pendingClearTimerRef.current) {
        clearTimeout(pendingClearTimerRef.current);
      }
    };
  }, []);

  // Review answer mutation
  const { mutateAsync: respondQuestion, isPending: isResponding } = useReviewAnswer();

  const handleSubmitResponse = async (
    status?: "accepted" | "rejected" | "modified",
    parameters?: IReviewParmeters,
    currentReviewingAnswerId?: string,
    rejectionReason?: string,
    answerText?: string,
    sourcesList?: SourceItem[],
    remarksText?: string
  ) => {
    if (!selectedQuestionId || isResponding) return;

    const payload: IReviewAnswerPayload = {
      questionId: selectedQuestionId,
      status: status || ("accepted" as any),
      parameters: parameters || ({} as any),
      remarks: remarksText || "",
      type: actionType,
    };

    const requiresSources = !status || status === "rejected" || status === "modified";
    if (requiresSources && (!sourcesList || sourcesList.length === 0)) {
      toast.error("At least one source is required!");
      return;
    }

    if (!status) {
      // Author phase submission
      payload.answer = answerText;
      payload.sources = sourcesList;
      payload.remarks = remarksText || "";
    } else if (status === "accepted") {
      payload.status = "accepted";
      payload.approvedAnswer = currentReviewingAnswerId;
    } else if (status === "rejected") {
      payload.status = "rejected";
      payload.rejectedAnswer = currentReviewingAnswerId;
      payload.reasonForRejection = rejectionReason;
      payload.answer = answerText;
      payload.sources = sourcesList;
      payload.remarks = remarksText || "";
    } else if (status === "modified") {
      payload.status = "modified";
      payload.modifiedAnswer = currentReviewingAnswerId;
      payload.reasonForModification = rejectionReason;
      payload.answer = answerText;
      payload.sources = sourcesList;
    }

    try {
      await respondQuestion(payload);
      toast.success("Your response has been submitted. Thank you!");
      refetch();
    } catch (error) {
      console.error("Failed to submit:", error);
    }
  };

  const handleFilterChange = (key: string, value: any) => {
    switch (key) {
      case "review_level":
        setReviewLevel(value);
        break;
      case "source":
        setSource(value);
        break;
      case "states":
        setStates(value);
        break;
      case "crops":
        setCrops(value);
        break;
    }
  };

  const handleRefresh = () => {
    refetch();
  };

  const togglePanel = (panel: keyof IPanelCollapseState) => {
    setCollapsed((prev) => ({
      ...prev,
      [panel]: !prev[panel],
    }));
  };

  const currentQuestionInList = useMemo(
    () => questions.find((q) => (q?.id || q?._id) === selectedQuestionId),
    [questions, selectedQuestionId]
  );

  const activeQuestionText = useMemo(() => {
    const fromSelected =
      selectedQuestionData?.text ||
      (selectedQuestionData as any)?.question?.text ||
      (selectedQuestionData as any)?.question?.question ||
      (typeof (selectedQuestionData as any)?.question === "string"
        ? (selectedQuestionData as any)?.question
        : "");
    if (fromSelected) return fromSelected;

    if (currentQuestionInList) {
      return (
        currentQuestionInList.text ||
        currentQuestionInList.question?.text ||
        currentQuestionInList.question?.question ||
        (typeof currentQuestionInList.question === "string"
          ? currentQuestionInList.question
          : "") ||
        ""
      );
    }
    return "";
  }, [selectedQuestionData, currentQuestionInList]);

  const activeAnswerText = useMemo(() => {
    if (currentDraftAnswer && currentDraftAnswer.trim()) {
      return currentDraftAnswer;
    }
    return (
      selectedQuestionData?.aiApprovedAnswer ||
      selectedQuestionData?.aiInitialAnswer ||
      (selectedQuestionData as any)?.answers?.[0]?.answer ||
      currentQuestionInList?.aiApprovedAnswer ||
      currentQuestionInList?.aiInitialAnswer ||
      currentQuestionInList?.answers?.[0]?.answer ||
      ""
    );
  }, [currentDraftAnswer, selectedQuestionData, currentQuestionInList]);

  const activeCrop = useMemo(() => {
    const fromSelected =
      selectedQuestionData?.details?.crop ||
      (selectedQuestionData as any)?.question?.details?.crop ||
      (selectedQuestionData as any)?.crop ||
      "";
    if (fromSelected) return fromSelected;

    if (currentQuestionInList) {
      return (
        currentQuestionInList.details?.crop ||
        currentQuestionInList.question?.details?.crop ||
        currentQuestionInList.crop ||
        ""
      );
    }
    return "";
  }, [selectedQuestionData, currentQuestionInList]);

  const activeState = useMemo(() => {
    const fromSelected =
      selectedQuestionData?.details?.state ||
      (selectedQuestionData as any)?.question?.details?.state ||
      (selectedQuestionData as any)?.state ||
      "";
    if (fromSelected) return fromSelected;

    if (currentQuestionInList) {
      return (
        currentQuestionInList.details?.state ||
        currentQuestionInList.question?.details?.state ||
        currentQuestionInList.state ||
        ""
      );
    }
    return "";
  }, [selectedQuestionData, currentQuestionInList]);

  const activeDistrict = useMemo(() => {
    const fromSelected =
      selectedQuestionData?.details?.district ||
      (selectedQuestionData as any)?.question?.details?.district ||
      (selectedQuestionData as any)?.district ||
      "";
    if (fromSelected) return fromSelected;

    if (currentQuestionInList) {
      return (
        currentQuestionInList.details?.district ||
        currentQuestionInList.question?.details?.district ||
        currentQuestionInList.district ||
        ""
      );
    }
    return "";
  }, [selectedQuestionData, currentQuestionInList]);

  const activeSources = useMemo(() => {
    if (currentDraftSources && currentDraftSources.length > 0) {
      return currentDraftSources;
    }
    return (
      (selectedQuestionData as any)?.answers?.[0]?.sources ||
      selectedQuestionData?.aiApprovedSources ||
      currentQuestionInList?.answers?.[0]?.sources ||
      currentQuestionInList?.aiApprovedSources ||
      EMPTY_SOURCES
    );
  }, [currentDraftSources, selectedQuestionData, currentQuestionInList]);

  const activeAnswerId = useMemo(() => {
    return (
      (selectedQuestionData as any)?.answers?.[0]?.id ||
      (selectedQuestionData as any)?.answers?.[0]?._id ||
      currentQuestionInList?.answers?.[0]?.id ||
      currentQuestionInList?.answers?.[0]?._id ||
      undefined
    );
  }, [selectedQuestionData, currentQuestionInList]);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col p-3 md:p-5 space-y-4">
      {/* Main Responsive Two-Column Layout (Left: Panel 1 & OCR, Right: Panels 2, 3, 4, 5) */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 items-start">
        {/* LEFT COMPONENT: Question & Context + OCR Extraction */}
        <div className="flex flex-col gap-4 shrink-0 w-full lg:w-auto">
          {/* Top: Question & Context */}
          <div
            className={`transition-all duration-300 ease-in-out shrink-0 ${
              enlargedPanel === "questionContext"
                ? "fixed inset-0 z-50 bg-background p-3 md:p-5 flex flex-col overflow-hidden"
                : collapsed.questionContext
                ? "w-full lg:w-12 h-auto lg:h-[580px]"
                : "w-full lg:w-[320px] xl:w-[350px] h-auto lg:h-[580px]"
            }`}
          >
            <QuestionAndContextPanel
              question={
                selectedQuestionData
                  ? ({
                      id: selectedQuestionData?.id || (selectedQuestionData as any)?._id || "",
                      text:
                        selectedQuestionData?.text ||
                        (selectedQuestionData as any)?.question?.text ||
                        (selectedQuestionData as any)?.question?.question ||
                        (selectedQuestionData as any)?.question ||
                        "",
                      priority: selectedQuestionData?.priority || (selectedQuestionData as any)?.question?.priority || "medium",
                      createdAt: selectedQuestionData?.createdAt || (selectedQuestionData as any)?.question?.createdAt,
                      updatedAt: selectedQuestionData?.updatedAt,
                      totalAnswersCount: selectedQuestionData?.totalAnswersCount || 0,
                      status: selectedQuestionData?.status || (selectedQuestionData as any)?.question?.status,
                      source: selectedQuestionData?.source,
                      assignedAt: selectedQuestionData?.assignedAt,
                      review_level_number: (selectedQuestionData as any)?.review_level_number,
                      aiInitialAnswer: selectedQuestionData?.aiInitialAnswer,
                      aiApprovedAnswer: selectedQuestionData?.aiApprovedAnswer,
                      details: selectedQuestionData?.details
                        ? {
                            state: selectedQuestionData.details?.state,
                            district: selectedQuestionData.details?.district,
                            crop: selectedQuestionData.details?.crop,
                            normalised_crop: selectedQuestionData.details?.normalised_crop,
                            season: selectedQuestionData.details?.season,
                            domain: selectedQuestionData.details?.domain,
                          }
                        : (selectedQuestionData as any)?.question?.details
                          ? {
                              state: (selectedQuestionData as any).question.details?.state,
                              district: (selectedQuestionData as any).question.details?.district,
                              crop: (selectedQuestionData as any).question.details?.crop,
                              normalised_crop: (selectedQuestionData as any).question.details?.normalised_crop,
                              season: (selectedQuestionData as any).question.details?.season,
                              domain: (selectedQuestionData as any).question.details?.domain,
                            }
                          : undefined,
                    } as IQuestionContextData)
                  : questionData
              }
              questions={questions}
              isLoading={isQuestionsLoading || isSelectedQuestionLoading}
              selectedQuestionId={selectedQuestionId}
              onQuestionSelect={setSelectedQuestionId}
              isCollapsed={collapsed.questionContext}
              onToggleCollapse={() => togglePanel("questionContext")}
              isEnlarged={enlargedPanel === "questionContext"}
              onToggleEnlarge={() => toggleEnlarge("questionContext")}
              progressPercent={15}
              actionType={actionType}
              onActionTypeChange={setActionType}
              reviewLevel={reviewLevel}
              source={source}
              states={states}
              crops={crops}
              onFilterChange={handleFilterChange}
              onRefresh={handleRefresh}
              fetchNextPage={fetchNextPage}
              hasNextPage={hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              hasTimeboundQuestions={hasTimeboundQuestions}
            />
          </div>

          {/* Bottom: OCR Extraction */}
          <div
            className={`transition-all duration-300 ease-in-out shrink-0 flex flex-col ${
              enlargedPanel === "ocrExtraction"
                ? "fixed inset-0 z-50 bg-background p-3 md:p-5 overflow-hidden"
                : collapsed.ocrExtraction
                ? "w-full lg:w-12 h-[260px]"
                : "w-full lg:w-[320px] xl:w-[350px] h-[260px]"
            }`}
          >
            <OcrExtractionPanel
              isCollapsed={collapsed.ocrExtraction}
              onToggleCollapse={() => togglePanel("ocrExtraction")}
              isEnlarged={enlargedPanel === "ocrExtraction"}
              onToggleEnlarge={() => toggleEnlarge("ocrExtraction")}
            />
          </div>
        </div>

        {/* RIGHT COMPONENT: 2, 3, 4, and 5 */}
        <div className="flex-1 flex flex-col gap-4 min-w-0 w-full">
          {/* TOP ROW: Panels 2 and 3 with locked height */}
          <div className="flex flex-col xl:flex-row gap-4 items-stretch h-auto xl:h-[580px]">
            {/* Panel 2: Answer Review & Draft */}
            <div
              className={`transition-all duration-300 ease-in-out ${
                enlargedPanel === "answerDraft"
                  ? "fixed inset-0 z-50 bg-background p-3 md:p-5 flex flex-col overflow-hidden"
                  : collapsed.answerDraft
                  ? "w-full xl:w-12 shrink-0 h-full"
                  : "flex-1 min-w-[320px] h-full"
              }`}
            >
              <AnswerReviewDraftPanel
                selectedQuestionData={selectedQuestionData}
                isLoading={isSelectedQuestionLoading}
                actionType={actionType}
                initialAiAnswer={
                  selectedQuestionData?.source === "AJRASAKHA"
                    ? selectedQuestionData.aiInitialAnswer ||
                      selectedQuestionData.aiApprovedAnswer
                    : selectedQuestionData?.aiInitialAnswer
                }
                isSubmitting={isResponding}
                onSubmitResponse={handleSubmitResponse}
                onQuestionSelect={setSelectedQuestionId}
                refetchQuestions={refetch}
                isCollapsed={collapsed.answerDraft}
                onToggleCollapse={() => togglePanel("answerDraft")}
                isEnlarged={enlargedPanel === "answerDraft"}
                onToggleEnlarge={() => toggleEnlarge("answerDraft")}
                onDraftChange={handleDraftChange}
              />
            </div>

            {/* Panel 3: Package of Practices / Source Reference */}
            <div
              className={`transition-all duration-300 ease-in-out ${
                enlargedPanel === "sourceReference"
                  ? "fixed inset-0 z-50 bg-background p-3 md:p-5 flex flex-col overflow-hidden"
                  : collapsed.sourceReference
                  ? "w-full xl:w-12 shrink-0 h-full"
                  : "w-full xl:w-[46%] min-w-[300px] shrink-0 h-full"
              }`}
            >
              <SourceReferencePanel
                isCollapsed={collapsed.sourceReference}
                onToggleCollapse={() => togglePanel("sourceReference")}
                isEnlarged={enlargedPanel === "sourceReference"}
                onToggleEnlarge={() => toggleEnlarge("sourceReference")}
                questionState={activeState}
                questionCrop={activeCrop}
                questionDistrict={activeDistrict}
              />
            </div>
          </div>

          {/* BOTTOM ROW: Panels 4 and 5 - Fixed height to prevent growth */}
          <div className="flex flex-col md:flex-row gap-4 h-[460px] shrink-0">
            {/* Panel 4: Checks / GDB Cleaning Pipeline */}
            <div
              className={`transition-all duration-300 ease-in-out ${
                enlargedPanel === "checksPipeline"
                  ? "fixed inset-0 z-50 bg-background p-3 md:p-5 flex flex-col overflow-hidden"
                  : collapsed.checksPipeline
                  ? "w-full md:w-12 shrink-0 h-full"
                  : "w-full md:w-1/2 flex-1 min-w-[280px] h-full"
              }`}
            >
              <ChecksPipelinePanel
                isCollapsed={collapsed.checksPipeline}
                onToggleCollapse={() => togglePanel("checksPipeline")}
                isEnlarged={enlargedPanel === "checksPipeline"}
                onToggleEnlarge={() => toggleEnlarge("checksPipeline")}
                questionId={selectedQuestionId || undefined}
                questionText={activeQuestionText}
                answerText={activeAnswerText}
                crop={activeCrop}
                state={activeState}
                sources={activeSources}
                answerId={activeAnswerId}
              />
            </div>

            {/* Panel 5: Farmer-Friendly Versions (FFV) */}
            <div
              className={`transition-all duration-300 ease-in-out ${
                enlargedPanel === "ffv"
                  ? "fixed inset-0 z-50 bg-background p-3 md:p-5 flex flex-col overflow-hidden"
                  : collapsed.ffv
                  ? "w-full md:w-12 shrink-0 h-full"
                  : "w-full md:w-1/2 flex-1 min-w-[280px] h-full"
              }`}
            >
              <FarmerFriendlyVersionsPanel
                isCollapsed={collapsed.ffv}
                onToggleCollapse={() => togglePanel("ffv")}
                isEnlarged={enlargedPanel === "ffv"}
                onToggleEnlarge={() => toggleEnlarge("ffv")}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
