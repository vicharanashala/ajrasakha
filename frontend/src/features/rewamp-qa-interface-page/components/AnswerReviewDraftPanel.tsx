import React, { useState, useRef, useEffect } from "react";
import {
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  Bot,
  Sparkles,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  ListChecks,
  Link2,
  Code2,
  Languages,
  RotateCcw,
  CheckCircle2,
  Wand2,
  FileCheck,
  RefreshCw,
  ArrowDownToLine,
  FileText,
  Send,
  Loader2,
  History,
  XCircle,
  Pencil,
  CheckCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/atoms/card";
import { Button } from "@/components/atoms/button";
import { Label } from "@/components/atoms/label";
import { Textarea } from "@/components/atoms/textarea";
import { Badge } from "@/components/atoms/badge";
import { SourceUrlManager } from "@/components/source-url-manager";
import { ConfirmationModal } from "@/components/confirmation-modal";
import { toast } from "sonner";
import type { IQuestion, IReviewParmeters, SourceItem } from "@/types";
import type { AiAssistActionType } from "../types";
import { RevampReviewHistoryTimeline } from "./RevampReviewHistoryTimeline";
import { ReviewResponseDialog } from "@/features/qa-interface-page/ReviewResponseDialog";
import { AcceptReviewDialog } from "@/features/qa-interface-page/AcceptReviewDialog";
import SarvamTranslateDropdown from "@/components/SarvamTranslateDropdown";
import { isEnglishCharacters } from "@/features/questions/utils/checkLanguage";
import { useReRouteRejectQuestion } from "@/hooks/api/question/useReRouteRejectQuestion";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog";

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
}

