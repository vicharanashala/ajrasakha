import React, { useState, useRef, useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  Bot,
  Sparkles,
  RotateCcw,
  FileCheck,
  FileText,
  Send,
  Loader2,
  History,
  Pencil,
  XCircle,
  ExternalLink,
  Link2,
} from "lucide-react";
import { Card, CardContent } from "@/components/atoms/card";
import { Button } from "@/components/atoms/button";
import { Label } from "@/components/atoms/label";
import { Textarea } from "@/components/atoms/textarea";
import { Badge } from "@/components/atoms/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/atoms/tooltip";
import { SourceUrlManager } from "@/components/source-url-manager";
import { ConfirmationModal } from "@/components/confirmation-modal";
import { toast } from "sonner";
import type { IQuestion, IReviewParmeters, SourceItem } from "@/types";
import { PolishDraftAssistant } from "./PolishDraftAssistant";
import { RevampReviewHistoryTimeline } from "./RevampReviewHistoryTimeline";
import { ReviewResponseDialog } from "@/features/qa-interface-page/ReviewResponseDialog";
import SarvamTranslateDropdown from "@/components/SarvamTranslateDropdown";
import { isEnglishCharacters } from "@/features/questions/utils/checkLanguage";
import { useFetchAnswer } from "@/hooks/api/answer/useGetAiInitialAnswer";
import { useGetStates } from "@/hooks/api/location/useLocations";
import type { ILocationState } from "@/hooks/services/locationService";
import { ChemicalVerifiedTextarea } from "@/components/ChemicalVerifiedTextarea";
import type { ChemicalDetectionResponse } from "@/hooks/services/answerService";
import { cn } from "@/lib/utils";
import { PanelControls } from "./PanelControls";

interface AnswerReviewDraftPanelProps {
  selectedQuestionData?: IQuestion | null;
  isLoading?: boolean;
  actionType?: "allocated" | "reroute";
  initialAiAnswer?: string;
  initialDraft?: string;
  initialRemarks?: string;
  initialSources?: SourceItem[];
  isSubmitting?: boolean;
  onSubmitResponse?: (
    status?: "accepted" | "rejected" | "modified",
    parameters?: IReviewParmeters,
    currentReviewingAnswerId?: string,
    rejectionReason?: string,
    answerText?: string,
    sourcesList?: SourceItem[],
    remarksText?: string
  ) => void | Promise<void>;
  onQuestionSelect?: (id: string | null) => void;
  refetchQuestions?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  isEnlarged?: boolean;
  onToggleEnlarge?: () => void;
  onDraftChange?: (draftAnswer: string, sources?: SourceItem[]) => void;
}

const normalizeAiAnswerSources = (result: any): SourceItem[] => {
  const apiSources = result?.sources?.length
    ? result.sources
    : result?.contexts?.map((context: any) => context.meta_data).filter(Boolean);

  return (apiSources || [])
    .map((source: any) => ({
      sourceType: "other" as const,
      sourceName: source?.source_name?.trim(),
      source: source?.source_url || source?.source || "",
      page: source?.page_no ?? source?.page,
    }))
    .filter((source: any) => source.source);
};

