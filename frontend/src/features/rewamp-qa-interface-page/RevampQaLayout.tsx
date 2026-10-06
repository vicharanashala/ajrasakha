import React, { useState, useEffect, useRef } from "react";
import { QuestionAndContextPanel } from "./components/QuestionAndContextPanel";
import { AnswerReviewDraftPanel } from "./components/AnswerReviewDraftPanel";
import { SourceReferencePanel } from "./components/SourceReferencePanel";
import { ChecksPipelinePanel } from "./components/ChecksPipelinePanel";
import { FarmerFriendlyVersionsPanel } from "./components/FarmerFriendlyVersionsPanel";
import { OcrExtractionPanel } from "./components/OcrExtractionPanel";
import type { IQuestionContextData, IPanelCollapseState } from "./types";
import {
  useGetAllocatedQuestions,
} from "@/hooks/api/question/useGetAllocatedQuestions";
import { useGetQuestionById } from "@/hooks/api/question/useGetQuestionById";
import { useReviewAnswer, type IReviewAnswerPayload } from "@/hooks/api/answer/useReviewAnswer";
import { QuestionService } from "@/hooks/services/questionService";
import { toast } from "sonner";
import type { IReviewParmeters, SourceItem } from "@/types";

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

  // Action type state for the question filter (allocated vs reroute)
  const [actionType, setActionType] = useState<"allocated" | "reroute">("allocated");

  // Selected question ID tracking
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);

  // Preferences state
  const [reviewLevel, setReviewLevel] = useState<string>("all");
  const [source, setSource] = useState<string>("all");
  const [states, setStates] = useState<string[]>([]);
  const [crops, setCrops] = useState<string[]>([]);

  // Call the hook to get allocated questions
  const LIMIT = 10;
  const filter = "newest";
  const preferences = {};
  const {
    data: questionPages,
    isLoading: isQuestionsLoading,
    refetch,
  } = useGetAllocatedQuestions(LIMIT, filter, preferences, actionType, null, reviewLevel);

  const questions = (questionPages?.pages?.flat() || []) as any[];

  // Auto-select first question or timebound question with priority
  useEffect(() => {
    if (questions.length > 0 && !selectedQuestionId) {
      const timebound = questions.find(
        (q) => q?.source === "AJRASAKHA" || q?.source === "WHATSAPP"
      );
      if (timebound) {
        setSelectedQuestionId(timebound.id || timebound._id);
      } else {
        const first = questions[0];
        setSelectedQuestionId(first?.id || first?._id);
      }
    }
  }, [questions, selectedQuestionId]);

  // Auto-select next question when current question is no longer in the list
  // This handles the case when a question is accepted/rejected/answered
  useEffect(() => {
    if (questions.length === 0) {
      setSelectedQuestionId(null);
      return;
    }

    const currentId = selectedQuestionId;
    if (!currentId) return;

    const currentExists = questions.some(
      (q) => (q.id || q._id) === currentId
    );

    if (!currentExists) {
      // Current question is no longer in the list, select the first available
      const timebound = questions.find(
        (q) => q?.source === "AJRASAKHA" || q?.source === "WHATSAPP"
      );
      if (timebound) {
        setSelectedQuestionId(timebound.id || timebound._id);
      } else {
        const first = questions[0];
        setSelectedQuestionId(first?.id || first?._id);
      }
    }
  }, [questions]);

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

  const handleExpandAll = () => {
    setCollapsed({
      questionContext: false,
      ocrExtraction: false,
      answerDraft: false,
      sourceReference: false,
      checksPipeline: false,
      ffv: false,
    });
  };

  const isAnyCollapsed = Object.values(collapsed).some((v) => v);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col p-3 md:p-5 space-y-4">
      {/* Main Responsive Two-Column Layout (Left: Panel 1 & OCR, Right: Panels 2, 3, 4, 5) */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 items-start">
        {/* LEFT COMPONENT: Question & Context + OCR Extraction */}
        <div className="flex flex-col gap-4 shrink-0 w-full lg:w-auto">
          {/* Top: Question & Context */}
          <div
            className={`transition-all duration-300 ease-in-out shrink-0 h-auto lg:h-[580px] ${
              collapsed.questionContext
                ? "w-full lg:w-12"
                : "w-full lg:w-[320px] xl:w-[350px]"
            }`}
          >
            <QuestionAndContextPanel
              question={
                selectedQuestionData
                  ? ({
                      id: selectedQuestionData.id || (selectedQuestionData as any)._id || "",
                      text: selectedQuestionData.text || "",
                      priority: selectedQuestionData.priority || "medium",
                      createdAt: selectedQuestionData.createdAt,
                      updatedAt: selectedQuestionData.updatedAt,
                      totalAnswersCount: selectedQuestionData.totalAnswersCount || 0,
                      status: selectedQuestionData.status,
                      source: selectedQuestionData.source,
                      assignedAt: selectedQuestionData.assignedAt,
                      review_level_number: selectedQuestionData.review_level_number,
                      aiInitialAnswer: selectedQuestionData.aiInitialAnswer,
                      aiApprovedAnswer: selectedQuestionData.aiApprovedAnswer,
                      details: selectedQuestionData.details ? {
                        state: selectedQuestionData.details.state,
                        district: selectedQuestionData.details.district,
                        crop: selectedQuestionData.details.crop,
                        normalised_crop: selectedQuestionData.details.normalised_crop,
                        season: selectedQuestionData.details.season,
                        domain: selectedQuestionData.details.domain,
                      } : undefined,
                    } as IQuestionContextData)
                  : questionData
              }
              questions={questions}
              isLoading={isQuestionsLoading || isSelectedQuestionLoading}
              selectedQuestionId={selectedQuestionId}
              onQuestionSelect={setSelectedQuestionId}
              isCollapsed={collapsed.questionContext}
              onToggleCollapse={() => togglePanel("questionContext")}
              progressPercent={15}
              actionType={actionType}
              onActionTypeChange={setActionType}
              reviewLevel={reviewLevel}
              source={source}
              states={states}
              crops={crops}
              onFilterChange={handleFilterChange}
              onRefresh={handleRefresh}
            />
          </div>

          {/* Bottom: OCR Extraction */}
          <div
            className={`transition-all duration-300 ease-in-out shrink-0 flex flex-col h-[260px] ${
              collapsed.ocrExtraction
                ? "w-full lg:w-12"
                : "w-full lg:w-[320px] xl:w-[350px]"
            }`}
          >
            <OcrExtractionPanel
              isCollapsed={collapsed.ocrExtraction}
              onToggleCollapse={() => togglePanel("ocrExtraction")}
            />
          </div>
        </div>

        {/* RIGHT COMPONENT: 2, 3, 4, and 5 */}
        <div className="flex-1 flex flex-col gap-4 min-w-0 w-full">
          {/* TOP ROW: Panels 2 and 3 with locked height */}
          <div className="flex flex-col xl:flex-row gap-4 items-stretch h-auto xl:h-[580px]">
            {/* Panel 2: Answer Review & Draft */}
            <div
              className={`transition-all duration-300 ease-in-out h-full ${
                collapsed.answerDraft
                  ? "w-full xl:w-12 shrink-0"
                  : "flex-1 min-w-[320px]"
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
              />
            </div>

            {/* Panel 3: Package of Practices / Source Reference */}
            <div
              className={`transition-all duration-300 ease-in-out h-full ${
                collapsed.sourceReference
                  ? "w-full xl:w-12 shrink-0"
                  : "w-full xl:w-[46%] min-w-[300px] shrink-0"
              }`}
            >
              <SourceReferencePanel
                isCollapsed={collapsed.sourceReference}
                onToggleCollapse={() => togglePanel("sourceReference")}
              />
            </div>
          </div>

          {/* BOTTOM ROW: Panels 4 and 5 */}
          <div className="flex flex-col md:flex-row gap-4 items-stretch min-h-[260px]">
            {/* Panel 4: Checks / GDB Cleaning Pipeline */}
            <div
              className={`transition-all duration-300 ease-in-out ${
                collapsed.checksPipeline
                  ? "w-full md:w-12 shrink-0"
                  : "w-full md:w-1/2 flex-1 min-w-[280px]"
              }`}
            >
              <ChecksPipelinePanel
                isCollapsed={collapsed.checksPipeline}
                onToggleCollapse={() => togglePanel("checksPipeline")}
              />
            </div>

            {/* Panel 5: Farmer-Friendly Versions (FFV) */}
            <div
              className={`transition-all duration-300 ease-in-out ${
                collapsed.ffv
                  ? "w-full md:w-12 shrink-0"
                  : "w-full md:w-1/2 flex-1 min-w-[280px]"
              }`}
            >
              <FarmerFriendlyVersionsPanel
                isCollapsed={collapsed.ffv}
                onToggleCollapse={() => togglePanel("ffv")}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
