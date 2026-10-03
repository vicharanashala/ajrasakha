import React, { useState } from "react";
import {
  ChevronUp,
  ChevronsRight,
  Copy,
  ExternalLink,
  MapPin,
  Building2,
  Languages,
  Calendar,
  Sprout,
  MessageSquare,
  Info,
  Check,
  RefreshCw,
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

interface QuestionAndContextPanelProps {
  question?: IQuestionContextData | null;
  questions?: IQuestionContextData[];
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
  const [activeTab, setActiveTab] = useState<"current" | "queue">("current");
  const [showAllMetadata, setShowAllMetadata] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedQueueQuestion, setSelectedQueueQuestion] = useState<IQuestionContextData | null>(null);

  // Fallback / Sample data when no question is passed
  const defaultQuestion: IQuestionContextData = {
    id: "q-1",
    text: "Information about control of sucking pest in crop brinjal in Uttar Pradesh?",
    crop: "Brinjal",
    state: "Uttar Pradesh",
    district: "Basti",
    block: "Harraiya",
    language: "English",
    askedOn: "Aug 25, 2026, 12:35 PM",
    priority: "Critical",
    commentsCount: 0,
    queueIndex: 1,
    totalInQueue: 20,
    metadata: {
      Season: "Kharif",
      SoilType: "Alluvial / Loamy",
      FarmSize: "2.5 Acres",
      PreviousPesticides: "Imidacloprid 17.8% SL",
    },
  };

  const currentQuestion = question || defaultQuestion;

  // Sample questions for queue (fallback when no questions prop provided)
  const sampleQueueQuestions: IQuestionContextData[] = questions.length > 0 ? questions : [
    { id: "q-2", text: "What are the best practices for tomato cultivation in summer?", crop: "Tomato", state: "Maharashtra", district: "Pune", block: "Haveli", language: "English", askedOn: "Aug 25, 2026, 11:20 AM", priority: "High", commentsCount: 3, queueIndex: 2, totalInQueue: 20 },
    { id: "q-3", text: "How to control leaf curl virus in chilli plants?", crop: "Chilli", state: "Karnataka", district: "Dharwad", block: "Hubli", language: "English", askedOn: "Aug 25, 2026, 10:45 AM", priority: "Critical", commentsCount: 1, queueIndex: 3, totalInQueue: 20 },
    { id: "q-4", text: "Recommended fertilizer schedule for wheat crop?", crop: "Wheat", state: "Punjab", district: "Ludhiana", block: "Samrala", language: "English", askedOn: "Aug 25, 2026, 10:15 AM", priority: "Medium", commentsCount: 0, queueIndex: 4, totalInQueue: 20 },
    { id: "q-5", text: "Management of powdery mildew in mango trees", crop: "Mango", state: "Uttar Pradesh", district: "Aligarh", block: "Koil", language: "English", askedOn: "Aug 25, 2026, 09:30 AM", priority: "High", commentsCount: 2, queueIndex: 5, totalInQueue: 20 },
  ];

  // Filter out current question from queue list
  const queueQuestions = sampleQueueQuestions.filter(q => q.id !== currentQuestion.id);

  // Determine which question to display - selected from queue or current question
  const displayQuestion = selectedQueueQuestion || currentQuestion;

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
    const isSelected = selectedQuestionId === q.id;
    const handleSelect = () => {
      // Switch to current tab and set the selected question to display
      setActiveTab("current");
      setSelectedQueueQuestion(q);
      onQuestionSelect?.(q.id);
    };
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
              className={`text-[11px] px-2 py-0.2 font-semibold ${
                q.priority === "Critical" ? "bg-rose-500 hover:bg-rose-600 text-white" : "bg-amber-500 hover:bg-amber-600 text-white"
              } rounded-md`}
            >
              {q.priority || "Medium"}
            </Badge>
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {q.askedOn || "Aug 25, 2026"}
            </span>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <MessageSquare className="w-3.5 h-3.5" />
            <span>{q.commentsCount || 0}</span>
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
              Current ({currentQuestion.queueIndex || 1}/{currentQuestion.totalInQueue || 20})
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
              In Queue ({(currentQuestion.totalInQueue || 20) - 1})
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
                    className="text-[11px] px-2 py-0.2 font-semibold bg-rose-500 hover:bg-rose-600 text-white rounded-md"
                  >
                    {displayQuestion.priority || "Critical"}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {displayQuestion.askedOn || "Aug 25, 2026, 12:35 PM"}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>{displayQuestion.commentsCount || 0}</span>
                </div>
              </div>

              <p className="text-sm font-medium text-foreground leading-relaxed">
                {displayQuestion.text}
              </p>
            </div>

            {/* Metadata Properties Grid - Only show in current tab */}
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between py-1.5 border-b border-border/40">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Sprout className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  Crop
                </span>
                <span className="font-semibold text-foreground">
                  {displayQuestion.crop || "Brinjal"}
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-border/40">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  State
                </span>
                <span className="font-semibold text-foreground">
                  {displayQuestion.state || "Uttar Pradesh"}
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-border/40">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Building2 className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                  District
                </span>
                <span className="font-semibold text-foreground">
                  {displayQuestion.district || "Basti"}
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-border/40">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Building2 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  Block
                </span>
                <span className="font-semibold text-foreground">
                  {displayQuestion.block || "Harraiya"}
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-border/40">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Languages className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  Language
                </span>
                <span className="font-semibold text-foreground">
                  {displayQuestion.language || "English"}
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

              {showAllMetadata && displayQuestion.metadata && Object.keys(displayQuestion.metadata).length > 0 ? (
                <div className="mt-2.5 p-3 rounded-lg bg-muted/40 border border-border/60 text-xs space-y-1.5 animate-in fade-in-50 duration-200">
                  {Object.entries(displayQuestion.metadata).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-muted-foreground">{key}:</span>
                      <span className="font-medium text-foreground">{String(value)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                showAllMetadata && (
                  <p className="mt-2.5 text-xs text-muted-foreground text-center py-2">No additional metadata available</p>
                )
              )}
            </div>
          </>
        ) : (
          /* In Queue - List all questions */
          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
            <div className="text-xs text-muted-foreground mb-2">
              {queueQuestions.length} questions in queue
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
