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
} from "lucide-react";
import { Card, CardContent } from "@/components/atoms/card";
import { Button } from "@/components/atoms/button";
import { Label } from "@/components/atoms/label";
import { Textarea } from "@/components/atoms/textarea";
import { SourceUrlManager } from "@/components/source-url-manager";
import { ConfirmationModal } from "@/components/confirmation-modal";
import { toast } from "sonner";
import type { SourceItem } from "@/types";
import type { AiAssistActionType } from "../types";

interface AnswerReviewDraftPanelProps {
  initialAiAnswer?: string;
  initialDraft?: string;
  initialRemarks?: string;
  initialSources?: SourceItem[];
  onSave?: (data: { answer: string; remarks: string; sources: SourceItem[] }) => void;
  onSubmit?: (data: { answer: string; remarks: string; sources: SourceItem[] }) => void | Promise<void>;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const AnswerReviewDraftPanel: React.FC<AnswerReviewDraftPanelProps> = ({
  initialAiAnswer,
  initialDraft = "",
  initialRemarks = "",
  initialSources = [],
  onSave,
  onSubmit,
  isCollapsed = false,
  onToggleCollapse,
}) => {
  const [activeTab, setActiveTab] = useState<"ai_answer" | "reviewer_draft" | "ai_assist">("ai_answer");

  const defaultAiAnswer =
    initialAiAnswer ||
    `Sucking pests such as aphids, whiteflies, and thrips can significantly affect brinjal crops by sucking sap from leaves and tender shoots, leading to yellowing, leaf curling, stunted growth and reduced fruit quality.

1. Key Identification
• Aphids – soft-bodied, green or black insects on tender shoots and undersides of leaves.
• Whiteflies – small, white, winged insects found on leaf undersides.
• Thrips – slender, yellowish insects causing silvery patches on leaves.

2. Management Measures
• Cultural practices: Regular field monitoring, removal of infested leaves, and maintaining field hygiene.
• Biological control: Conservation of natural enemies like ladybird beetles and parasitoids.
• Chemical control: Use recommended insecticides as per local PoP (see table).`;

  const [aiAnswerText] = useState<string>(defaultAiAnswer);
  const [draftAnswer, setDraftAnswer] = useState<string>(initialDraft);
  const [remarks, setRemarks] = useState<string>(initialRemarks);
  const [sources, setSources] = useState<SourceItem[]>(initialSources);

  const [aiAssistOutput, setAiAssistOutput] = useState<string>("");
  const [activeAiAction, setActiveAiAction] = useState<AiAssistActionType | null>(null);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    toast.info("Reviewer draft, remarks, and sources have been cleared.");
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
    setActiveTab("reviewer_draft");
    toast.success("Applied AI suggestion to Reviewer Draft!");
  };

  const handleUseAiAnswerInDraft = () => {
    setDraftAnswer(aiAnswerText);
    setRemarks("AI Suggested Answer");
    setActiveTab("reviewer_draft");
    toast.success("Copied AI generated answer into Reviewer Draft!");
  };

  const handleSubmitResponse = async () => {
    if (!draftAnswer.trim()) {
      toast.error("Please enter an answer before submitting!");
      return;
    }
    if (sources.length === 0) {
      toast.error("At least one source is required!");
      return;
    }

    setIsSubmitting(true);
    try {
      if (onSubmit) {
        await onSubmit({ answer: draftAnswer, remarks, sources });
      } else {
        // Sample submission flow
        await new Promise((r) => setTimeout(r, 700));
        toast.success("Your response has been submitted successfully. Thank you!");
        handleResetDraft();
      }
    } catch (error) {
      console.error("Submission failed:", error);
      toast.error("Failed to submit response. Please try again.");
    } finally {
      setIsSubmitting(false);
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
            Answer Review & Draft
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
        {/* Navigation Tabs Bar with optional overflow chevrons */}
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
              <button
                type="button"
                onClick={() => setActiveTab("ai_answer")}
                className={`h-8 px-3.5 inline-flex items-center justify-center text-xs rounded-t-md border-t-2 border-x border-b-0 transition-colors whitespace-nowrap relative -mb-px select-none cursor-pointer ${
                  activeTab === "ai_answer"
                    ? "border-t-blue-500 border-x-blue-500/80 bg-background text-blue-900 dark:text-blue-300 font-bold z-10 shadow-xs"
                    : "border-t-transparent border-x-transparent bg-slate-100/90 dark:bg-slate-800/70 text-slate-600 dark:text-slate-400 font-medium hover:bg-slate-200/80 dark:hover:bg-slate-700/70 hover:text-foreground"
                }`}
              >
                AI Generated Answer
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("reviewer_draft")}
                className={`h-8 px-3.5 inline-flex items-center justify-center text-xs rounded-t-md border-t-2 border-x border-b-0 transition-colors whitespace-nowrap relative -mb-px select-none cursor-pointer ${
                  activeTab === "reviewer_draft"
                    ? "border-t-blue-500 border-x-blue-500/80 bg-background text-blue-900 dark:text-blue-300 font-bold z-10 shadow-xs"
                    : "border-t-transparent border-x-transparent bg-slate-100/90 dark:bg-slate-800/70 text-slate-600 dark:text-slate-400 font-medium hover:bg-slate-200/80 dark:hover:bg-slate-700/70 hover:text-foreground"
                }`}
              >
                Reviewer Draft
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("ai_assist")}
                className={`h-8 px-3.5 inline-flex items-center justify-center text-xs rounded-t-md border-t-2 border-x border-b-0 transition-colors whitespace-nowrap relative -mb-px select-none cursor-pointer ${
                  activeTab === "ai_assist"
                    ? "border-t-blue-500 border-x-blue-500/80 bg-background text-blue-900 dark:text-blue-300 font-bold z-10 shadow-xs"
                    : "border-t-transparent border-x-transparent bg-slate-100/90 dark:bg-slate-800/70 text-slate-600 dark:text-slate-400 font-medium hover:bg-slate-200/80 dark:hover:bg-slate-700/70 hover:text-foreground"
                }`}
              >
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

