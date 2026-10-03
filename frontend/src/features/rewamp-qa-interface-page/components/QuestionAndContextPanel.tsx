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
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  progressPercent?: number;
  actionType?: "allocated" | "reroute";
  onActionTypeChange?: (actionType: "allocated" | "reroute") => void;
  reviewLevel?: string;
  source?: string;
  states?: string[];
  crops?: string[];
  onFilterChange?: (key: string, value: any) => void;
  onRefresh?: () => void;
}

export const QuestionAndContextPanel: React.FC<QuestionAndContextPanelProps> = ({
  question,
  isCollapsed = false,
  onToggleCollapse,
  progressPercent = 15,
  actionType = "allocated",
  onActionTypeChange,
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

  // Fallback / Sample data when no question is passed
  const currentQuestion: IQuestionContextData = question || {
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

  const handleCopyQuestion = () => {
    if (currentQuestion?.text) {
      navigator.clipboard.writeText(currentQuestion.text);
      setCopied(true);
      toast.success("Question copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
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

          <Select value={actionType} onValueChange={onActionTypeChange}>
            <SelectTrigger className="h-8 text-xs px-2 min-w-fit shrink-0">
              <SelectValue placeholder="Select action" />
            </SelectTrigger>

            <SelectContent>
              <SelectItem value="allocated">Allocated Questions</SelectItem>
              <SelectItem value="reroute">ReRouted Questions</SelectItem>
            </SelectContent>
          </Select>
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

        {/* Question Text Box */}
        <div className="p-3.5 rounded-xl border border-blue-100 dark:border-blue-950 bg-blue-50/40 dark:bg-blue-950/20 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge
                variant="destructive"
                className="text-[11px] px-2 py-0.2 font-semibold bg-rose-500 hover:bg-rose-600 text-white rounded-md"
              >
                {currentQuestion.priority || "Critical"}
              </Badge>
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {currentQuestion.askedOn || "Aug 25, 2026, 12:35 PM"}
              </span>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <MessageSquare className="w-3.5 h-3.5" />
              <span>{currentQuestion.commentsCount || 0}</span>
            </div>
          </div>

          <p className="text-sm font-medium text-foreground leading-relaxed">
            {currentQuestion.text}
          </p>
        </div>

        {/* Metadata Properties Grid */}
        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between py-1.5 border-b border-border/40">
            <span className="flex items-center gap-2 text-muted-foreground">
              <Sprout className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              Crop
            </span>
            <span className="font-semibold text-foreground">
              {currentQuestion.crop || "Brinjal"}
            </span>
          </div>

          <div className="flex items-center justify-between py-1.5 border-b border-border/40">
            <span className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              State
            </span>
            <span className="font-semibold text-foreground">
              {currentQuestion.state || "Uttar Pradesh"}
            </span>
          </div>

          <div className="flex items-center justify-between py-1.5 border-b border-border/40">
            <span className="flex items-center gap-2 text-muted-foreground">
              <Building2 className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
              District
            </span>
            <span className="font-semibold text-foreground">
              {currentQuestion.district || "Basti"}
            </span>
          </div>

          <div className="flex items-center justify-between py-1.5 border-b border-border/40">
            <span className="flex items-center gap-2 text-muted-foreground">
              <Building2 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              Block
            </span>
            <span className="font-semibold text-foreground">
              {currentQuestion.block || "Harraiya"}
            </span>
          </div>

          <div className="flex items-center justify-between py-1.5 border-b border-border/40">
            <span className="flex items-center gap-2 text-muted-foreground">
              <Languages className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              Language
            </span>
            <span className="font-semibold text-foreground">
              {currentQuestion.language || "English"}
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

          {showAllMetadata && currentQuestion.metadata && (
            <div className="mt-2.5 p-3 rounded-lg bg-muted/40 border border-border/60 text-xs space-y-1.5 animate-in fade-in-50 duration-200">
              {Object.entries(currentQuestion.metadata).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-muted-foreground">{key}:</span>
                  <span className="font-medium text-foreground">{String(value)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

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
