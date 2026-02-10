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
import {CheckCircle,RefreshCw,RotateCcw,Info,Loader2,Send,FileText,Bot, ChevronLeft} from "lucide-react";
import type {
  HistoryItem,
  IQuestion,
  IReviewParmeters,
  SourceItem,
  QuestionRerouteRepo
} from "@/types";
import { Label } from "../../components/atoms/label";
import { formatDate } from "@/utils/formatDate";

type QaHeaderProps={
  questions: any
  selectedQuestion: string | null;
  onQuestionSelect: (id: string) => void;
  isLoading: boolean;
  isLoadingTarget:boolean;
  isFetchingNextPage: boolean;
  onRefresh: () => void;
  actionType: "allocated" | "reroute";
  onActionTypeChange: (type: "allocated" | "reroute") => void;
  reviewLevel: string;
  onReviewLevelChange: (level: string) => void;
  scrollRef: React.RefObject<HTMLDivElement|null>;
  questionItemRefs: React.MutableRefObject<Record<string, HTMLDivElement>>;
  setQuestionRef: (id: string, el: HTMLDivElement | null) => void;
  onToggleCollapse: () => void;
}
export const QaHeader=({ questions,
  selectedQuestion,
  onQuestionSelect,
  isLoading,
  isLoadingTarget,
  isFetchingNextPage,
  onRefresh,
  actionType,
  onActionTypeChange,
  reviewLevel,
  onReviewLevelChange,
  scrollRef,
  setQuestionRef,
  onToggleCollapse,
}:QaHeaderProps)=>{
  return(
    <div>
      <Card className="w-full md:max-h-[120vh]  max-h-[80vh] min-h-[90vh] border border-gray-200 dark:border-gray-700 shadow-sm rounded-lg bg-transparent">
            <CardHeader className="border-b flex flex-row items-center justify-between pb-4">
              <TooltipProvider>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-md md:text-lg font-semibold">
                    Question Queues
                  </CardTitle>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-sm">
                      <p>
                        This are the list of pending questions that require a
                        response. These questions are personalized based on the
                        preferences and reputation score .
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </TooltipProvider>
             
              <div className="sm:flex sm:flex-row sm:justify-end sm:items-center gap-3 ">
              <Select value={actionType} onValueChange={onActionTypeChange}>
                <SelectTrigger className="">
                  <SelectValue placeholder="Select action" />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="allocated">Allocated Questions</SelectItem>
                  <SelectItem value="reroute">ReRouted Questions</SelectItem>
                </SelectContent>
              </Select>

                {actionType === "allocated" && (
                  <div className="min-w-0">
                    <Select
                      value={reviewLevel}
                      onValueChange={(v) => onReviewLevelChange(v)}
                    >
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
                  </div>
                )} 

                <Button 
                  variant="outline"
                  size="sm"
                  onClick={onRefresh}
                  className="h-9 px-3 bg-transparent hidden md:block"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span className="sr-only">Refresh</span>
                </Button>

                 <Button
                  variant="ghost"
                  size="sm"
                  onClick={onToggleCollapse}
                  className="h-9 px-2 ml-2"
                  title="Collapse Questions"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span className="sr-only">Collapse Questions</span>
                </Button>
              </div>
            </CardHeader>
            {isLoading || isLoadingTarget ? (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-4 px-6">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mb-2">
                  <svg
                    className="w-8 h-8 text-gray-400 dark:text-gray-500 animate-spin"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>

                <div className="space-y-2">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                    {isLoadingTarget
                      ? "Retrieving Selected Question"
                      : "Loading Questions"}
                  </h3>

                  <p className="text-sm text-muted-foreground max-w-sm">
                    Please wait while we
                    {isLoadingTarget
                      ? " locate the question you selected."
                      : " load the list of available questions."}
                  </p>
                </div>
              </div>
            ) : !questions || questions.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-4 px-6">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mb-2">
                  <svg
                    className="w-8 h-8 text-gray-400 dark:text-gray-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                </div>
                <p className="text-sm text-muted-foreground">
                  No questions are available at the moment. The questions shown
                  here are curated based on your preferences, expertise domain,
                  and reputation score to ensure the best match. Once a suitable
                  question is allocated to you, you will be notified
                  immediately. Please check back later for new opportunities.
                </p>
              </div>
            ) : (
              <CardContent
                className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600 scrollbar-track-gray-200 dark:scrollbar-track-gray-800 p-4"
                ref={scrollRef}
              >
                <RadioGroup
                  value={selectedQuestion}
                  // onValueChange={(value) => {
                  //   setSelectedQuestion(value);
                  //   setIsFinalAnswer(false);
                  // }}
                  onValueChange={onQuestionSelect}
                  className="space-y-4"
                >
                  {questions?.map((question:any) => (
                    <div
                      // key={index}
                      key={question?.id}
                      ref={(el) => setQuestionRef(question?.id || "", el)} //comment if scroll is not needed
                      className={`relative group rounded-xl border transition-all duration-200 overflow-hidden bg-transparent ${
                        selectedQuestion === question?.id
                          ? "border-primary bg-primary/5 shadow-md ring-2 ring-primary/20"
                          : "border-border bg-card hover:border-primary/40 hover:bg-accent/20 hover:shadow-sm"
                      }`}
                    >
                      {selectedQuestion === question?.id && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary"></div>
                      )}

                      <div className="p-4">
                        <div className="flex items-start gap-3">
                          <RadioGroupItem
                            value={question?.id || ""}
                            id={question?.id}
                            className="mt-1  w-5 h-5 rounded-full border-2 border-gray-400 dark:border-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 checked:bg-green-600 dark:checked:bg-green-400"
                          />

                          <div className="flex-1 min-w-0">
                            <Label
                              htmlFor={question?.id}
                              className="text-sm md:text-base font-medium leading-relaxed cursor-pointer text-foreground group-hover:text-foreground/90 transition-colors block"
                            >
                              {question?.text}
                            </Label>
                          </div>
                        </div>
                        <div className="mt-3 ml-7 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                          <div className="items-center gap-1.5 flex">
                            {question?.priority && (
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                  question.priority === "high"
                                    ? "bg-red-500/10 text-red-600 border-red-500/30"
                                    : question.priority === "medium"
                                    ? "bg-yellow-500/10 text-yellow-600 border-yellow-500/30"
                                    : "bg-green-500/10 text-green-600 border-green-500/30"
                                }`}
                              >
                                {question.priority.charAt(0).toUpperCase() +
                                  question.priority.slice(1)}
                              </span>
                            )}

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
                                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                            <span className="font-medium text-xs">
                              Created:
                            </span>
                            <span>
                              {formatDate(new Date(question?.createdAt!))}
                            </span>
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
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                              />
                            </svg>
                            <span className="font-medium">Updated:</span>
                            {formatDate(new Date(question?.updatedAt!))}
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
                            <span className="px-1.5 py-0.5 bg-muted text-muted-foreground rounded text-xs font-medium">
                              {question?.totalAnswersCount}
                            </span>
                          </div>
                        </div>
                      </div>

                      {selectedQuestion === question?.id && (
                        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent pointer-events-none"></div>
                      )}
                    </div>
                  ))}
                </RadioGroup>
                {isFetchingNextPage && (
                  <div className="flex justify-center items-center py-3">
                    <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                    <span className="ml-2 text-sm text-muted-foreground">
                      Loading more questions...
                    </span>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
    </div>
  )
  
}