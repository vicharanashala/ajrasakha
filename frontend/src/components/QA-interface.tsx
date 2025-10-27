"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CheckCircle,
  Eye,
  RefreshCw,
  RotateCcw,
  MessageCircle,
  Filter,
  Info,
  Loader2,
  Send,
  BookOpen,
  Flag,
  FileText,
  MessageSquare,
  Calendar,
  RefreshCcw,
  MapPin,
  Map,
  Sprout,
  Sun,
  Layers,
  Clock,
  XCircle,
  User,
  Pencil,
  Check,
  Copy,
  Target,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./atoms/card";
import { RadioGroup, RadioGroupItem } from "./atoms/radio-group";
import { Label } from "./atoms/label";
import { Textarea } from "./atoms/textarea";
import { Button } from "./atoms/button";
import { useGetAllQuestions } from "@/hooks/api/question/useGetAllQuestions";
import { useGetQuestionById } from "@/hooks/api/question/useGetQuestionById";
import { useSubmitAnswer } from "@/hooks/api/answer/useSubmitAnswer";
import toast from "react-hot-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./atoms/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./atoms/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./atoms/tooltip";
import { SourceUrlManager } from "./source-url-manager";
import {
  AdvanceFilterDialog,
  CROPS,
  STATES,
  type AdvanceFilterValues,
  type QuestionDateRangeFilter,
  type QuestionFilterStatus,
  type QuestionPriorityFilter,
  type QuestionSourceFilter,
} from "./advanced-question-filter";
import type {} from "./questions-page";
import type { IMyPreference, IQuestion } from "@/types";
import { ScrollArea } from "./atoms/scroll-area";
import { ExpandableText } from "./expandable-text";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./atoms/accordion";
import { UrlPreviewDialog } from "./url-preview-dialog";

export type QuestionFilter =
  | "newest"
  | "oldest"
  | "leastResponses"
  | "mostResponses";
