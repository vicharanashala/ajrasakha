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
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, } from "@/components/atoms/select";
import { RefreshCw, Info, Bot, ChevronLeft, Filter, MapPin, Layers, Globe, Sprout, UserRound } from "lucide-react";
import { useState, useEffect } from "react";
import { useGetAllCrops } from "@/hooks/api/crop/useGetAllCrops";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from "../../components/atoms/dialog";
import { Badge } from "../../components/atoms/badge";
import { ScrollArea } from "@/components/atoms/scroll-area";
import { Separator } from "@/components/atoms/separator";
import { CROPS } from "@/components/MetaData";
import { useGetStates } from "@/hooks/api/location/useLocations";
import { StateMultiSelect } from "@/components/atoms/StateMultiSelect";
import { CropMultiSelect } from "@/components/atoms/CropMultiSelect";
import { Label } from "../../components/atoms/label";
import { formatDate } from "@/utils/formatDate";
import { buildHoldCountdownOptions } from "@/hooks/ui/useCountdown";
import { useQuestionTimer } from "@/hooks/ui/useQuestionTimer";
import { TimerDisplay } from "../../components/timer-display";
import { getTimerStartTime } from "@/utils/getTimerStartTime";
import { useFetchAnswer } from "@/hooks/api/answer/useGetAiInitialAnswer";
import type { SourceItem } from "@/types";
import { toast } from "sonner";

type AiAnswerResponse = {
  answer?: string;
  sources?: Array<{
    source_name?: string;
    source_url?: string;
    source?: string;
    page_no?: string | number;
    page?: string | number;
  }>;
  contexts?: Array<{
    meta_data?: {
      source_name?: string;
      source_url?: string;
      source?: string;
      page_no?: string | number;
      page?: string | number;
    };
  }>;
};

type QaHeaderProps = {
  questions: any
  selectedQuestion: string | null;
  onQuestionSelect: (id: string) => void;
  isLoading: boolean;
  isLoadingTarget: boolean;
  isFetchingNextPage: boolean;
  onRefresh: () => void;
  actionType: "allocated" | "reroute";
  onActionTypeChange: (type: "allocated" | "reroute") => void;
  reviewLevel: string;
  source: string;
  states: string[];
  crops: string[];
  onFilterChange: (key: string, value: any) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  questionItemRefs: React.MutableRefObject<Record<string, HTMLDivElement>>;
  setQuestionRef: (id: string, el: HTMLDivElement | null) => void;
  onToggleCollapse: () => void;
  onAiAnswerFetched?: (questionId: string, answer: string, sources: SourceItem[]) => void;
  hideControls?: boolean;
  hasTimeboundQuestions?: boolean;
}

