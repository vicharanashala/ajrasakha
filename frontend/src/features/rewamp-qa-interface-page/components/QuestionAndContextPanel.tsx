import React, { useState } from "react";
import {
  ChevronUp,
  ChevronsRight,
  Copy,
  ExternalLink,
  MapPin,
  Building2,
  Calendar,
  Sprout,
  MessageSquare,
  Info,
  Check,
  RefreshCw,
  Layers,
} from "lucide-react";
import { Card, CardContent } from "@/components/atoms/card";
import { Button } from "@/components/atoms/button";
import { Badge } from "@/components/atoms/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/atoms/select";
import { toast } from "sonner";
import type { IQuestionContextData } from "../types";
import { QaPreferencesDialog } from "./QaPreferencesDialog";
import { formatDate } from "@/utils/formatDate";

interface QuestionAndContextPanelProps {
  question?: IQuestionContextData | null;
  questions?: any;
  isLoading?:boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  progressPercent?: number;
  actionType?: "allocated" | "reroute";
  onActionTypeChange?: (actionType: "allocated" | "reroute") => void;
  selectedQuestionId?: string | null;
  onQuestionSelect?: (questionId: string) => void;
  reviewLevel?: string;
  source?: string;
  states?: string[];
  crops?: string[];
  onFilterChange?: (key: string, value: any) => void;
  onRefresh?: () => void;
}
export const QuestionAndContextPanel: React.FC<QuestionAndContextPanelProps> = ({
  question,
  questions = [],
  isLoading=false,
  isCollapsed = false,
  onToggleCollapse,
  progressPercent = 15,
  actionType = "allocated",
  onActionTypeChange,
  selectedQuestionId = null,
  onQuestionSelect,
  reviewLevel = "all",
  source = "all",
  states = [],
  crops = [],
  onFilterChange,
  onRefresh,
}) => {
  console.log("questiond revienve ",questions)
  const [activeTab, setActiveTab] = useState<"current" | "queue">("current");
  const [showAllMetadata, setShowAllMetadata] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedQueueQuestion, setSelectedQueueQuestion] = useState<IQuestionContextData | null>(null);

  // Fallback / Sample data when no question is passed
  const defaultQuestion: IQuestionContextData = {
    id: "q-1",
    text: "Information about control of sucking pest in crop brinjal in Uttar Pradesh?",
    priority: "critical",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    totalAnswersCount: 0,
    status: "open",
    source: "AJRASAKHA",
    assignedAt: null,
    review_level_number: "Author",
    details: {
      state: "Uttar Pradesh",
      district: "Basti",
      crop: "Brinjal",
      normalised_crop: "Brinjal",
      season: "Kharif",
      domain: ["Pest Management"],
    },
  };

  const currentQuestion = question || defaultQuestion;

  // Sample questions for queue (fallback when no questions prop provided)
  const sampleQueueQuestions: IQuestionContextData[] = questions.length > 0 ? questions : [
    { id: "q-2", text: "What are the best practices for tomato cultivation in summer?", priority: "high", createdAt: new Date().toISOString(), source: "WHATSAPP", details: { state: "Maharashtra", district: "Pune", crop: "Tomato", season: "Summer", domain: ["Cultivation Practices"] } },
    { id: "q-3", text: "How to control leaf curl virus in chilli plants?", priority: "critical", createdAt: new Date().toISOString(), source: "AJRASAKHA", details: { state: "Karnataka", district: "Dharwad", crop: "Chilli", season: "Kharif", domain: ["Disease Management"] } },
    { id: "q-4", text: "Recommended fertilizer schedule for wheat crop?", priority: "medium", createdAt: new Date().toISOString(), source: "AGRI_EXPERT", details: { state: "Punjab", district: "Ludhiana", crop: "Wheat", season: "Rabi", domain: ["Nutrient Management"] } },
    { id: "q-5", text: "Management of powdery mildew in mango trees", priority: "high", createdAt: new Date().toISOString(), source: "OUTREACH", details: { state: "Uttar Pradesh", district: "Aligarh", crop: "Mango", season: "Summer", domain: ["Disease Management"] } },
  ];

  // Filter out current question from queue list
  const queueQuestions = sampleQueueQuestions.filter(
    (q) => (q.id || (q as any)._id) !== (currentQuestion.id || (currentQuestion as any)._id)
  );

  // Determine which question to display - selected from queue or current question
  const displayQuestion = question || selectedQueueQuestion || defaultQuestion;
  console.log("display question ",displayQuestion)
  const handleCopyQuestion = () => {
    if (displayQuestion?.text) {
      navigator.clipboard.writeText(displayQuestion.text);
      setCopied(true);
      toast.success("Question copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Question card component for queue items
  const QuestionCard = ({ q }: { q: IQuestionContextData }) => {
    const qId = q.id || (q as any)._id;
    const isSelected = selectedQuestionId === qId;
    const handleSelect = () => {
      // Switch to current tab and set the selected question to display
      setActiveTab("current");
      setSelectedQueueQuestion(q);
      onQuestionSelect?.(qId);
    };
    console.log("q 1 ",q)
    return (
      <button
        type="button"
        onClick={handleSelect}
        className={`w-full text-left p-3.5 rounded-xl border transition-all space-y-2.5 ${
          isSelected
            ? "border-primary bg-primary/5 dark:bg-primary/10 ring-1 ring-primary"
            : "border-blue-100 dark:border-blue-950 bg-blue-50/40 dark:bg-blue-950/20 hover:border-blue-300 dark:hover:border-blue-800 hover:bg-blue-100/40 dark:hover:bg-blue-950/30"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge
              variant="destructive"
              className={`text-[11px] px-2 py-0.2 font-semibold rounded-md ${
                q.priority === 'critical' ? 'bg-rose-500' :
                q.priority === 'high' ? 'bg-orange-500' :
                q.priority === 'medium' ? 'bg-yellow-500' : 'bg-green-500'
              }`}
            >
              {q.priority ? q.priority.charAt(0).toUpperCase() + q.priority.slice(1) : "Medium"}
            </Badge>
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {q.createdAt ? formatDate(new Date(q.createdAt)) : "—"}
            </span>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <MessageSquare className="w-3.5 h-3.5" />
            <span>{q.totalAnswersCount || 0}</span>
          </div>
        </div>
        <p className="text-sm font-medium text-foreground leading-relaxed line-clamp-2">
          {q.text}
        </p>
      </button>
    );
  };

  if (isCollapsed) {
    return (
      <div className="h-full flex flex-col items-center justify-between py-4 px-2 bg-card border border-border rounded-xl shadow-xs transition-all duration-300 w-12 min-h-[300px]">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleCollapse}
          className="h-8 w-8 rounded-lg hover:bg-muted"
          title="Expand Question & Context"
        >
          <ChevronsRight className="h-4 w-4 text-primary" />
        </Button>

        <div className="flex items-center gap-2 [writing-mode:vertical-rl] rotate-180 select-none py-4">
          <span className="text-xs font-semibold tracking-wide text-foreground">
            Question & Context
          </span>
        </div>

        <div className="w-2 h-2 rounded-full bg-blue-500" />
      </div>
    );
  }

  return (
    <Card className="flex flex-col h-full border border-border bg-card shadow-xs rounded-xl overflow-hidden">
      <CardContent className="p-4 flex-1 flex flex-col space-y-4 overflow-y-auto">
        {/* Action Type Selector with Preferences and Refresh */}
        <div className="flex items-center justify-end gap-2">
          <Select value={actionType} onValueChange={onActionTypeChange}>
            <SelectTrigger className="h-8 text-xs px-2 min-w-fit shrink-0">
              <SelectValue placeholder="Select action" />
            </SelectTrigger>

            <SelectContent>
              <SelectItem value="allocated">Allocated Questions</SelectItem>
              <SelectItem value="reroute">ReRouted Questions</SelectItem>
            </SelectContent>
          </Select>
          <QaPreferencesDialog
            reviewLevel={reviewLevel}
            source={source}
            states={states}
            crops={crops}
            onFilterChange={onFilterChange || (() => {})}
          />
          
          <Button
            variant="outline"
            size="icon"
            onClick={onRefresh || (() => {})}
            className="h-8 w-8 shrink-0 bg-transparent"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="sr-only">Refresh</span>
          </Button>
        </div>

        {/* Sub Navigation / Queue Status Tabs */}
        <div className="flex items-center gap-2">
          <div className="flex-1 grid grid-cols-2 p-1 bg-muted/50 rounded-lg border border-border/60 text-xs font-medium">
            <button
              type="button"
              onClick={() => setActiveTab("current")}
              className={`py-1.5 px-3 rounded-md transition-all text-center ${
                activeTab === "current"
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Current 
              {/* ({displayQuestion.queueIndex || queueQuestions.findIndex(q => q.id === displayQuestion.id)}/{queueQuestions.length}) */}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("queue")}
              className={`py-1.5 px-3 rounded-md transition-all text-center ${
                activeTab === "queue"
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              In Queue ({queueQuestions.length})
            </button>
          </div>

          {onToggleCollapse && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleCollapse}
              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"
              title="Collapse Panel"
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Question Content - Conditional based on activeTab */}
        {activeTab === "current" ? (
          <>
            {/* Current Question Text Box */}
            <div className="p-3.5 rounded-xl border border-blue-100 dark:border-blue-950 bg-blue-50/40 dark:bg-blue-950/20 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="destructive"
                    className={`text-[11px] px-2 py-0.2 font-semibold rounded-md ${
                      displayQuestion.priority === 'critical' ? 'bg-rose-500' :
                      displayQuestion.priority === 'high' ? 'bg-orange-500' :
                      displayQuestion.priority === 'medium' ? 'bg-yellow-500' : 'bg-green-500'
                    }`}
                  >
                    {displayQuestion.priority ? displayQuestion.priority.charAt(0).toUpperCase() + displayQuestion.priority.slice(1) : "Medium"}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {displayQuestion.createdAt ? formatDate(new Date(displayQuestion.createdAt)) : "—"}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>{displayQuestion.totalAnswersCount || 0}</span>
                </div>
              </div>

              <p className="text-sm font-medium text-foreground leading-relaxed">
                {displayQuestion.text}
              </p>
            </div>

            {/* Metadata Properties Grid - Default visible fields */}
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between py-1.5 border-b border-border/40">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Sprout className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  Crop
                </span>
                <span className="font-semibold text-foreground">
                  {displayQuestion.details?.crop || displayQuestion.details?.normalised_crop || "—"}
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-border/40">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  State
                </span>
                <span className="font-semibold text-foreground">
                  {displayQuestion.details?.state || "—"}
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-border/40">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Building2 className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                  Source
                </span>
                <span className="font-medium text-foreground">
                  {displayQuestion.source || "—"}
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-border/40">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Layers className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  Domain
                </span>
                <span className="font-medium text-foreground max-w-[200px] text-right">
                  {displayQuestion.details?.domain?.length
                    ? displayQuestion.details.domain.join(", ")
                    : "—"}
                </span>
              </div>
            </div>

            {/* View All Metadata Toggle */}
            <div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAllMetadata(!showAllMetadata)}
                className="w-full text-xs font-medium border-border/80 text-muted-foreground hover:text-foreground hover:bg-muted/50"
              >
                <Info className="w-3.5 h-3.5 mr-1.5" />
                {showAllMetadata ? "Hide Additional Metadata" : "View All Metadata"}
              </Button>

              {showAllMetadata && (
                <div className="mt-2.5 p-3 rounded-lg bg-muted/40 border border-border/60 text-xs space-y-1.5 animate-in fade-in-50 duration-200">
                  {/* Question ID */}
                  {displayQuestion.id && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">id:</span>
                      <span className="font-medium text-foreground text-[10px] truncate max-w-[180px]" title={displayQuestion.id}>
                        {displayQuestion.id}
                      </span>
                    </div>
                  )}
                  
                  {/* District */}
                  {displayQuestion.details?.district && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">District:</span>
                      <span className="font-medium text-foreground">{displayQuestion.details.district}</span>
                    </div>
                  )}
                  
                  {/* Season */}
                  {displayQuestion.details?.season && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Season:</span>
                      <span className="font-medium text-foreground">{displayQuestion.details.season}</span>
                    </div>
                  )}
                  
                  {/* Normalised Crop */}
                  {displayQuestion.details?.normalised_crop && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Normalised Crop:</span>
                      <span className="font-medium text-foreground">{displayQuestion.details.normalised_crop}</span>
                    </div>
                  )}
                  
                  {/* Priority */}
                  {displayQuestion.priority && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Priority:</span>
                      <span className={`font-medium ${
                        displayQuestion.priority === 'critical' ? 'text-red-600' :
                        displayQuestion.priority === 'high' ? 'text-orange-600' :
                        displayQuestion.priority === 'medium' ? 'text-yellow-600' : 'text-green-600'
                      }`}>
                        {displayQuestion.priority.charAt(0).toUpperCase() + displayQuestion.priority.slice(1)}
                      </span>
                    </div>
                  )}
                  
                  {/* Status */}
                  {displayQuestion.status && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Status:</span>
                      <span className="font-medium text-foreground">{displayQuestion.status}</span>
                    </div>
                  )}
                  
                  {/* Review Level */}
                  {displayQuestion.review_level_number && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Review Level:</span>
                      <span className="font-medium text-foreground">{displayQuestion.review_level_number}</span>
                    </div>
                  )}
                  
                  {/* Total Answers Count */}
                  {displayQuestion.totalAnswersCount !== undefined && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Answers:</span>
                      <span className="font-medium text-foreground">{displayQuestion.totalAnswersCount}</span>
                    </div>
                  )}
                  
                  {/* Created At */}
                  {displayQuestion.createdAt && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Created:</span>
                      <span className="font-medium text-foreground">{formatDate(new Date(displayQuestion.createdAt))}</span>
                    </div>
                  )}
                  
                  {/* Updated At */}
                  {displayQuestion.updatedAt && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Updated:</span>
                      <span className="font-medium text-foreground">{formatDate(new Date(displayQuestion.updatedAt))}</span>
                    </div>
                  )}
                  
                  {/* Assigned At */}
                  {displayQuestion.assignedAt && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Assigned:</span>
                      <span className="font-medium text-foreground">{formatDate(new Date(displayQuestion.assignedAt))}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          /* In Queue - List all questions */
          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
            <div className="text-xs text-muted-foreground mb-2">
              {queueQuestions.length} question{queueQuestions.length !== 1 ? "s" : ""} in queue
            </div>
            {queueQuestions.map((q) => (
              <QuestionCard key={q.id} q={q} />
            ))}
          </div>
        )}

        {/* Bottom Actions */}
        <div className="pt-2 mt-auto grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyQuestion}
            className="text-xs h-8 font-medium border-border/80 hover:bg-muted"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                Copied
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 mr-1" />
                Copy Question
              </>
            )}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => toast.info("Viewing original question")}
            className="text-xs h-8 font-medium border-border/80 hover:bg-muted"
          >
            <ExternalLink className="w-3.5 h-3.5 mr-1" />
            View Original
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