        {/* TAB 1: AI Generated Answer (Read Only) */}
        {activeTab === "ai_answer" && (
          <div className="rounded-xl border border-border/70 bg-muted/20 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Bot className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>AI Generated Answer</span>
                <span className="text-[10px] font-normal text-muted-foreground">(Read Only)</span>
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toast.info("Language translation available")}
                  className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <Languages className="w-3 h-3 mr-1" />
                  Translate
                </Button>

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
            </div>

            <div className="p-3 rounded-lg bg-background border border-border/60 text-xs font-normal text-foreground/90 whitespace-pre-wrap leading-relaxed min-h-[200px] max-h-[360px] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {aiAnswerText}
            </div>
          </div>
        )}

        {/* TAB 2: Reviewer Draft / Edit Answer */}
        {activeTab === "reviewer_draft" && (
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
                onClick={() => toast.info("Bold clicked")}
                className="h-6 w-6 rounded"
                title="Bold"
              >
                <Bold className="w-3 h-3" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => toast.info("Italic clicked")}
                className="h-6 w-6 rounded"
                title="Italic"
              >
                <Italic className="w-3 h-3" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => toast.info("Underline clicked")}
                className="h-6 w-6 rounded"
                title="Underline"
              >
                <Underline className="w-3 h-3" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => toast.info("Strikethrough clicked")}
                className="h-6 w-6 rounded"
                title="Strikethrough"
              >
                <Strikethrough className="w-3 h-3" />
              </Button>

              <div className="h-3.5 w-px bg-border/80 mx-0.5" />

              <Button
                variant="ghost"
                size="icon"
                onClick={() => toast.info("Bullet list clicked")}
                className="h-6 w-6 rounded"
                title="Bullet List"
              >
                <List className="w-3 h-3" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => toast.info("Numbered list clicked")}
                className="h-6 w-6 rounded"
                title="Numbered List"
              >
                <ListOrdered className="w-3.5 h-3.5" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => toast.info("Checklist clicked")}
                className="h-6 w-6 rounded"
                title="Checklist"
              >
                <ListChecks className="w-3.5 h-3.5" />
              </Button>

              <div className="h-3.5 w-px bg-border/80 mx-0.5" />

              <Button
                variant="ghost"
                size="icon"
                onClick={() => toast.info("Insert link clicked")}
                className="h-6 w-6 rounded"
                title="Link"
              >
                <Link2 className="w-3.5 h-3.5" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => toast.info("Code snippet clicked")}
                className="h-6 w-6 rounded"
                title="Code"
              >
                <Code2 className="w-3.5 h-3.5" />
              </Button>
            </div>

            {/* Draft Text Area */}
            <Textarea
              value={draftAnswer}
              onChange={(e) => setDraftAnswer(e.target.value)}
              placeholder="Write or edit the answer here..."
              className="min-h-[120px] text-xs font-normal leading-relaxed rounded-lg border-border/80 focus-visible:ring-1 focus-visible:ring-primary p-2.5 bg-background"
            />

            {/* Status Bar */}
            <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
              <div className="flex items-center gap-2.5">
                <span>{charCount} / 5000 chars</span>
                <span>•</span>
                <span>Word count: {wordCount}</span>
              </div>

              <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-[11px]">
                <CheckCircle2 className="w-3 h-3" />
                <span>Auto-saved</span>
              </div>
            </div>

            {/* Remarks Section */}
            <div className="pt-1.5">
              <Label htmlFor="remarks" className="text-xs font-semibold text-foreground mb-1 block">
                Remarks
              </Label>
              <Textarea
                id="remarks"
                placeholder="Enter remarks..."
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="min-h-[60px] max-h-[100px] text-xs border-border/80 rounded-lg p-2.5 bg-background"
              />
            </div>

            {/* Source References Section */}
            <div className="pt-1.5">
              <div className="bg-card border border-border rounded-xl p-3 shadow-2xs">
                <SourceUrlManager
                  sources={sources}
                  onSourcesChange={setSources}
                />
              </div>
            </div>

            {/* Submit Response Footer */}
            <div className="pt-3 border-t border-border/80 flex items-center justify-between gap-3">
              <div className="text-[11px] text-muted-foreground">
                <span>{sources.length} {sources.length === 1 ? "source" : "sources"} attached</span>
              </div>

              <ConfirmationModal
                title="Submit Response"
                description="You are submitting your answer for quality assurance review. Please verify that all agricultural recommendations and sources are accurate before proceeding."
                confirmText="Submit Response"
                cancelText="Cancel"
                onConfirm={handleSubmitResponse}
                trigger={
                  <Button
                    disabled={!draftAnswer.trim() || isSubmitting}
                    className="h-8 px-4 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs rounded-lg flex items-center gap-1.5 transition-all"
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

        {/* TAB 3: AI Assist - Improve Language */}
        {activeTab === "ai_assist" && (
          <div className="rounded-xl border border-indigo-100 dark:border-indigo-950 bg-indigo-50/30 dark:bg-indigo-950/20 p-3.5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-900 dark:text-indigo-300">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>AI Assist – Improve Language</span>
              </div>
              <span className="text-[10px] text-muted-foreground">
                Preserves agricultural facts; Improves clarity & structure
              </span>
            </div>

            {/* Action Chips */}
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAiAssist("polish")}
                className="h-6 px-2 text-[11px] font-medium rounded-md bg-background hover:bg-muted"
              >
                <Wand2 className="w-2.5 h-2.5 mr-1 text-indigo-600" />
                Polish
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAiAssist("simplify")}
                className="h-6 px-2 text-[11px] font-medium rounded-md bg-background hover:bg-muted"
              >
                Simplify
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAiAssist("shorten")}
                className="h-6 px-2 text-[11px] font-medium rounded-md bg-background hover:bg-muted"
              >
                Shorten
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAiAssist("summarise")}
                className="h-6 px-2 text-[11px] font-medium rounded-md bg-background hover:bg-muted"
              >
                Summarise
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAiAssist("farmer_friendly")}
                className="h-6 px-2 text-[11px] font-medium rounded-md bg-background hover:bg-muted text-emerald-700 dark:text-emerald-400 border-emerald-200"
              >
                Farmer-Friendly
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAiAssist("translate")}
                className="h-6 px-2 text-[11px] font-medium rounded-md bg-background hover:bg-muted"
              >
                Translate
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAiAssist("improve_structure")}
                className="h-6 px-2 text-[11px] font-medium rounded-md bg-background hover:bg-muted"
              >
                Improve Structure
              </Button>
            </div>

            {/* AI Result Preview Area */}
            <div className="p-2.5 rounded-lg bg-background border border-border/60 min-h-[100px] text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {isAiProcessing ? (
                <div className="flex items-center gap-2 text-primary py-3 justify-center text-xs">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Generating AI improved version...</span>
                </div>
              ) : aiAssistOutput ? (
                <span className="text-foreground">{aiAssistOutput}</span>
              ) : (
                <span className="italic text-muted-foreground">
                  Click any action above to generate an AI improved version...
                </span>
              )}
            </div>

            {/* AI Assist Footer Buttons */}
            {aiAssistOutput && (
              <div className="flex items-center justify-end gap-2 pt-0.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => activeAiAction && handleAiAssist(activeAiAction)}
                  className="h-6 px-2 text-[11px] font-medium"
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Regenerate
                </Button>

                <Button
                  size="sm"
                  onClick={handleApplyAiAssist}
                  className="h-6 px-2.5 text-[11px] font-medium bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  <ArrowDownToLine className="w-3 h-3 mr-1" />
                  Apply to Draft
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