export const QAInterface = () => {
  const [selectedQuestion, setSelectedQuestion] = useState<string | null>(null);
  const [newAnswer, setNewAnswer] = useState<string>("");
  const [isFinalAnswer, setIsFinalAnswer] = useState<boolean>(false);
  const [filter, setFilter] = useState<QuestionFilter>("newest");
  const [sources, setSources] = useState<string[]>([]);

  //for preference
  const [status, setStatus] = useState<QuestionFilterStatus>("all");
  const [source, setSource] = useState<QuestionSourceFilter>("all");
  const [priority, setPriority] = useState<QuestionPriorityFilter>("all");
  const [state, setState] = useState("");
  const [crop, setCrop] = useState("");
  const [domain, setDomain] = useState("all");
  const [user, setUser] = useState("all");
  const [answersCount, setAnswersCount] = useState<[number, number]>([0, 100]);
  const [dateRange, setDateRange] = useState<QuestionDateRangeFilter>("all");

  const [advanceFilter, setAdvanceFilterValues] = useState<AdvanceFilterValues>(
    {
      status: "all",
      source: "all",
      state: "all",
      answersCount: [0, 100],
      dateRange: "all",
      crop: "all",
      priority: "all",
      domain: "all",
      user: "all",
    }
  );
  const handleDialogChange = (key: string, value: any) => {
    setAdvanceFilterValues((prev) => ({ ...prev, [key]: value }));
  };
  const scrollRef = useRef<HTMLDivElement>(null);
  const preferences = useMemo(
    () => ({
      status,
      state,
      source,
      crop,
      answersCount,
      dateRange,
      priority,
      domain,
      user,
    }),
    [
      status,
      state,
      source,
      crop,
      answersCount,
      dateRange,
      priority,
      domain,
      user,
    ]
  );

  const LIMIT = 10;
  const {
    data: questionPages,
    isLoading: isQuestionsLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useGetAllQuestions(LIMIT, filter, preferences);

  const questions = questionPages?.pages.flat() || [];

  const { data: selectedQuestionData, isLoading: isSelectedQuestionLoading } =
    useGetQuestionById(selectedQuestion);

  const { mutateAsync: submitAnswer, isPending: isSubmittingAnswer } =
    useSubmitAnswer();

  useEffect(() => {
    if (questions.length > 0 && !selectedQuestion) {
      const firstQuestionId = questions[0]?.id ? questions[0]?.id : null;
      setSelectedQuestion(firstQuestionId);
    }
  }, [questions, selectedQuestion]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      if (scrollTop + clientHeight >= scrollHeight - 10) {
        if (hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      }
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const handleSubmit = async () => {
    if (!selectedQuestion) return;
    if (!sources.length) {
      toast.error("Atleast one source is required!");
      return;
    }
    try {
      const result = await submitAnswer({
        questionId: selectedQuestion,
        answer: newAnswer,
        sources,
      });
      if (result) setIsFinalAnswer(result.isFinalAnswer);
      toast.success("Response submitted successfully!");
      setNewAnswer("");
      setSources([]);
    } catch (error) {
      console.error("Error submitting answer:", error);
    } finally {
      setTimeout(() => {
        setIsFinalAnswer(false);
      }, 5000);
    }
  };

  const handleFilterChange = (value: QuestionFilter) => {
    setFilter(value);
  };

  const handleReset = () => {
    setNewAnswer("");
    setSources([]);
  };

  const activeFiltersCount = Object.values(advanceFilter).filter(
    (v) => v !== "all" && !(Array.isArray(v) && v[0] === 0 && v[1] === 100)
  ).length;

  const onReset = () => {
    setStatus("all");
    setSource("all");
    setState("");
    setCrop("");
    setAnswersCount([0, 100]);
    setDateRange("all");
    setPriority("all");
    setDomain("all");
    setUser("all");
  };

  const onChangeFilters = (next: {
    status?: QuestionFilterStatus;
    source?: QuestionSourceFilter;
    priority?: QuestionPriorityFilter;
    state?: string;
    crop?: string;
    domain?: string;
    user?: string;
    answersCount?: [number, number];
    dateRange?: QuestionDateRangeFilter;
  }) => {
    if (next.status !== undefined) setStatus(next.status);
    if (next.source !== undefined) setSource(next.source);
    if (next.state !== undefined) setState(next.state);
    if (next.crop !== undefined) setCrop(next.crop);
    if (next.answersCount !== undefined) setAnswersCount(next.answersCount);
    if (next.dateRange !== undefined) setDateRange(next.dateRange);
    if (next.priority !== undefined) setPriority(next.priority);
    if (next.domain !== undefined) setDomain(next.domain);
    if (next.user !== undefined) setUser(next.user);
  };

  const handleApplyFilters = (myPreference?: IMyPreference) => {
    onChangeFilters({
      status: advanceFilter.status,
      source: advanceFilter.source,
      state: myPreference?.state || advanceFilter.state,
      crop: myPreference?.crop || advanceFilter.crop,
      answersCount: advanceFilter.answersCount,
      dateRange: advanceFilter.dateRange,
      priority: advanceFilter.priority,
      domain: myPreference?.domain || advanceFilter.domain,
      user: advanceFilter.user,
    });

    refetch();
  };

  return (
    <div className="container mx-auto px-4 md:px-6 bg-transparent py-4 ">
      <div className="flex flex-col space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="w-full md:max-h-[120vh] max-h-[80vh] border border-gray-200 dark:border-gray-700 shadow-sm rounded-lg bg-transparent">
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
                        preferences you set in your profile.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </TooltipProvider>

              <div className="flex items-center gap-3 flex-wrap">
                <Select value={filter} onValueChange={handleFilterChange}>
                  <SelectTrigger className="flex items-center w-fit justify-center  md:w-[200px] p-2 ">
                    <Filter className="w-5 h-5 md:hidden mx-auto" />
                    <span className="hidden md:block">
                      <SelectValue placeholder="Sort by" />
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest First</SelectItem>
                    <SelectItem value="oldest">Oldest First</SelectItem>
                    <SelectItem value="leastResponses">
                      Least Responses
                    </SelectItem>
                    <SelectItem value="mostResponses">
                      Most Responses
                    </SelectItem>
                  </SelectContent>
                </Select>

                <AdvanceFilterDialog
                  advanceFilter={advanceFilter}
                  setAdvanceFilterValues={setAdvanceFilterValues}
                  handleDialogChange={handleDialogChange}
                  handleApplyFilters={handleApplyFilters}
                  normalizedStates={STATES}
                  crops={CROPS}
                  activeFiltersCount={activeFiltersCount}
                  onReset={onReset}
                  isForQA={true}
                />

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetch()}
                  className="h-9 px-3 bg-transparent hidden md:block"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span className="sr-only">Refresh</span>
                </Button>
              </div>
            </CardHeader>
            {isQuestionsLoading ? (
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
                    Loading Questions...
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    Please wait while we fetch the questions for you.
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
                  No questions available at the moment. The questions displayed
                  here are personalized based on the preferences you set in your
                  profile. Please check back later.
                </p>
              </div>
            ) : (
              <CardContent
                className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600 scrollbar-track-gray-200 dark:scrollbar-track-gray-800 p-4"
                ref={scrollRef}
              >
                <RadioGroup
                  value={selectedQuestion}
                  onValueChange={(value) => {
                    setSelectedQuestion(value);
                    setIsFinalAnswer(false);
                  }}
                  className="space-y-4"
                >
                  {questions?.map((question) => (
                    <div
                      key={question?.id}
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
                            <span>{question?.createdAt}</span>
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
                            <span>{question?.updatedAt}</span>
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

          <ResponseTimeline
            SourceUrlManager={SourceUrlManager}
            handleReset={handleReset}
            handleSubmit={handleSubmit}
            isFinalAnswer={isFinalAnswer}
            isSelectedQuestionLoading={isSelectedQuestionLoading}
            isSubmittingAnswer={isSubmittingAnswer}
            newAnswer={newAnswer}
            selectedQuestionData={selectedQuestionData}
            setNewAnswer={setNewAnswer}
            setSources={setSources}
            sources={sources}
            // history={history}
            onAccept={() => {}}
            onReject={() => {}}
          />
        </div>
      </div>
    </div>
  );
};

type QuestionDetailsDialogProps = {
  question: IQuestion;
  buttonLabel?: string;
};

export const QuestionDetailsDialog = ({
  question,
  buttonLabel = "View more details",
}: QuestionDetailsDialogProps) => {
  const {
    text,
    source,
    priority,
    totalAnswersCount,
    createdAt,
    updatedAt,
    details,
  } = question;

  // const created = createdAt ? new Date(createdAt).toLocaleString() : "-";
  // const updated = updatedAt ? new Date(updatedAt).toLocaleString() : "-";

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          aria-label={buttonLabel}
          title={buttonLabel}
        >
          <div className="p-2 rounded-lg bg-primary/10">
            <Eye className="h-5 w-5 text-primary" />
          </div>
          <span className="sr-only">{buttonLabel}</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-balance">Question Details</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] pr-1 px-4">
          <div className="space-y-6">
            <section className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">
                Summary
              </h3>
              <div className="rounded-md border p-3">
                <p className="text-sm">{text}</p>
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">
                Metadata
              </h3>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Option
                  label={
                    <div className="flex items-center gap-1">
                      <BookOpen className="w-3 h-3 text-primary" /> Source
                    </div>
                  }
                  value={source}
                />
                <Option
                  label={
                    <div className="flex items-center gap-1">
                      <Flag className="w-3 h-3 text-primary" /> Priority
                    </div>
                  }
                  value={priority}
                />
                <Option
                  label={
                    <div className="flex items-center gap-1">
                      <FileText className="w-3 h-3 text-primary" /> Status
                    </div>
                  }
                  value="Open"
                />
                <Option
                  label={
                    <div className="flex items-center gap-1">
                      <MessageSquare className="w-3 h-3 text-primary" /> Total
                      Answers
                    </div>
                  }
                  value={String(totalAnswersCount ?? 0)}
                />
                <Option
                  label={
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-primary" /> Created At
                    </div>
                  }
                  value={createdAt}
                />
                <Option
                  label={
                    <div className="flex items-center gap-1">
                      <RefreshCcw className="w-3 h-3 text-primary" /> Updated At
                    </div>
                  }
                  value={updatedAt}
                />
              </div>
            </section>

            {/* Details */}
            <section className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">
                Details
              </h3>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Option
                  label={
                    <div className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-primary" /> State
                    </div>
                  }
                  value={details?.state}
                />
                <Option
                  label={
                    <div className="flex items-center gap-1">
                      <Map className="w-3 h-3 text-primary" /> District
                    </div>
                  }
                  value={details?.district}
                />
                <Option
                  label={
                    <div className="flex items-center gap-1">
                      <Sprout className="w-3 h-3 text-primary" /> Crop
                    </div>
                  }
                  value={details?.crop}
                />
                <Option
                  label={
                    <div className="flex items-center gap-1">
                      <Sun className="w-3 h-3 text-primary" /> Season
                    </div>
                  }
                  value={details?.season}
                />
                <Option
                  label={
                    <div className="flex items-center gap-1">
                      <Layers className="w-3 h-3 text-primary" /> Domain
                    </div>
                  }
                  value={details?.domain}
                />
              </div>
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

const Option = ({ label, value }: { label: ReactNode; value?: string }) => {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm">{value ?? "-"}</div>
    </div>
  );
};

interface HistoryItem {
  updatedBy: {
    _id: string;
    userName: string;
    email: string;
  };
  answer?: {
    _id: string;
    answer: string;
    approvalCount: string;
    sources: string[];
  };
  status?: "pending" | "approved" | "rejected";
  reasonForRejection?: string;
  approvedAnswer?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface ResponseTimelineProps {
  isSelectedQuestionLoading: boolean;
  selectedQuestionData: any;
  newAnswer: string;
  setNewAnswer: (value: string) => void;
  sources: any[];
  setSources: (sources: any[]) => void;
  isFinalAnswer: boolean;
  isSubmittingAnswer: boolean;
  handleSubmit: () => void;
  handleReset: () => void;
  SourceUrlManager: React.ComponentType<any>;
  history?: HistoryItem[];
  onAccept?: (answerId: string) => void;
  onReject?: (answerId: string, reason: string) => void;
}

const dummyHistory: HistoryItem[] = [
  {
    updatedBy: {
      _id: "user10",
      userName: "Sophia Turner",
      email: "sophia@example.com",
    },
    createdAt: new Date("2024-01-20T16:45:00"),
    updatedAt: new Date("2024-01-20T16:45:00"),
  },
  {
    updatedBy: {
      _id: "user10",
      userName: "Sophia Turner",
      email: "sophia@example.com",
    },
    approvedAnswer: "ans12",
    createdAt: new Date("2024-01-20T16:45:00"),
    updatedAt: new Date("2024-01-20T16:45:00"),
  },
  {
    updatedBy: {
      _id: "user11",
      userName: "Michael Green",
      email: "michael@example.com",
    },
    approvedAnswer: "ans12",
    createdAt: new Date("2024-01-18T13:15:00"),
    updatedAt: new Date("2024-01-18T13:15:00"),
  },
  {
    updatedBy: {
      _id: "user12",
      userName: "Liam Johnson",
      email: "liam@example.com",
    },
    answer: {
      _id: "ans12",
      answer:
        "This version attempted to restructure the explanation but introduced several redundant statements, leading to rejection.",
      approvalCount: "2",
      sources: ["https://developer.mozilla.org/en-US/docs/Web/JavaScript"],
    },

    // status: "approved",
    createdAt: new Date("2024-01-15T09:00:00"),
    updatedAt: new Date("2024-01-15T09:00:00"),
  },
  {
    updatedBy: {
      _id: "user13",
      userName: "Ava Williams",
      email: "ava@example.com",
    },
    answer: {
      _id: "ans13",
      answer:
        "Initial submission with a general overview and minimal detail. It lacked citations and was not aligned with the expected structure.",
      approvalCount: "0",
      sources: ["https://www.britannica.com/"],
    },
    reasonForRejection:
      "The answer was too generic, missing detailed analysis and reference links to support the statements provided.",
    status: "rejected",
    createdAt: new Date("2024-01-12T11:25:00"),
    updatedAt: new Date("2024-01-12T11:25:00"),
  },
];

export const ResponseTimeline = ({
  isSelectedQuestionLoading,
  selectedQuestionData,
  newAnswer,
  setNewAnswer,
  sources,
  setSources,
  isFinalAnswer,
  isSubmittingAnswer,
  handleSubmit,
  handleReset,
  SourceUrlManager,
  history = dummyHistory,
  onAccept,
  onReject,
}: ResponseTimelineProps) => {
  const [rejectionReason, setRejectionReason] = useState("");
  const [isRejectionSubmitted, setIsRejectionSubmitted] = useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [selectedAnswerId, setSelectedAnswerId] = useState("");
  const [urlOpen, setUrlOpen] = useState(false);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleRejectClick = (answerId: string) => {
    setSelectedAnswerId(answerId);
    setIsRejectDialogOpen(true);
  };

  const handleCopy = async (url: string, index: number) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 1500);
    } catch (err) {
      console.error("Failed to copy: ", err);
    }
  };

  const handleRejectSubmit = () => {
    if (rejectionReason.trim() && onReject) {
      onReject(selectedAnswerId, rejectionReason);
      // setRejectionReason("");
      // setIsRejectDialogOpen(false);
    }
  };

  const handleOpenUrl = (url: string) => {
    setSelectedUrl(url);
    setUrlOpen(true);
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (isSelectedQuestionLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-2 text-sm text-muted-foreground">
          Loading responses...
        </p>
      </div>
    );
  }

  if (!selectedQuestionData) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center space-y-4 px-6">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-2">
          <MessageCircle className="w-8 h-8 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-medium">No Question Selected</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Select a question to view its history and add your response.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col w-full md:max-h-[120vh] max-h-[80vh] border border-gray-200 dark:border-gray-700 shadow-sm rounded-lg bg-transparent gap-6`}
    >
      <Card className="border flex-1 flex flex-col h-full bg-transparent">
        <CardHeader className="border-b flex flex-row items-center justify-between pb-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold">Response History</h3>
          </div>
        </CardHeader>
        <CardContent className="p-6 flex-1 flex flex-col overflow-hidden">
          <ScrollArea className="flex-1">
            <div className="space-y-6 pr-4">
              {history.map((item, index) => {
                const isFirst = index === 0;
                return (
                  <div key={item.updatedBy._id} className="relative">
                    {!isFirst && (
                      <div className="absolute left-4 top-10 bottom-0 w-0.5 bg-border" />
                    )}

                    <div className="flex gap-4">
                      <div
                        className={`relative flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                          item.approvedAnswer
                            ? "bg-green-100 dark:bg-green-900/30"
                            : !item.answer
                            ? "bg-primary/10"
                            : item?.status === "approved"
                            ? "bg-green-100 dark:bg-green-900/30"
                            : item?.status === "rejected"
                            ? "bg-red-100 dark:bg-red-900/30"
                            : "bg-primary/10"
                        }`}
                      >
                        {!item.approvedAnswer && !item.status && item.answer ? (
                          <Target className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        ) : item.approvedAnswer ? (
                          <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                        ) : !item.answer ? (
                          <Clock className="w-4 h-4 text-primary" />
                        ) : item.status === "approved" ? (
                          <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                        ) : item.status === "rejected" ? (
                          <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                        ) : (
                          <Clock className="w-4 h-4 text-primary" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-4 mb-2">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium text-sm">
                              {item.updatedBy.userName}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatDate(item.createdAt)}
                            </span>
                          </div>

                          <div className="flex items-center gap-4">
                            {item.status == "approved" && item.answer && (
                              <p className="text-sm">
                                <span className="text-foreground">
                                  Approvals:{" "}
                                </span>
                                {item.answer.approvalCount || "0"}
                              </p>
                            )}
                            {item.status && (
                              <span
                                className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${
                                  item.status === "approved"
                                    ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300"
                                    : item.status === "rejected"
                                    ? "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300"
                                    : "bg-primary/10 text-primary"
                                }`}
                              >
                                {item.status?.charAt(0).toUpperCase() +
                                  item.status?.slice(1)}
                              </span>
                            )}
                          </div>
                        </div>

                        {item.approvedAnswer && (
                          <div className="text-sm p-3 rounded-md border bg-green-50 dark:bg-green-900/10 border-green-300 dark:border-green-700 text-green-800 dark:text-green-300">
                            Accepted.
                          </div>
                        )}

                        {!item.answer && !item.approvedAnswer && (
                          <div className="text-sm p-3 rounded-md border bg-muted/30 text-muted-foreground">
                            Awaiting your response.
                          </div>
                        )}

                        {item.answer && !item.approvedAnswer && (
                          <>
                            <div className="text-sm p-3 rounded-md border bg-card break-words">
                              <ExpandableText
                                text={item.answer.answer}
                                maxLength={150}
                              />
                            </div>

                            <Accordion
                              type="single"
                              collapsible
                              className="text-xs"
                            >
                              <AccordionItem value="history-details">
                                <AccordionTrigger className="text-foreground font-medium text-sm underline">
                                  View Details
                                </AccordionTrigger>
                                <AccordionContent className="space-y-2 text-muted-foreground mt-1">
                                  {item.answer.sources &&
                                    item.answer.sources.length > 0 && (
                                      <div>
                                        <p className="font-medium text-foreground mb-2">
                                          Sources:
                                        </p>
                                        <ul className="list-disc ml-2 mt-1 space-y-1">
                                          {item.answer.sources.map(
                                            (url: string, index: number) => (
                                              <li
                                                key={index}
                                                className="flex items-center justify-between gap-2 text-sm 
                            p-2 border border-border/50 rounded-md 
                            hover:bg-muted/40 transition-colors duration-200"
                                              >
                                                <button
                                                  onClick={() =>
                                                    handleOpenUrl(url)
                                                  }
                                                  className="text-blue-600 dark:text-blue-400 hover:underline break-all inline-flex items-center gap-1 text-left"
                                                >
                                                  {url}
                                                </button>

                                                <button
                                                  onClick={() =>
                                                    handleCopy(url, index)
                                                  }
                                                  className="ml-2 text-muted-foreground hover:text-foreground transition-colors"
                                                  title="Copy URL"
                                                >
                                                  {copiedIndex === index ? (
                                                    <Check className="w-4 h-4 text-green-500" />
                                                  ) : (
                                                    <Copy className="w-4 h-4" />
                                                  )}
                                                </button>
                                              </li>
                                            )
                                          )}
                                        </ul>

                                        {item.status === "rejected" &&
                                          item.reasonForRejection && (
                                            <div className="mt-4 p-2 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                                              <p className="text-xs font-medium text-red-800 dark:text-red-300">
                                                Rejection Reason:
                                              </p>
                                              <div className="text-xs text-red-700 dark:text-red-400 mt-1">
                                                <ExpandableText
                                                  text={item.reasonForRejection}
                                                  maxLength={100}
                                                />
                                              </div>
                                            </div>
                                          )}
                                        <UrlPreviewDialog
                                          open={urlOpen}
                                          onOpenChange={setUrlOpen}
                                          selectedUrl={selectedUrl}
                                        />
                                      </div>
                                    )}
                                </AccordionContent>
                              </AccordionItem>
                            </Accordion>
                          </>
                        )}
                        {!item.answer && !item.approvedAnswer && (
                          <div className="flex items-center gap-2 mt-3">
                            <Button
                              size="sm"
                              // onClick={() => onAccept?.(item.answer!._id)}
                              className="flex items-center gap-1"
                            >
                              <CheckCircle className="w-4 h-4" />
                              Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() =>
                                handleRejectClick("item.answer!._id")
                              }
                              className="flex items-center gap-1"
                            >
                              <XCircle className="w-4 h-4" />
                              Reject
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <DialogContent className="max-w-4xl min-h-[90vh] max-h-[90vh] overflow-y-auto ">
          <DialogHeader>
            <DialogTitle>Reject Response</DialogTitle>
          </DialogHeader>

          {!isRejectionSubmitted && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div>
                <Label
                  htmlFor="rejection-reason"
                  className="text-base font-semibold"
                >
                  Reason for Rejection
                </Label>

                <Textarea
                  id="rejection-reason"
                  placeholder="Please provide a reason for rejecting this response..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="mt-2 min-h-[50vh] max-h-[60vh] w-full resize-none overflow-y-auto 
        break-words whitespace-pre-wrap overflow-x-hidden transition-all duration-200 focus:ring-2"
                  style={{
                    wordWrap: "break-word",
                    overflowWrap: "break-word",
                  }}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsRejectDialogOpen(false);
                    setRejectionReason("");
                    setIsRejectionSubmitted(false);
                  }}
                  className="transition-all duration-200 hover:scale-105 active:scale-95"
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    handleRejectSubmit();
                    setIsRejectionSubmitted(true);
                  }}
                  disabled={!rejectionReason.trim()}
                  className="transition-all duration-200 hover:scale-105 active:scale-95"
                >
                  Submit Reason
                </Button>
              </div>
            </div>
          )}

          {isRejectionSubmitted && rejectionReason && (
            <div className="h-fit flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-8 scale-in-95 duration-400">
              <Card className="border flex-1 flex flex-col ">
                <CardContent className="p-6 space-y-4 flex-1 overflow-y-auto">
                  <div className="flex items-center gap-2 ">
                    <FileText className="w-5 h-5 text-primary" />
                    <h3 className="text-lg font-semibold">
                      Submit New Response
                    </h3>
                  </div>

                  <div className="flex flex-col w-full animate-in fade-in duration-300 delay-150">
                    <Label className="text-sm font-medium text-muted-foreground mb-1">
                      Current Query:
                    </Label>
                    <p className="text-sm p-3 rounded-md border break-words bg-muted/50 transition-colors duration-200">
                      {selectedQuestionData.text}
                    </p>
                  </div>

                  <div className="animate-in fade-in duration-300 delay-200">
                    <Label htmlFor="new-answer" className="text-sm font-medium">
                      Draft Response:
                    </Label>
                    <Textarea
                      id="new-answer"
                      placeholder="Enter your answer here..."
                      value={newAnswer}
                      onChange={(e) => setNewAnswer(e.target.value)}
                      className="mt-1 max-h-[120px] min-h-[100px] resize-y text-sm rounded-md overflow-y-auto p-3 pb-0 transition-all duration-200 focus:ring-2"
                    />

                    <div className="border rounded-xl p-6 shadow-sm mt-3 bg-muted/20 transition-all duration-200 animate-in fade-in slide-in-from-bottom-2 duration-300 delay-250">
                      <SourceUrlManager
                        sources={sources}
                        onSourcesChange={setSources}
                      />

                      {sources.length > 0 && (
                        <div className="mt-6 pt-6 border-t animate-in fade-in slide-in-from-bottom-2 duration-200">
                          <p className="text-sm text-muted-foreground">
                            {sources.length}{" "}
                            {sources.length === 1 ? "source" : "sources"} added
                          </p>
                        </div>
                      )}
                    </div>

                    {isFinalAnswer && (
                      <p className="mt-2 flex items-center gap-2 text-green-600 dark:text-green-400 text-sm font-medium animate-in fade-in scale-in-95 duration-300">
                        <CheckCircle
                          className="w-4 h-4 animate-spin"
                          style={{ animationDuration: "2s" }}
                        />
                        <span>
                          Congratulations! Your response was selected as the
                          final answer. Great job!
                        </span>
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-4 animate-in fade-in duration-300 delay-300">
                    <div className="flex items-center space-x-3">
                      <Button
                        onClick={handleSubmit}
                        disabled={!newAnswer.trim() || isSubmittingAnswer}
                        className="flex items-center gap-2 transition-all duration-200 hover:scale-105 active:scale-95"
                      >
                        {isSubmittingAnswer ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Submitting…</span>
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4" />
                            <span>Submit</span>
                          </>
                        )}
                      </Button>

                      <Button
                        variant="secondary"
                        onClick={handleReset}
                        className="transition-all duration-200 hover:scale-105 active:scale-95"
                      >
                        <span className="sr-only">Reset answer</span>
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    </div>

                    <Button
                      variant="ghost"
                      onClick={() => setIsRejectionSubmitted(false)}
                      disabled={!isRejectionSubmitted}
                      className="flex items-center gap-2 text-sm text-muted-foreground transition-all duration-200 hover:scale-105 active:scale-95 py-2"
                    >
                      {!isRejectionSubmitted ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Loading...</span>
                        </>
                      ) : (
                        <>
                          <Pencil className="w-4 h-4" />
                          <span>Edit Reason</span>
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