export const AnswerReviewDraftPanel: React.FC<AnswerReviewDraftPanelProps> = ({
  selectedQuestionData,
  isLoading = false,
  initialAiAnswer,
  initialDraft = "",
  initialRemarks = "",
  initialSources = [],
  isSubmitting = false,
  onSubmitResponse,
  onQuestionSelect,
  refetchQuestions,
  isCollapsed = false,
  onToggleCollapse,
  isEnlarged = false,
  onToggleEnlarge,
  onDraftChange,
}) => {
  // Determine if this question is in the Review Phase (has existing answer history)
  const history = selectedQuestionData?.history || [];
  const isReviewPhase = Boolean(history && history.length > 0);

  // Tab State - Review phase defaults to "response_review", Author phase defaults to "ai_answer"
  const [activeTab, setActiveTab] = useState<"ai_answer" | "response_review" | "reviewer_draft" | "ai_assist">(
    isReviewPhase ? "response_review" : "ai_answer"
  );

  // Default tab based on question phase
  useEffect(() => {
    setActiveTab(isReviewPhase ? "response_review" : "ai_answer");
  }, [selectedQuestionData?.id, (selectedQuestionData as any)?._id, isReviewPhase]);

  // On-demand generated AI Answer & sources state
  const [generatedAiAnswer, setGeneratedAiAnswer] = useState<string>("");
  const [generatedAiSources, setGeneratedAiSources] = useState<SourceItem[]>([]);

  const baseAiAnswer =
    selectedQuestionData?.source === "AJRASAKHA"
      ? selectedQuestionData.aiApprovedAnswer || selectedQuestionData.aiInitialAnswer || initialAiAnswer || ""
      : selectedQuestionData?.aiInitialAnswer || initialAiAnswer || "";

  const aiAnswerText = generatedAiAnswer || baseAiAnswer;
  const hasAiAnswer = Boolean(aiAnswerText && aiAnswerText.trim().length > 0);

  const aiSourcesList: SourceItem[] =
    generatedAiSources.length > 0
      ? generatedAiSources
      : selectedQuestionData?.aiApprovedSources || [];

  const [draftAnswer, setDraftAnswer] = useState<string>(initialDraft);
  const [remarks, setRemarks] = useState<string>(initialRemarks);
  const [sources, setSources] = useState<SourceItem[]>(initialSources);
  const [translatedAiText, setTranslatedAiText] = useState<string>("");
  const [translatedDraftText, setTranslatedDraftText] = useState<string>("");

  const [chemicalDetectionResult, setChemicalDetectionResult] = useState<ChemicalDetectionResponse | null>(null);

  const hasBannedChemicals = Boolean(
    chemicalDetectionResult?.matches?.some(
      (m) => m.status?.toLowerCase() === "banned"
    )
  );

  // Notify parent of live draft answer & sources updates
  useEffect(() => {
    const effectiveDraft = translatedDraftText || draftAnswer;
    onDraftChange?.(effectiveDraft, sources);
  }, [draftAnswer, translatedDraftText, sources, onDraftChange]);

  // Review & History Phase States
  const [rejectionReason, setRejectionReason] = useState("");
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [isModifyDialogOpen, setIsModifyDialogOpen] = useState(false);
  const [isRejectConfirmOpen, setIsRejectConfirmOpen] = useState(false);
  const [isRejectionSubmitted, setIsRejectionSubmitted] = useState(false);

  const [checklist, setChecklist] = useState<IReviewParmeters>({
    contextRelevance: false,
    technicalAccuracy: false,
    practicalUtility: false,
    valueInsight: false,
    credibilityTrust: false,
    readabilityCommunication: false,
  });

  const questionId = selectedQuestionData?.id || (selectedQuestionData as any)?._id || "";

  // Locate the current reviewing answer from history
  const currentReviewingAnswer =
    history && Array.isArray(history)
      ? [...history]
          .reverse()
          .find(
            (h) =>
              h?.status !== "approved" &&
              h?.status !== "rejected" &&
              h?.answer !== null &&
              h?.answer !== undefined
          )?.answer
      : null;

  // Pre-fill answer & sources when reviewing (Review Phase)
  useEffect(() => {
    if (isReviewPhase && currentReviewingAnswer?.answer) {
      setDraftAnswer(currentReviewingAnswer.answer);
      setSources(currentReviewingAnswer.sources || []);
      if (currentReviewingAnswer.remarks) {
        setRemarks(currentReviewingAnswer.remarks);
      }
    }
  }, [currentReviewingAnswer, isReviewPhase]);

  // Pre-fill answer & sources when authoring (Author Phase)
  useEffect(() => {
    if (!selectedQuestionData || isReviewPhase) return;

    // Reset temporary generated AI state on question switch
    setGeneratedAiAnswer("");
    setGeneratedAiSources([]);
    setChemicalDetectionResult(null);

    const prefill =
      selectedQuestionData.source === "AJRASAKHA"
        ? selectedQuestionData.aiApprovedAnswer || selectedQuestionData.aiInitialAnswer || ""
        : selectedQuestionData.aiInitialAnswer || "";

    if (prefill) {
      setDraftAnswer(prefill);
      setRemarks("AI Generated Answer");
      if (
        selectedQuestionData.source === "AJRASAKHA" &&
        selectedQuestionData.aiApprovedSources?.length
      ) {
        setSources(selectedQuestionData.aiApprovedSources);
      } else {
        setSources([]);
      }
    } else {
      setDraftAnswer("");
      setRemarks("");
      setSources([]);
    }
  }, [selectedQuestionData?.id, (selectedQuestionData as any)?._id, isReviewPhase]);

  // Hook for on-demand AI answer generation
  const { mutate: fetchAnswer, isPending: isFetchingAiAnswer } = useFetchAnswer();
  const { data: statesResponse = [] } = useGetStates();
  const statesList: string[] =
    (statesResponse as ILocationState[])?.map((s) => s.stateNameEnglish) || [];
  const [selectedGenState, setSelectedGenState] = useState<string>(
    selectedQuestionData?.details?.state || (selectedQuestionData as any)?.state || ""
  );

  useEffect(() => {
    if (selectedQuestionData?.details?.state || (selectedQuestionData as any)?.state) {
      setSelectedGenState(
        selectedQuestionData?.details?.state || (selectedQuestionData as any).state
      );
    }
  }, [selectedQuestionData]);

  const handleGenerateAiInitialAnswer = () => {
    const queryText =
      selectedQuestionData?.text ||
      (selectedQuestionData as any)?.question?.text ||
      (selectedQuestionData as any)?.question?.question ||
      (selectedQuestionData as any)?.question;

    if (!queryText) {
      toast.error("Question text is required to generate AI answer.");
      return;
    }

    const crop =
      selectedQuestionData?.details?.crop ||
      (selectedQuestionData as any)?.crop ||
      (selectedQuestionData as any)?.question?.details?.crop ||
      "";
    const state =
      selectedGenState ||
      selectedQuestionData?.details?.state ||
      (selectedQuestionData as any)?.state ||
      (selectedQuestionData as any)?.question?.details?.state ||
      "";

    fetchAnswer(
      {
        query: queryText,
        crop,
        state,
      },
      {
        onSuccess: (result: any) => {
          if (!result?.answer) {
            toast.error("AI answer was not returned.");
            return;
          }
          const normSources = normalizeAiAnswerSources(result);
          setGeneratedAiAnswer(result.answer);
          setGeneratedAiSources(normSources);
          setDraftAnswer(result.answer);
          if (normSources.length > 0) {
            setSources(normSources);
          }
          setRemarks("AI Generated Answer");
          toast.success("AI initial answer generated and loaded into draft!");
        },
        onError: () => {
          toast.error("Failed to generate AI answer. Please try again.");
        },
      }
    );
  };

  // Tab horizontal scroll handling
  const tabScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkTabScroll = () => {
    if (!tabScrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = tabScrollRef.current;
    setCanScrollLeft(scrollLeft > 2);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 2);
  };

  useEffect(() => {
    checkTabScroll();
    window.addEventListener("resize", checkTabScroll);
    return () => window.removeEventListener("resize", checkTabScroll);
  }, []);

  const scrollTabs = (direction: "left" | "right") => {
    if (!tabScrollRef.current) return;
    const scrollAmount = direction === "left" ? -120 : 120;
    tabScrollRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
    setTimeout(checkTabScroll, 200);
  };

  const wordCount = draftAnswer.trim() ? draftAnswer.trim().split(/\s+/).length : 0;
  const charCount = draftAnswer.length;

  // Clear / Reset reviewer draft fields
  const handleResetDraft = () => {
    setDraftAnswer("");
    setRemarks("");
    setSources([]);
    setTranslatedDraftText("");
    setChemicalDetectionResult(null);
    toast.info("Draft, remarks, and sources have been cleared.");
  };

  const handleUseAiAnswerInDraft = () => {
    setDraftAnswer(aiAnswerText);
    setRemarks("AI Suggested Answer");
    setActiveTab(isReviewPhase ? "response_review" : "reviewer_draft");
    toast.success("Copied AI generated answer into Draft!");
  };

  // Author Phase Submit
  const handleAuthorSubmit = async () => {
    if (!draftAnswer.trim()) {
      toast.error("Please enter an answer before submitting!");
      return;
    }
    if (sources.length === 0) {
      toast.error("At least one source is required!");
      return;
    }
    if (hasBannedChemicals) {
      toast.error(
        "Answers containing banned chemicals cannot be submitted. Please remove or replace them."
      );
      return;
    }

    if (onSubmitResponse) {
      await onSubmitResponse(undefined, undefined, undefined, undefined, draftAnswer, sources, remarks);
      handleResetDraft();
    }
  };

  // Review Phase Actions
  const handleAccept = () => {
    if (!currentReviewingAnswer || !currentReviewingAnswer._id) {
      toast.error("Unable to locate the current review answer. Please refresh and try again.");
      return;
    }

    const reviewAnswerId = currentReviewingAnswer._id.toString();
    onSubmitResponse?.("accepted", checklist, reviewAnswerId);
  };

  const handleRejectOrModify = (type: "reject" | "modify") => {
    const actionLabel = type === "reject" ? "rejection" : "modification";

    if (!rejectionReason.trim()) {
      toast.error(`Please provide a reason for the ${actionLabel}.`);
      return;
    }

    if (rejectionReason.trim().length < 8) {
      toast.error(`${actionLabel.charAt(0).toUpperCase() + actionLabel.slice(1)} reason must be at least 8 characters.`);
      return;
    }

    if (!currentReviewingAnswer || !currentReviewingAnswer._id) {
      toast.error("Unable to locate the current reviewing answer. Please refresh and try again.");
      return;
    }

    const reviewAnswerId = currentReviewingAnswer._id.toString();

    onSubmitResponse?.(
      type === "reject" ? "rejected" : "modified",
      checklist,
      reviewAnswerId,
      rejectionReason,
      draftAnswer,
      sources,
      remarks
    );

    setIsRejectDialogOpen(false);
    setIsModifyDialogOpen(false);
  };

  if (isCollapsed && !isEnlarged) {
    return (
      <div className="h-full flex flex-col items-center justify-between py-4 px-2 bg-card border border-border rounded-xl shadow-xs transition-all duration-300 w-12 min-h-[300px]">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleCollapse}
          className="h-8 w-8 rounded-lg hover:bg-muted"
          title="Expand Answer Review & Draft"
        >
          <ChevronsRight className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        </Button>

        <div className="flex items-center gap-2 [writing-mode:vertical-rl] rotate-180 select-none py-4">
          <span className="text-xs font-semibold tracking-wide text-foreground">
            {isReviewPhase ? "Response & Review" : "Answer Review & Draft"}
          </span>
        </div>

        <div className="w-2 h-2 rounded-full bg-emerald-500" />
      </div>
    );
  }

  return (
    <Card className="flex flex-col h-full border border-border bg-card shadow-xs rounded-xl overflow-hidden">
      {/* Isolated Top Header with Title and Panel Controls */}
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-border shrink-0">
        <p className="text-xs font-semibold text-foreground">
          {isReviewPhase ? "Response & Review" : "Answer Review & Draft"}
        </p>
        <PanelControls
          isEnlarged={isEnlarged}
          onToggleEnlarge={onToggleEnlarge}
          onToggleCollapse={onToggleCollapse}
        />
      </div>

      {/* Scrollable Container with invisible scrollbars */}
      <CardContent className="p-3.5 md:p-4 flex-1 flex flex-col space-y-3.5 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {/* Navigation Tabs Bar */}
        <div className="flex items-center justify-between border-b border-border/80 gap-2 shrink-0">
          <div className="flex items-center gap-1 min-w-0 flex-1">
            {canScrollLeft && (
              <button
                type="button"
                onClick={() => scrollTabs("left")}
                className="h-7 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground bg-muted/60 rounded-sm mb-px transition-colors"
                title="Scroll left"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            )}

            <div
              ref={tabScrollRef}
              onScroll={checkTabScroll}
              className="flex items-end gap-0.5 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] pt-1"
            >
              {/* For Author Phase: TAB 1 is AI Generated Answer */}
              {!isReviewPhase && (
                <button
                  type="button"
                  onClick={() => setActiveTab("ai_answer")}
                  className={`h-8 px-3.5 inline-flex items-center justify-center text-xs rounded-t-md border-t-2 border-x border-b-0 transition-colors whitespace-nowrap relative -mb-px select-none cursor-pointer ${
                    activeTab === "ai_answer"
                      ? "border-t-blue-500 border-x-blue-500/80 bg-background text-blue-900 dark:text-blue-300 font-bold z-10 shadow-xs"
                      : "border-t-transparent border-x-transparent bg-slate-100/90 dark:bg-slate-800/70 text-slate-600 dark:text-slate-400 font-medium hover:bg-slate-200/80 dark:hover:bg-slate-700/70 hover:text-foreground"
                  }`}
                >
                  <Bot className="w-3 h-3 mr-1 text-blue-500" />
                  AI Generated Answer
                </button>
              )}

              {/* TAB 2 (or TAB 1 in Review Phase): Response & Review or Reviewer Draft */}
              {isReviewPhase ? (
                <button
                  type="button"
                  onClick={() => setActiveTab("response_review")}
                  className={`h-8 px-3.5 inline-flex items-center justify-center text-xs rounded-t-md border-t-2 border-x border-b-0 transition-colors whitespace-nowrap relative -mb-px select-none cursor-pointer ${
                    activeTab === "response_review"
                      ? "border-t-blue-500 border-x-blue-500/80 bg-background text-blue-900 dark:text-blue-300 font-bold z-10 shadow-xs"
                      : "border-t-transparent border-x-transparent bg-slate-100/90 dark:bg-slate-800/70 text-slate-600 dark:text-slate-400 font-medium hover:bg-slate-200/80 dark:hover:bg-slate-700/70 hover:text-foreground"
                  }`}
                >
                  <History className="w-3 h-3 mr-1 text-primary" />
                  Response & Review
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setActiveTab("reviewer_draft")}
                  className={`h-8 px-3.5 inline-flex items-center justify-center text-xs rounded-t-md border-t-2 border-x border-b-0 transition-colors whitespace-nowrap relative -mb-px select-none cursor-pointer ${
                    activeTab === "reviewer_draft"
                      ? "border-t-blue-500 border-x-blue-500/80 bg-background text-blue-900 dark:text-blue-300 font-bold z-10 shadow-xs"
                      : "border-t-transparent border-x-transparent bg-slate-100/90 dark:bg-slate-800/70 text-slate-600 dark:text-slate-400 font-medium hover:bg-slate-200/80 dark:hover:bg-slate-700/70 hover:text-foreground"
                  }`}
                >
                  <FileCheck className="w-3 h-3 mr-1 text-emerald-500" />
                  Reviewer Draft
                </button>
              )}

              {/* TAB: Polish Draft */}
              <button
                type="button"
                onClick={() => setActiveTab("ai_assist")}
                className={`h-8 px-3.5 inline-flex items-center justify-center text-xs rounded-t-md border-t-2 border-x border-b-0 transition-colors whitespace-nowrap relative -mb-px select-none cursor-pointer ${
                  activeTab === "ai_assist"
                    ? "border-t-purple-500 border-x-purple-500/80 bg-background text-purple-900 dark:text-purple-300 font-bold z-10 shadow-xs"
                    : "border-t-transparent border-x-transparent bg-slate-100/90 dark:bg-slate-800/70 text-slate-600 dark:text-slate-400 font-medium hover:bg-slate-200/80 dark:hover:bg-slate-700/70 hover:text-foreground"
                }`}
              >
                <Sparkles className="w-3 h-3 mr-1 text-purple-500" />
                Polish Draft
              </button>
            </div>

            {canScrollRight && (
              <button
                type="button"
                onClick={() => scrollTabs("right")}
                className="h-7 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground bg-muted/60 rounded-sm mb-px transition-colors"
                title="Scroll right"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* LOADING STATE */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground space-y-2">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-xs">Loading question details...</p>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB: RESPONSE & REVIEW (For Review/Validator Phase)         */}
        {/* ============================================================ */}
        {!isLoading && activeTab === "response_review" && isReviewPhase && (
          <div className="flex-1 flex flex-col space-y-3">
            {/* Render Full Review History Timeline with all responses, diffs & comments */}
            <div className="flex-1 overflow-y-auto pr-1">
              <RevampReviewHistoryTimeline
                history={history}
                isSubmittingAnswer={isSubmitting}
                rejectionReason={rejectionReason}
                isRejectionSubmitted={false}
                checklist={checklist}
                setChecklist={setChecklist}
                setIsRejectDialogOpen={setIsRejectDialogOpen}
                setIsModifyDialogOpen={setIsModifyDialogOpen}
                handleAccept={handleAccept}
                questionId={questionId}
                selectedQuestionData={selectedQuestionData || undefined}
                setSelectedQuestion={onQuestionSelect || (() => {})}
                refetchQuestions={refetchQuestions}
              />
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* ============================================================ */}
        {/* TAB: REVIEWER DRAFT (For Author Phase)                       */}
        {/* ============================================================ */}
        {!isLoading && activeTab === "reviewer_draft" && !isReviewPhase && (
          <div className="flex-1 flex flex-col space-y-3">
            <ChemicalVerifiedTextarea
              key={questionId || "author-draft"}
              id="reviewer-draft-answer"
              label={
                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <FileCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Reviewer Draft</span>
                </label>
              }
              placeholder="Type or review the expert response here..."
              value={translatedDraftText || draftAnswer}
              onChange={(val) => {
                setTranslatedDraftText("");
                setDraftAnswer(val);
                setChemicalDetectionResult(null);
              }}
              onVerificationComplete={(response) => {
                setChemicalDetectionResult(response);
              }}
              minHeight={isEnlarged ? "min-h-[280px]" : "min-h-[160px]"}
              maxHeight={isEnlarged ? "max-h-[calc(100vh-320px)]" : "max-h-[380px]"}
              textSizeClassName="text-xs leading-relaxed"
              textareaClassName={cn(
                "resize-none rounded-lg focus-visible:ring-1 focus-visible:ring-primary",
                aiAnswerText &&
                  draftAnswer &&
                  draftAnswer.trim() === aiAnswerText.trim()
                    ? "border-blue-400/80 bg-blue-50/25 dark:bg-blue-950/20 italic"
                    : "border-border/80 bg-background"
              )}
              actions={
                <div className="flex items-center gap-1.5">
                  {draftAnswer?.trim() && !isEnglishCharacters(draftAnswer) && (
                    <SarvamTranslateDropdown
                      query={draftAnswer}
                      onTranslate={(result) => setTranslatedDraftText(result)}
                    />
                  )}
                  <TooltipProvider>
                    <Tooltip delayDuration={200}>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          type="button"
                          onClick={handleResetDraft}
                          className="h-8 w-8 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                          aria-label="Reset draft"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span className="sr-only">Reset</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs py-1 px-2">
                        Reset
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              }
              helperText={`${wordCount} words • ${charCount} characters`}
              bottomOverlay={
                aiAnswerText &&
                draftAnswer &&
                draftAnswer.trim() === aiAnswerText.trim() ? (
                  <div className="absolute right-3 bottom-3 pointer-events-none z-20">
                    <Badge
                      variant="outline"
                      className="text-[10px] bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-400/40 gap-1 font-medium backdrop-blur-xs"
                    >
                      <Bot className="w-3 h-3" />
                      AI Pre-filled
                    </Badge>
                  </div>
                ) : null
              }
            />

            {/* Remarks Section */}
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-muted-foreground">
                Remarks
              </Label>
              <Textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Add reviewer remarks or references..."
                className="min-h-[50px] p-2 text-xs resize-none rounded-lg bg-background border-border/80 focus-visible:ring-1 focus-visible:ring-primary"
              />
            </div>

            {/* Source URL Manager */}
            <div className="rounded-lg border border-border/80 bg-muted/20 p-2.5">
              <SourceUrlManager sources={sources} onSourcesChange={setSources} />
            </div>

            {/* Author Submit Action Bar */}
            <div className="flex items-center justify-end pt-1">
              <ConfirmationModal
                title="Submit Response"
                description="You are the first expert responding to this question. Please cross-check your answer carefully before submitting — accurate responses improve your approval conversion rate."
                confirmText="Submit Response"
                cancelText="Cancel"
                onConfirm={handleAuthorSubmit}
                trigger={
                  <Button
                    disabled={!draftAnswer.trim() || isSubmitting || hasBannedChemicals}
                    title={
                      hasBannedChemicals
                        ? "Answers containing banned chemicals cannot be submitted. Please remove or replace them."
                        : undefined
                    }
                    className={cn(
                      "h-8 px-4 text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors",
                      hasBannedChemicals
                        ? "bg-destructive/80 text-destructive-foreground cursor-not-allowed"
                        : "bg-primary text-primary-foreground hover:bg-primary/90"
                    )}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Submitting...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>Submit Response</span>
                      </>
                    )}
                  </Button>
                }
              />
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* ============================================================ */}
        {/* TAB: AI GENERATED ANSWER (Read Only / Reference)             */}
        {/* ============================================================ */}
        {!isLoading && !isReviewPhase && activeTab === "ai_answer" && (
          <div className="rounded-xl border border-border/70 bg-muted/20 p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Bot className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>AI Suggested Answer</span>
                <span className="text-[10px] font-normal text-muted-foreground">(Reference)</span>
              </div>

              {hasAiAnswer && (
                <div className="flex items-center gap-1.5">
                  {aiAnswerText?.trim() && !isEnglishCharacters(aiAnswerText) && (
                    <SarvamTranslateDropdown
                      query={aiAnswerText}
                      onTranslate={(result) => setTranslatedAiText(result)}
                    />
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleUseAiAnswerInDraft}
                    className="h-6 px-2.5 text-[11px] font-medium text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30 hover:bg-blue-100"
                  >
                    <FileText className="w-3 h-3 mr-1" />
                    Use in Draft
                  </Button>
                </div>
              )}
            </div>

            {hasAiAnswer ? (
              <div className="space-y-3">
                <div className="p-3.5 rounded-lg bg-background border border-border/60 text-xs font-normal text-foreground/90 whitespace-pre-wrap leading-relaxed min-h-[160px] max-h-[320px] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                  {translatedAiText || aiAnswerText}
                </div>

                {/* AI Reference Sources if present */}
                {aiSourcesList.length > 0 && (
                  <div className="p-2.5 rounded-lg bg-background/80 border border-border/60 space-y-2">
                    <div className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      <Link2 className="w-3 h-3 text-primary" />
                      <span>Referenced Sources ({aiSourcesList.length})</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {aiSourcesList.map((src, idx) => (
                        <div
                          key={idx}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] bg-muted/60 border border-border/70 text-foreground"
                        >
                          <span className="font-medium text-primary">
                            {src.sourceName || src.sourceType || "Source"}
                          </span>
                          {src.page && (
                            <span className="text-muted-foreground">p. {src.page}</span>
                          )}
                          {src.source && (
                            <a
                              href={src.source}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-500 hover:underline inline-flex items-center ml-0.5"
                              title={src.source}
                            >
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border/80 bg-background/50 p-6 flex flex-col items-center justify-center text-center space-y-3 min-h-[220px]">
                <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <Bot className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs sm:text-sm font-semibold text-foreground">
                    {isReviewPhase
                      ? "No AI Generated Answer Recorded"
                      : "No AI Generated Answer Available"}
                  </p>
                  <p className="text-xs text-muted-foreground max-w-sm">
                    {isReviewPhase
                      ? "This question is in review mode. AI initial answers are created during initial authoring before human submissions."
                      : "No initial AI response was found. You can generate one on-demand using agricultural context or write directly in the draft."}
                  </p>
                </div>

                {!isReviewPhase && (
                  <div className="pt-2 flex flex-col sm:flex-row items-center gap-2">
                    <Select
                      value={selectedGenState}
                      onValueChange={setSelectedGenState}
                    >
                      <SelectTrigger className="h-8 w-[160px] text-xs">
                        <SelectValue placeholder="Select State" />
                      </SelectTrigger>
                      <SelectContent>
                        {statesList.map((st) => (
                          <SelectItem key={st} value={st} className="text-xs">
                            {st}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Button
                      size="sm"
                      onClick={handleGenerateAiInitialAnswer}
                      disabled={isFetchingAiAnswer}
                      className="h-8 px-3 text-xs bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 shadow-xs"
                    >
                      {isFetchingAiAnswer ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Generating AI Answer...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Generate AI Answer</span>
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB: POLISH DRAFT & REFERENCE CHECKS                         */}
        {/* ============================================================ */}
        {!isLoading && activeTab === "ai_assist" && (
          <PolishDraftAssistant
            questionText={
              selectedQuestionData?.text ||
              (selectedQuestionData as any)?.question?.text ||
              (selectedQuestionData as any)?.question?.question ||
              (selectedQuestionData as any)?.question ||
              ""
            }
            draftAnswer={translatedDraftText || draftAnswer}
            onApplySuggestedText={(suggestedText) => {
              setDraftAnswer(suggestedText);
              setTranslatedDraftText("");
              setActiveTab(isReviewPhase ? "response_review" : "reviewer_draft");
            }}
            isEnlarged={isEnlarged}
          />
        )}
      </CardContent>

      {/* REJECT & MODIFY DIALOGS (For Review Phase) */}
      <ReviewResponseDialog
        isOpen={isRejectDialogOpen}
        onOpenChange={setIsRejectDialogOpen}
        type="reject"
        title="Reject Response"
        icon={<XCircle className="w-5 h-5 text-red-500 dark:text-red-700" />}
        reasonLabel="Reason for Rejection"
        submitReasonText="Submit Reason"
        checklist={checklist}
        onChecklistChange={setChecklist}
        rejectionReason={rejectionReason}
        setRejectionReason={setRejectionReason}
        isStageSubmitted={isRejectionSubmitted}
        setIsStageSubmitted={setIsRejectionSubmitted}
        newAnswer={draftAnswer}
        setNewAnswer={setDraftAnswer}
        selectedQuestionData={selectedQuestionData}
        isSubmitting={isSubmitting}
        handleSubmit={handleRejectOrModify}
        handleReset={handleResetDraft}
        sources={sources}
        setSources={setSources}
        confirmOpen={isRejectConfirmOpen}
        setConfirmOpen={setIsRejectConfirmOpen}
        remarks={remarks}
        setRemarks={setRemarks}
      />

      <ReviewResponseDialog
        isOpen={isModifyDialogOpen}
        onOpenChange={setIsModifyDialogOpen}
        title="Modify Response"
        type="modify"
        icon={<Pencil className="w-5 h-5 text-blue-500 dark:text-blue-400" />}
        reasonLabel="Reason for Modification"
        submitReasonText="Proceed"
        checklist={checklist}
        onChecklistChange={setChecklist}
        rejectionReason={rejectionReason}
        setRejectionReason={setRejectionReason}
        isStageSubmitted={isRejectionSubmitted}
        setIsStageSubmitted={setIsRejectionSubmitted}
        newAnswer={draftAnswer}
        setNewAnswer={setDraftAnswer}
        selectedQuestionData={selectedQuestionData}
        isSubmitting={isSubmitting}
        handleSubmit={handleRejectOrModify}
        handleReset={handleResetDraft}
        sources={sources}
        setSources={setSources}
        confirmOpen={isRejectConfirmOpen}
        setConfirmOpen={setIsRejectConfirmOpen}
        remarks={remarks}
        setRemarks={setRemarks}
      />
    </Card>
  );
};