export const AnswerReviewDraftPanel: React.FC<AnswerReviewDraftPanelProps> = ({
  selectedQuestionData,
  isLoading = false,
  actionType = "allocated",
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
}) => {
  // Determine if this question is in the Review Phase (has existing answer history)
  const history = selectedQuestionData?.history || [];
  const isReviewPhase = Boolean(history && history.length > 0);

  // Tab State - AI Generated tab is first and active by default
  const [activeTab, setActiveTab] = useState<"ai_answer" | "response_review" | "reviewer_draft" | "ai_assist">("ai_answer");

  // Always default to AI Generated Answer when a new question is selected
  useEffect(() => {
    setActiveTab("ai_answer");
  }, [selectedQuestionData?.id, (selectedQuestionData as any)?._id]);

  const aiAnswerText =
    selectedQuestionData?.source === "AJRASAKHA"
      ? selectedQuestionData.aiApprovedAnswer || selectedQuestionData.aiInitialAnswer || initialAiAnswer || ""
      : selectedQuestionData?.aiInitialAnswer || initialAiAnswer || "";

  const hasAiAnswer = Boolean(aiAnswerText && aiAnswerText.trim().length > 0);

  const [draftAnswer, setDraftAnswer] = useState<string>(initialDraft);
  const [remarks, setRemarks] = useState<string>(initialRemarks);
  const [sources, setSources] = useState<SourceItem[]>(initialSources);
  const [translatedAiText, setTranslatedAiText] = useState<string>("");
  const [translatedDraftText, setTranslatedDraftText] = useState<string>("");

  const [aiAssistOutput, setAiAssistOutput] = useState<string>("");
  const [activeAiAction, setActiveAiAction] = useState<AiAssistActionType | null>(null);
  const [isAiProcessing, setIsAiProcessing] = useState(false);

  // Review & History Phase States
  const [rejectionReason, setRejectionReason] = useState("");
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [isModifyDialogOpen, setIsModifyDialogOpen] = useState(false);
  const [isRejectConfirmOpen, setIsRejectConfirmOpen] = useState(false);
  const [rerouteModal, setRerouteModal] = useState(false);
  const [rejectReRouteReason, setRejectReRouteReason] = useState("");

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

  // Pre-fill answer & sources when reviewing
  useEffect(() => {
    if (currentReviewingAnswer?.answer && currentReviewingAnswer?.sources) {
      setDraftAnswer(currentReviewingAnswer.answer);
      setSources(currentReviewingAnswer.sources);
      if (currentReviewingAnswer.remarks) {
        setRemarks(currentReviewingAnswer.remarks);
      }
    }
  }, [currentReviewingAnswer]);

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
    toast.info("Draft, remarks, and sources have been cleared.");
  };

  const handleAiAssist = (action: AiAssistActionType) => {
    setActiveAiAction(action);
    setIsAiProcessing(true);

    setTimeout(() => {
      let result = "";
      const baseText = draftAnswer || aiAnswerText;

      switch (action) {
        case "polish":
          result = `✨ [Polished]: ${baseText.slice(0, 180)}...\n• High-potency management applied with structured terminology for better clarity.`;
          break;
        case "simplify":
          result = `🌿 [Simplified]: To control sucking pests in brinjal, keep fields clean, inspect under leaves regularly, and use neem-based organic sprays or approved chemical treatments.`;
          break;
        case "shorten":
          result = `⚡ [Shortened]: Brinjal sucking pests (aphids, thrips, whiteflies) cause yellowing. Control: Clean fields, promote ladybird predators, and apply recommended insecticide per PoP.`;
          break;
        case "summarise":
          result = `📝 [Summary]: Sucking pests degrade brinjal yield. Recommended actions include field hygiene, biological controls, and targeted chemical applications based on localized PoP.`;
          break;
        case "farmer_friendly":
          result = `👨‍🌾 [Farmer Friendly]: बैंगन की फसल में रस चूसक कीटों (माहू, सफेद मक्खी) से बचाव के लिए खेत साफ रखें और नीम के तेल (3ml/लीटर) का छिड़काव करें। जरूरत पड़ने पर कृषि विशेषज्ञ की सलाह अनुसार दवाई डालें।`;
          break;
        case "improve_structure":
          result = `📋 [Structured]:\n1. Overview: Sucking pests damage tender shoots.\n2. Preventive Steps: Remove infested leaves.\n3. Intervention: Apply recommended treatments.`;
          break;
        case "translate":
          result = `🌐 [Translated Hindi]: बैंगन में रस चूसक कीटों के प्रभावी नियंत्रण के लिए स्थानीय पैकेज ऑफ प्रैक्टिसेज के अनुसार कीटनाशक और जैविक उपायों का प्रयोग करें।`;
          break;
        default:
          result = baseText;
      }

      setAiAssistOutput(result);
      setIsAiProcessing(false);
      toast.success(`AI Assist: ${action.replace("_", " ")} completed`);
    }, 600);
  };

  const handleApplyAiAssist = () => {
    if (!aiAssistOutput) return;
    setDraftAnswer((prev) => (prev ? `${prev}\n\n${aiAssistOutput}` : aiAssistOutput));
    setActiveTab(isReviewPhase ? "response_review" : "reviewer_draft");
    toast.success("Applied AI suggestion to Draft!");
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

  const { rejectReRoute, isRejecting: isRejectingReRoute } = useReRouteRejectQuestion();

  const handleRejectReRouteAnswer = async (reason: string) => {
    if (reason.trim() === "") {
      toast.error("No reason provided for rejection");
      return;
    }
    if (reason.length < 8) {
      toast.error("Rejection reason must be at least 8 characters");
      return;
    }

    const h = selectedQuestionData?.history?.[0];
    if (!h || !h.rerouteId || !h.question?._id || !h.moderator?._id || !h.reroute?.reroutedTo) {
      console.error("Required data is missing for rejectReRoute");
      toast.error("Missing required metadata to reject re-route.");
      return;
    }

    try {
      await rejectReRoute({
        reason,
        rerouteId: h.rerouteId,
        questionId: h.question._id,
        moderatorId: h.moderator._id,
        expertId: h.reroute.reroutedTo,
        role: "expert",
      });

      onQuestionSelect?.(null);
      refetchQuestions?.();
      toast.success("Successfully rejected the Re-Route Question");
    } catch (error) {
      console.error("Failed to reject reroute question:", error);
      toast.error("Failed to reject reroute question");
    }
  };

  if (isCollapsed) {
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
              {/* TAB 1: AI Generated Answer (Always First) */}
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

              {/* TAB 2: Response & Review (if review phase) or Reviewer Draft (if author phase) */}
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

              {/* TAB 3: AI Assist */}
              <button
                type="button"
                onClick={() => setActiveTab("ai_assist")}
                className={`h-8 px-3.5 inline-flex items-center justify-center text-xs rounded-t-md border-t-2 border-x border-b-0 transition-colors whitespace-nowrap relative -mb-px select-none cursor-pointer ${
                  activeTab === "ai_assist"
                    ? "border-t-blue-500 border-x-blue-500/80 bg-background text-blue-900 dark:text-blue-300 font-bold z-10 shadow-xs"
                    : "border-t-transparent border-x-transparent bg-slate-100/90 dark:bg-slate-800/70 text-slate-600 dark:text-slate-400 font-medium hover:bg-slate-200/80 dark:hover:bg-slate-700/70 hover:text-foreground"
                }`}
              >
                <Sparkles className="w-3 h-3 mr-1 text-purple-500" />
                AI Assist
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

          {/* Right Collapse Toggle */}
          {onToggleCollapse && (
            <div className="flex items-center shrink-0 pb-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleCollapse}
                className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
                title="Collapse Panel"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
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
        {/* TAB: REVIEWER DRAFT (For Author Phase)                       */}
        {/* ============================================================ */}
        {!isLoading && activeTab === "reviewer_draft" && !isReviewPhase && (
          <div className="flex-1 flex flex-col space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <FileCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Reviewer Draft / Edit Answer</span>
              </label>

              {/* Action Buttons: Reset / Clear Draft + Use AI Answer */}
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetDraft}
                  className="h-6 px-2 text-[11px] text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors"
                  title="Clear draft, remarks, and sources"
                >
                  <RotateCcw className="w-3 h-3 mr-1" />
                  Reset
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleUseAiAnswerInDraft}
                  className="h-6 px-2 text-[11px] text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900 hover:bg-blue-50/60 transition-colors"
                >
                  Use AI Answer
                </Button>
              </div>
            </div>

            {/* Rich Editor Toolbar */}
            <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg border border-border/80 bg-muted/40">
              <select className="h-6 text-[11px] bg-background border border-border/80 rounded px-1.5 font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                <option value="normal">Normal</option>
                <option value="h1">Heading 1</option>
                <option value="h2">Heading 2</option>
                <option value="bullet">Bullet</option>
              </select>

              <div className="h-3.5 w-px bg-border/80 mx-0.5" />

              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDraftAnswer((prev) => `**${prev}**`)}
                className="h-6 w-6 rounded text-muted-foreground hover:text-foreground"
                title="Bold"
              >
                <Bold className="w-3 h-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDraftAnswer((prev) => `*${prev}*`)}
                className="h-6 w-6 rounded text-muted-foreground hover:text-foreground"
                title="Italic"
              >
                <Italic className="w-3 h-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDraftAnswer((prev) => `<u>${prev}</u>`)}
                className="h-6 w-6 rounded text-muted-foreground hover:text-foreground"
                title="Underline"
              >
                <Underline className="w-3 h-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDraftAnswer((prev) => `~~${prev}~~`)}
                className="h-6 w-6 rounded text-muted-foreground hover:text-foreground"
                title="Strikethrough"
              >
                <Strikethrough className="w-3 h-3" />
              </Button>

              <div className="h-3.5 w-px bg-border/80 mx-0.5" />

              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDraftAnswer((prev) => `${prev}\n• `)}
                className="h-6 w-6 rounded text-muted-foreground hover:text-foreground"
                title="Bullet List"
              >
                <List className="w-3 h-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDraftAnswer((prev) => `${prev}\n1. `)}
                className="h-6 w-6 rounded text-muted-foreground hover:text-foreground"
                title="Numbered List"
              >
                <ListOrdered className="w-3 h-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDraftAnswer((prev) => `${prev}\n- [ ] `)}
                className="h-6 w-6 rounded text-muted-foreground hover:text-foreground"
                title="Task List"
              >
                <ListChecks className="w-3 h-3" />
              </Button>

              <div className="h-3.5 w-px bg-border/80 mx-0.5" />

              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDraftAnswer((prev) => `${prev} [Link Title](https://)`)}
                className="h-6 w-6 rounded text-muted-foreground hover:text-foreground"
                title="Add Link"
              >
                <Link2 className="w-3 h-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDraftAnswer((prev) => `${prev}\n\`\`\`\n\n\`\`\``)}
                className="h-6 w-6 rounded text-muted-foreground hover:text-foreground"
                title="Code Block"
              >
                <Code2 className="w-3 h-3" />
              </Button>

              <div className="ml-auto flex items-center gap-2">
                {draftAnswer?.trim() && !isEnglishCharacters(draftAnswer) && (
                  <SarvamTranslateDropdown
                    query={draftAnswer}
                    onTranslate={(result) => setTranslatedDraftText(result)}
                  />
                )}
                <span className="text-[10px] text-muted-foreground font-mono">
                  {wordCount} words • {charCount} chars
                </span>
              </div>
            </div>

            {/* Answer Draft Textarea */}
            <Textarea
              value={translatedDraftText || draftAnswer}
              onChange={(e) => {
                setTranslatedDraftText("");
                setDraftAnswer(e.target.value);
              }}
              placeholder="Type or review the expert response here..."
              className="flex-1 min-h-[160px] p-3 text-xs leading-relaxed resize-none rounded-lg bg-background border-border/80 focus-visible:ring-1 focus-visible:ring-primary"
            />

            {/* Remarks Section */}
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-muted-foreground">
                Remarks / Internal Notes
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
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Auto-saved to local session</span>
              </div>

              <ConfirmationModal
                title="Submit Response"
                description="You are the first expert responding to this question. Please cross-check your answer carefully before submitting — accurate responses improve your approval conversion rate."
                confirmText="Submit Response"
                cancelText="Cancel"
                onConfirm={handleAuthorSubmit}
                trigger={
                  <Button
                    disabled={!draftAnswer.trim() || isSubmitting}
                    className="h-8 px-4 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 shadow-xs"
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
        {/* TAB: AI GENERATED ANSWER (Read Only)                         */}
        {/* ============================================================ */}
        {!isLoading && activeTab === "ai_answer" && (
          <div className="rounded-xl border border-border/70 bg-muted/20 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Bot className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>AI Suggested Answer</span>
                <span className="text-[10px] font-normal text-muted-foreground">(Read Only)</span>
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
              <div className="p-3 rounded-lg bg-background border border-border/60 text-xs font-normal text-foreground/90 whitespace-pre-wrap leading-relaxed min-h-[200px] max-h-[360px] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                {translatedAiText || aiAnswerText}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border/80 bg-background/50 p-8 flex flex-col items-center justify-center text-center space-y-2 min-h-[200px]">
                <div className="w-10 h-10 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground mb-1">
                  <Bot className="w-5 h-5 opacity-60" />
                </div>
                <p className="text-xs sm:text-sm font-semibold text-foreground">No AI Generated Answer</p>
                <p className="text-xs text-muted-foreground max-w-sm">
                  There is no AI-generated answer available for this question. You can write your response in the Reviewer Draft or use the AI Assist tools.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB: AI ASSIST TOOLS                                         */}
        {/* ============================================================ */}
        {!isLoading && activeTab === "ai_assist" && (
          <div className="flex-1 flex flex-col space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Wand2 className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                <span>AI Enhancement Tools</span>
              </span>
              <span className="text-[11px] text-muted-foreground">Select an action to refine the answer text</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAiAssist("polish")}
                disabled={isAiProcessing}
                className={`h-auto min-h-[36px] py-1.5 px-2.5 text-xs justify-start font-medium text-left whitespace-normal leading-tight ${
                  activeAiAction === "polish" ? "border-purple-500 bg-purple-500/10 text-purple-700 dark:text-purple-300" : ""
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 mr-1.5 text-purple-500 shrink-0" />
                <span>Polish</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAiAssist("simplify")}
                disabled={isAiProcessing}
                className={`h-auto min-h-[36px] py-1.5 px-2.5 text-xs justify-start font-medium text-left whitespace-normal leading-tight ${
                  activeAiAction === "simplify" ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : ""
                }`}
              >
                <Wand2 className="w-3.5 h-3.5 mr-1.5 text-emerald-500 shrink-0" />
                <span>Simplify</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAiAssist("shorten")}
                disabled={isAiProcessing}
                className={`h-auto min-h-[36px] py-1.5 px-2.5 text-xs justify-start font-medium text-left whitespace-normal leading-tight ${
                  activeAiAction === "shorten" ? "border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300" : ""
                }`}
              >
                <ArrowDownToLine className="w-3.5 h-3.5 mr-1.5 text-amber-500 shrink-0" />
                <span>Shorten</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAiAssist("summarise")}
                disabled={isAiProcessing}
                className={`h-auto min-h-[36px] py-1.5 px-2.5 text-xs justify-start font-medium text-left whitespace-normal leading-tight ${
                  activeAiAction === "summarise" ? "border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-300" : ""
                }`}
              >
                <FileText className="w-3.5 h-3.5 mr-1.5 text-blue-500 shrink-0" />
                <span>Summarise</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAiAssist("farmer_friendly")}
                disabled={isAiProcessing}
                className={`h-auto min-h-[36px] py-1.5 px-2.5 text-xs justify-start font-medium text-left whitespace-normal leading-tight ${
                  activeAiAction === "farmer_friendly" ? "border-green-600 bg-green-600/10 text-green-700 dark:text-green-300" : ""
                }`}
              >
                <span className="mr-1.5 shrink-0">👨‍🌾</span>
                <span>Farmer Friendly</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAiAssist("improve_structure")}
                disabled={isAiProcessing}
                className={`h-auto min-h-[36px] py-1.5 px-2.5 text-xs justify-start font-medium text-left whitespace-normal leading-tight ${
                  activeAiAction === "improve_structure" ? "border-indigo-500 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300" : ""
                }`}
              >
                <ListOrdered className="w-3.5 h-3.5 mr-1.5 text-indigo-500 shrink-0" />
                <span>Improve Structure</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAiAssist("translate")}
                disabled={isAiProcessing}
                className={`h-auto min-h-[36px] py-1.5 px-2.5 text-xs justify-start font-medium text-left whitespace-normal leading-tight ${
                  activeAiAction === "translate" ? "border-sky-500 bg-sky-500/10 text-sky-700 dark:text-sky-300" : ""
                }`}
              >
                <Languages className="w-3.5 h-3.5 mr-1.5 text-sky-500 shrink-0" />
                <span>Hindi Translation</span>
              </Button>
            </div>

            {/* AI Output / Processing Container */}
            <div className="flex-1 min-h-[160px] rounded-lg border border-border/80 bg-muted/20 p-3 flex flex-col justify-between">
              {isAiProcessing ? (
                <div className="flex-1 flex flex-col items-center justify-center space-y-2 py-6">
                  <Loader2 className="w-5 h-5 text-purple-600 animate-spin" />
                  <span className="text-xs text-muted-foreground">Generating enhancement...</span>
                </div>
              ) : aiAssistOutput ? (
                <>
                  <div className="text-xs font-normal text-foreground whitespace-pre-wrap leading-relaxed max-h-[220px] overflow-y-auto">
                    {aiAssistOutput}
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(aiAssistOutput);
                        toast.success("Copied to clipboard!");
                      }}
                      className="h-6 text-[11px]"
                    >
                      Copy Output
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleApplyAiAssist}
                      className="h-6 px-2.5 text-[11px] bg-purple-600 hover:bg-purple-700 text-white"
                    >
                      Apply to Draft
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                  <Sparkles className="w-6 h-6 text-muted-foreground/40 mb-1.5" />
                  <p className="text-xs text-muted-foreground font-medium">
                    Click any tool above to generate enhanced phrasing
                  </p>
                </div>
              )}
            </div>
          </div>
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
        isStageSubmitted={false}
        setIsStageSubmitted={() => {}}
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
        isStageSubmitted={false}
        setIsStageSubmitted={() => {}}
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

      {/* REROUTE REJECT DIALOG */}
      <Dialog open={rerouteModal} onOpenChange={setRerouteModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Rejection Reason *</DialogTitle>
          </DialogHeader>
          <Textarea
            value={rejectReRouteReason}
            onChange={(e) => setRejectReRouteReason(e.target.value)}
            rows={6}
            className="mt-2 h-[30vh]"
            placeholder="Write your reason..."
          />

          <DialogFooter className="mt-4 gap-2">
            <Button variant="outline" onClick={() => setRerouteModal(false)}>
              Cancel
            </Button>
            <Button
              disabled={rejectReRouteReason.length < 8 || isRejectingReRoute}
              onClick={() => {
                handleRejectReRouteAnswer(rejectReRouteReason);
                setRerouteModal(false);
              }}
            >
              {isRejectingReRoute ? "Submitting..." : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