const normalizeAiAnswerSources = (result: AiAnswerResponse | null | undefined): SourceItem[] => {
  const apiSources = result?.sources?.length
    ? result.sources
    : result?.contexts?.map((context) => context.meta_data).filter(Boolean);

  return (apiSources || [])
    .map((source) => ({
      sourceType: "other" as const,
      sourceName: source?.source_name?.trim(),
      source: source?.source_url || source?.source || "",
      page: source?.page_no ?? source?.page,
    }))
    .filter((source) => source.source);
};

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
  const { data: cropsData } = useGetAllCrops({ type: "crop", limit: 500 });
  const dbCrops = cropsData?.crops || [];
  const { data: statesResponse = [] } = useGetStates();
  const stateOptions = statesResponse.map((s) => s.stateNameEnglish);
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
                  states={stateOptions}
                  selected={localStates}
                  onChange={setLocalStates}
                />
              </div>

              <div className="space-y-2 min-w-0">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <Sprout className="h-4 w-4 text-primary" />
                  Crop Type
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
  hidePriority = false,
  selectedState,
  onStateChange,
  onAiAnswerFetched,
  hasTimeboundQuestions = false,
}: {
  question: any;
  selectedQuestion: string | null;
  onQuestionSelect: (id: string) => void;
  setQuestionRef: (id: string, el: HTMLDivElement | null) => void;
  hidePriority?: boolean;
  selectedState: string;
  onStateChange: (state: string) => void;
  onAiAnswerFetched?: (questionId: string, answer: string, sources: SourceItem[]) => void;
  hasTimeboundQuestions?: boolean;
}) => {
  const { mutate: fetchAnswer, isPending } = useFetchAnswer();
  const { data: statesResponse = [] } = useGetStates();
  const states = statesResponse.map((s) => s.stateNameEnglish);
  const fetchAiInitialAnswer = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onQuestionSelect(question.id);
    fetchAnswer(
      {
        query: question.text,
        crop: question.details?.crop || "",
        state: selectedState,
      },
      {
        onSuccess: (result: AiAnswerResponse | null) => {
          if (!result?.answer) {
            toast.error("AI answer was not returned.");
            return;
          }

          onAiAnswerFetched?.(
            question.id,
            result.answer,
            normalizeAiAnswerSources(result),
          );
          toast.success("AI answer added to draft.");
        },
        onError: () => {
          toast.error("Failed to fetch AI answer.");
        },
      },
    );
  };
  const sourceStyles = {
    AJRASAKHA: {
      border: "border-blue-500",
      hover: "hover:border-blue-500/70",
      selected: "border-blue-500 ring-blue-500/20 bg-blue-500/5",
    },
    WHATSAPP: {
      border: "border-green-500",
      hover: "hover:border-green-500/70",
      selected: "border-green-500 ring-green-500/20 bg-green-500/5",
    },
    OUTREACH: {
      border: "border-orange-500",
      hover: "hover:border-orange-500/70",
      selected: "border-orange-500 ring-orange-500/20 bg-orange-500/5",
    },
    AGRI_EXPERT: {
      border: "border-gray-500",
      hover: "hover:border-gray-500/70",
      selected: "border-gray-500 ring-gray-500/20 bg-gray-500/5",
    },
    DEFAULT: {
      border: "border-yellow-500",
      hover: "hover:border-yellow-500/70",
      selected: "border-yellow-500 ring-yellow-500/20 bg-yellow-500/5",
    },
  };

  const currentStyle =
    sourceStyles[question.source as keyof typeof sourceStyles] ||
    sourceStyles.DEFAULT;

  // Check if this is a non-timebound question that should be disabled
  const isTimeboundQuestion = question.source === "AJRASAKHA" || question.source === "WHATSAPP";
  const shouldDisable = hasTimeboundQuestions && !isTimeboundQuestion;

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
      className={`relative group rounded-xl border border-l-4
    ${currentStyle.border}
    transition-all duration-200 overflow-hidden
    ${selectedQuestion === question?.id
          ? `${currentStyle.selected} shadow-md ring-2`
          : `bg-card ${currentStyle.hover} hover:bg-accent/20 hover:shadow-sm`
        }
        ${shouldDisable ? "opacity-50 cursor-not-allowed select-none" : ""}
  `}
    >
      {selectedQuestion === question?.id && (
        <div
          className={`absolute left-0 top-0 bottom-0 w-1 ${question.source === "AJRASAKHA"
            ? "bg-blue-500"
            : question.source === "WHATSAPP"
              ? "bg-green-500"
              : question.source === "OUTREACH"
                ? "bg-orange-500"
                : question.source === "AGRI_EXPERT"
                  ? "bg-gray-500"
                  : "bg-yellow-500"
            }`}
        />
      )}

      <div className="p-4">
        <div className="flex items-start gap-3">
          <RadioGroupItem
            value={question?.id || ""}
            id={question?.id}
             disabled={shouldDisable}
            className={`mt-1 w-5 h-5 rounded-full border-2 border-gray-400 dark:border-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 checked:bg-green-600 dark:checked:bg-green-400 ${shouldDisable ? "cursor-not-allowed opacity-50" : ""}`}
          />

          <div className="flex-1 min-w-0">
            {question.pae_review && question.status === "re-routed" && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30 mb-1">
                PAE Reroute
              </span>
            )}
            <Label
              htmlFor={question?.id}
              // className="text-sm md:text-base font-medium leading-relaxed cursor-pointer text-foreground group-hover:text-foreground/90 transition-colors block"
               className={`text-sm md:text-base font-medium leading-relaxed text-foreground group-hover:text-foreground/90 transition-colors block ${shouldDisable ? "cursor-not-allowed" : "cursor-pointer"}`}
            >
              {question?.text}
            </Label>
            {question.totalAnswersCount === 0 && (
              <div className="mt-2 flex items-center gap-2">
                <Select
                  value={selectedState}
                  onValueChange={onStateChange}
                >
                  <SelectTrigger className="h-8 w-[170px] text-xs">
                    <SelectValue placeholder="State" />
                  </SelectTrigger>

                  <SelectContent>
                    {states.map((st) => (
                      <SelectItem key={st} value={st}>
                        {st}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedState && (
                  <Button
                    size="sm"
                    className="h-8 px-3 text-xs"
                    onClick={fetchAiInitialAnswer}
                    disabled={isPending}
                  >
                    {isPending ? "Fetching..." : "Fetch"}
                  </Button>
                )}
              </div>
            )}
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
            {question?.priority && !hidePriority && (
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${question.priority === "critical"
                  ? "bg-red-600/10 text-red-700 border-red-700/30 text-[12px]"
                  : question.priority === "high"
                    ? "bg-orange-500/10 text-orange-600 border-orange-500/30"
                    : question.priority === "medium"
                      ? "bg-yellow-500/10 text-yellow-600 border-yellow-500/30"
                      : "bg-green-500/10 text-green-600 border-green-500/30"
                  }`}
              >
                {String(question.priority).charAt(0).toUpperCase() +
                  String(question.priority).slice(1)}
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

          {question?.assignedAt && (
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
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 00-2 2z"
                />
              </svg>
              <span className="font-medium">Assigned:</span>
              <span>{formatDate(new Date(question.assignedAt))}</span>
            </div>
          )}

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

export const QaHeader = ({ questions,
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
  onAiAnswerFetched,
  hideControls = false,
  hasTimeboundQuestions = false,
}: QaHeaderProps) => {
  const [questionStates, setQuestionStates] = useState<
    Record<string, string>
  >({});
  return (
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

          {!hideControls && (
            <Select value={actionType} onValueChange={onActionTypeChange}>
              <SelectTrigger className="h-8 sm:h-9 text-xs sm:text-sm px-2 sm:px-3 min-w-fit shrink-0">
                <SelectValue placeholder="Select action" />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="allocated">Allocated Questions</SelectItem>
                <SelectItem value="reroute">ReRouted Questions</SelectItem>
              </SelectContent>
            </Select>
          )}

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {!hideControls && (
              <QaPreferencesDialog
                reviewLevel={reviewLevel}
                source={source}
                states={states}
                crops={crops}
                onFilterChange={onFilterChange}
              />
            )}

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
              {questions?.map((question: any) => (
                <QaQuestionItem
                  key={question?.id}
                  question={question}
                  selectedQuestion={selectedQuestion}
                  onQuestionSelect={onQuestionSelect}
                  setQuestionRef={setQuestionRef}
                  hidePriority={hideControls}
                  selectedState={questionStates[question.id] || ""}
                  onStateChange={(state) =>
                    setQuestionStates((prev) => ({
                      ...prev,
                      [question.id]: state,
                    }))
                  }
                  onAiAnswerFetched={onAiAnswerFetched}
                  hasTimeboundQuestions={hasTimeboundQuestions}
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
