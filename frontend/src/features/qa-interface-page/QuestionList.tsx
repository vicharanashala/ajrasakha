

import { RadioGroup, RadioGroupItem } from "../../components/atoms/radio-group";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/atoms/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../components/atoms/tooltip";
import { Button } from "../../components/atoms/button";
import { Review_Level_QAI } from "@/components/MetaData";
import {Select,SelectTrigger, SelectValue,SelectContent,SelectItem,} from "@/components/atoms/select";
import {CheckCircle,RefreshCw,RotateCcw,Info,Loader2,Send,FileText,Bot,MessageSquare,Clock,MessageCircle} from "lucide-react";
import type {
  HistoryItem,
  IQuestion,
  IReviewParmeters,
  SourceItem,
  QuestionRerouteRepo
} from "@/types";
import { Label } from "../../components/atoms/label";
import { formatDate } from "@/utils/formatDate";
interface QuestionListProps {
  questions: IQuestion[];
  selectedQuestion: string | null;
  onQuestionSelect: (id: string) => void;
  isLoading: boolean;
  isFetchingNextPage: boolean;
  onRefresh: () => void;
  actionType: "allocated" | "reroute";
  onActionTypeChange: (type: "allocated" | "reroute") => void;
  reviewLevel: string;
  onReviewLevelChange: (level: string) => void;
  scrollRef: React.RefObject<HTMLDivElement>;
  questionItemRefs: React.MutableRefObject<Record<string, HTMLDivElement>>;
  setQuestionRef: (id: string, el: HTMLDivElement | null) => void;
}

export const QuestionList = ({
  questions,
  selectedQuestion,
  onQuestionSelect,
  isLoading,
  isFetchingNextPage,
  onRefresh,
  actionType,
  onActionTypeChange,
  reviewLevel,
  onReviewLevelChange,
  scrollRef,
  setQuestionRef,
}: QuestionListProps) => {
  if (isLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center space-y-4 px-6">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        <div className="space-y-2">
          <h3 className="text-lg font-medium">Loading Questions</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Please wait while we load the list of available questions.
          </p>
        </div>
      </div>
    );
  }

  if (!questions?.length) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center space-y-4 px-6">
        <MessageCircle className="w-16 h-16 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
        No questions are available at the moment. The questions shown
                  here are curated based on your preferences, expertise domain,
                  and reputation score to ensure the best match. Once a suitable
                  question is allocated to you, you will be notified
                  immediately. Please check back later for new opportunities.
        </p>
      </div>
    );
  }

  return (
    <Card className="w-full md:max-h-[120vh] max-h-[80vh] min-h-[75vh] border shadow-sm rounded-lg bg-transparent">
      <CardHeader className="border-b flex flex-row items-center justify-between pb-4">
        <TooltipProvider>
          <div className="flex items-center gap-2">
            <CardTitle className="text-md md:text-lg font-semibold">Question Queues</CardTitle>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-sm">
                <p>
                  List of pending questions requiring response. Personalized based on preferences
                  and reputation score.
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>

        <div className="sm:flex sm:flex-row sm:justify-end sm:items-center gap-3">
          <Select value={actionType} onValueChange={onActionTypeChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="allocated">Allocated Questions</SelectItem>
              <SelectItem value="reroute">ReRouted Questions</SelectItem>
            </SelectContent>
          </Select>

          {actionType === "allocated" && (
            <Select value={reviewLevel} onValueChange={onReviewLevelChange}>
              <SelectTrigger className="bg-background w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                {Review_Level_QAI.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            className="h-9 px-3 bg-transparent hidden md:block"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent
        className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600 p-4"
        ref={scrollRef}
      >
        <RadioGroup value={selectedQuestion} onValueChange={onQuestionSelect} className="space-y-4">
          {questions.map((question) => (
            <QuestionItem
              key={question.id}
              question={question}
              isSelected={selectedQuestion === question.id}
              onSelect={onQuestionSelect}
              setRef={setQuestionRef}
            />
          ))}
        </RadioGroup>

        {isFetchingNextPage && (
          <div className="flex justify-center items-center py-3">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="ml-2 text-sm text-muted-foreground">Loading more...</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// ============================================================================
// QUESTION ITEM COMPONENT
// ============================================================================

interface QuestionItemProps {
  question: IQuestion;
  isSelected: boolean;
  onSelect: (id: string) => void;
  setRef: (id: string, el: HTMLDivElement | null) => void;
}

const QuestionItem = ({ question, isSelected, onSelect, setRef }: QuestionItemProps) => {
  return (
    <div
      ref={(el) => setRef(question.id || "", el)}
      className={`relative group rounded-xl border transition-all duration-200 overflow-hidden bg-transparent ${
        isSelected
          ? "border-primary bg-primary/5 shadow-md ring-2 ring-primary/20"
          : "border-border bg-card hover:border-primary/40 hover:bg-accent/20 hover:shadow-sm"
      }`}
    >
      {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />}

      <div className="p-4">
        <div className="flex items-start gap-3">
          <RadioGroupItem value={question.id || ""} id={question.id} className="mt-1 w-5 h-5" />

          <div className="flex-1 min-w-0">
            <Label
              htmlFor={question.id}
              className="text-sm md:text-base font-medium leading-relaxed cursor-pointer block"
            >
              {question.text}
            </Label>
          </div>
        </div>

        <div className="mt-3 ml-7 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          {question.priority && (
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                question.priority === "high"
                  ? "bg-red-500/10 text-red-600 border-red-500/30"
                  : question.priority === "medium"
                  ? "bg-yellow-500/10 text-yellow-600 border-yellow-500/30"
                  : "bg-green-500/10 text-green-600 border-green-500/30"
              }`}
            >
              {question.priority.charAt(0).toUpperCase() + question.priority.slice(1)}
            </span>
          )}

          <div className="flex items-center gap-1.5">
            <Clock className="w-3 h-3" />
            <span className="font-medium">Created:</span>
            <span>{formatDate(new Date(question.createdAt!))}</span>
          </div>

          <div className="hidden md:flex items-center gap-1.5">
          <svg
                              className="w-3 h-3"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-3.582 8-8 8a8.965 8.965 0 01-4.126-.937l-3.157.937.937-3.157A8.965 8.965 0 013 12c0-4.418 3.582-8 8-8s8 3.582 8 8z"
                              />
                            </svg>
            <span className="font-medium">Answers:</span>
            <span className="px-1.5 py-0.5 bg-muted rounded text-xs font-medium">
              {question.totalAnswersCount}
            </span>
          </div>
        </div>
      </div>

      {isSelected && (
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent pointer-events-none" />
      )}
    </div>
  );
};



