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
import { RefreshCw,Info, Bot, ChevronLeft, Filter, MapPin, Layers, Globe, Sprout, UserRound } from "lucide-react";
import { useState, useEffect } from "react";
import { useGetAllCrops } from "@/hooks/api/crop/useGetAllCrops";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from "../../components/atoms/dialog";
import { Badge } from "../../components/atoms/badge";
import { ScrollArea } from "@/components/atoms/scroll-area";
import { Separator } from "@/components/atoms/separator";
import { STATES, CROPS } from "@/components/MetaData";
import { StateMultiSelect } from "@/components/atoms/StateMultiSelect";
import { CropMultiSelect } from "@/components/atoms/CropMultiSelect";
import { Label } from "../../components/atoms/label";
import { formatDate } from "@/utils/formatDate";
import { buildHoldCountdownOptions } from "@/hooks/ui/useCountdown";
import { useQuestionTimer } from "@/hooks/ui/useQuestionTimer";
import { TimerDisplay } from "../../components/timer-display";
import { getTimerStartTime } from "@/utils/getTimerStartTime";

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
  source: string;
  states: string[];
  crops: string[];
  onFilterChange: (key: string, value: any) => void;
  scrollRef: React.RefObject<HTMLDivElement|null>;
  questionItemRefs: React.MutableRefObject<Record<string, HTMLDivElement>>;
  setQuestionRef: (id: string, el: HTMLDivElement | null) => void;
  onToggleCollapse: () => void;
}
const QaPreferencesDialog = ({
  reviewLevel,
  source,
  states,
  crops,
  onFilterChange,
}: {
  reviewLevel: string;
  source: string;
  states: string[];
  crops: string[];
  onFilterChange: (key: string, value: any) => void;
}) => {
  const [open, setOpen] = useState(false);
  const { data: cropsData } = useGetAllCrops();
  const dbCrops = cropsData?.crops || [];
  const [localReviewLevel, setLocalReviewLevel] = useState(reviewLevel);
  const [localSource, setLocalSource] = useState(source);
  const [localStates, setLocalStates] = useState<string[]>(states);
  const [localCrops, setLocalCrops] = useState<string[]>(crops);

  useEffect(() => {
    if (open) {
      setLocalReviewLevel(reviewLevel);
      setLocalSource(source);
      setLocalStates(states);
      setLocalCrops(crops);
    }
  }, [open, reviewLevel, source, states, crops]);

  let activeFiltersCount = 0;
  if (reviewLevel && reviewLevel !== "all") activeFiltersCount++;
  if (source && source !== "all") activeFiltersCount++;
  if (states.length > 0) activeFiltersCount++;
  if (crops.length > 0) activeFiltersCount++;

  const handleApply = () => {
    onFilterChange("review_level", localReviewLevel);
    onFilterChange("source", localSource);
    onFilterChange("states", localStates);
    onFilterChange("crops", localCrops);
    setOpen(false);
  };

  const handleReset = () => {
    setLocalReviewLevel("all");
    setLocalSource("all");
    setLocalStates([]);
    setLocalCrops([]);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="flex items-center gap-1.5 px-2 sm:px-3 py-1 h-8 sm:h-9 bg-background hover:bg-accent hover:text-accent-foreground border border-input rounded-md transition-all shadow-sm shrink-0">
          <span className="text-xs sm:text-sm font-normal text-gray-900 dark:text-white whitespace-nowrap">
            Preferences
          </span>
          {activeFiltersCount > 0 && (
            <Badge
              variant="destructive"
              className="bg-red-500 h-4 px-1.5 min-w-4 rounded-full flex items-center justify-center text-[10px]"
            >
              {activeFiltersCount}
            </Badge>
          )}
        </button>
      </DialogTrigger>

      <ScrollArea>
        <DialogContent className="sm:max-w-2xl max-w-[95vw]">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              <Filter className="h-5 w-5 text-primary" />
              Advanced Filters
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Refine your search with multiple filter options
            </p>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Top Section: Source & Review Level */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2 min-w-0">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <Globe className="h-4 w-4 text-primary" />
                  Source
                </Label>
                <Select value={localSource} onValueChange={setLocalSource}>
                  <SelectTrigger className="bg-background w-full">
                    <SelectValue placeholder="Select Source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4 text-primary" />
                        <span>All Sources</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="AJRASAKHA">
                      <div className="flex items-center gap-2">
                        <Bot className="w-4 h-4 text-primary" />
                        <span>Ajrasakha</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="AGRI_EXPERT">
                      <div className="flex items-center gap-2">
                        <UserRound className="w-4 h-4 text-primary" />
                        <span>Agri Expert</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 min-w-0">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <Layers className="h-4 w-4 text-primary" />
                  Review Level
                </Label>
                <Select value={localReviewLevel} onValueChange={setLocalReviewLevel}>
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
            </div>

            <Separator />

            {/* Bottom Section: Location & Crop */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2 min-w-0">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <MapPin className="h-4 w-4 text-primary" />
                  State/Region
                </Label>
                <StateMultiSelect
                  states={STATES}
                  selected={localStates}
                  onChange={setLocalStates}
                />
              </div>

              <div className="space-y-2 min-w-0">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <Sprout className="h-4 w-4 text-primary" />
                  Crop Type
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-primary transition-colors"
                      >
                        <Info className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-sm">
                      <p>
                        Filter by the standardized crop name. You can view a crop's alternative names by hovering over the "+" icon next to it. Use "Not Set" to find older questions without a normalized crop.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </Label>
                <CropMultiSelect
                  dbCrops={dbCrops}
                  crops={CROPS}
                  selected={localCrops}
                  onChange={setLocalCrops}
                />
              </div>
            </div>
          </div>
          
          <div className="border-t border-border mt-4 pt-4 flex gap-4 justify-between items-center w-full">
            <Button variant="ghost" className="text-muted-foreground w-1/2" onClick={handleReset}>
              Reset Filters
            </Button>
            <Button onClick={handleApply} className="w-1/2">
              Apply Changes
            </Button>
          </div>
        </DialogContent>
      </ScrollArea>
    </Dialog>
  );
};

const QaQuestionItem = ({
  question,
  selectedQuestion,
  onQuestionSelect,
  setQuestionRef,
}: {
  question: any;
  selectedQuestion: string | null;
  onQuestionSelect: (id: string) => void;
  setQuestionRef: (id: string, el: HTMLDivElement | null) => void;
}) => {
  
  // Get correct timer start time based on user role (Author vs Level Expert)
  const timerStartTime = getTimerStartTime(question);
  const { timer } = useQuestionTimer(
    question?.source,
    timerStartTime,
    buildHoldCountdownOptions({
      status: question?.status,
      holdAt: question?.holdAt,
      accumulatedHoldMs: question?.accumulatedHoldMs,
    })
  );

  return (
    <div
      key={question?.id}
      ref={(el) => setQuestionRef(question?.id || "", el)}
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
        <div className="mt-2 ml-7">
          <TimerDisplay
            timer={timer}
            status={question?.status}
            source={question?.source}
            size="sm"
          />
        </div>
        <div className="mt-1 ml-7 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
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
  );
};

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
  source,
  states,
  crops,
  onFilterChange,
  scrollRef,
  setQuestionRef,
  onToggleCollapse,
}:QaHeaderProps)=>{
  return(
    <div>
      <Card className="w-full md:max-h-[120vh]  max-h-[80vh] min-h-[90vh] border border-gray-200 dark:border-gray-700 shadow-sm rounded-lg bg-transparent">
            <CardHeader className="border-b flex flex-row flex-wrap items-center justify-between gap-2 sm:gap-3 py-3 sm:py-4 px-3 sm:px-4">
              <TooltipProvider>
                <div className="flex items-center gap-1.5 shrink-0">
                  <CardTitle className="text-sm md:text-base font-semibold whitespace-nowrap">
                    Question Queues
                  </CardTitle>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help flex-shrink-0" />
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

              <Select value={actionType} onValueChange={onActionTypeChange}>
                <SelectTrigger className="h-8 sm:h-9 text-xs sm:text-sm px-2 sm:px-3 min-w-fit shrink-0">
                  <SelectValue placeholder="Select action" />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="allocated">Allocated Questions</SelectItem>
                  <SelectItem value="reroute">ReRouted Questions</SelectItem>
                </SelectContent>
              </Select>
             
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <QaPreferencesDialog
                  reviewLevel={reviewLevel}
                  source={source}
                  states={states}
                  crops={crops}
                  onFilterChange={onFilterChange}
                />

                <Button 
                  variant="outline"
                  size="icon"
                  onClick={onRefresh}
                  className="h-8 w-8 shrink-0 bg-transparent"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span className="sr-only">Refresh</span>
                </Button>

                {
                  !isLoading && questions.length !== 0
                   && (
                    <Button
                  variant="ghost"
                  size="icon"
                  onClick={onToggleCollapse}
                  className="h-8 w-8 shrink-0"
                  title="Collapse Questions"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span className="sr-only">Collapse Questions</span>
                </Button>
                   )
                }
                 
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
                    <QaQuestionItem
                      key={question?.id}
                      question={question}
                      selectedQuestion={selectedQuestion}
                      onQuestionSelect={onQuestionSelect}
                      setQuestionRef={setQuestionRef}
                    />
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