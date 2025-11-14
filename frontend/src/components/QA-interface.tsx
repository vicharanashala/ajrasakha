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
import {
  useGetAllocatedQuestionPage,
  useGetAllocatedQuestions,
} from "@/hooks/api/question/useGetAllocatedQuestions";
import { useGetQuestionById } from "@/hooks/api/question/useGetQuestionById";
import { useSubmitAnswer } from "@/hooks/api/answer/useSubmitAnswer";
import { toast } from "sonner";
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
import type {
  HistoryItem,
  IMyPreference,
  IQuestion,
  SourceItem,
} from "@/types";
import { ScrollArea } from "./atoms/scroll-area";
import { ExpandableText } from "./expandable-text";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./atoms/accordion";
import { UrlPreviewDialog } from "./url-preview-dialog";
import { ConfirmationModal } from "./confirmation-modal";
import {
  useReviewAnswer,
  type IReviewAnswerPayload,
} from "@/hooks/api/answer/useReviewAnswer";
import { formatDate } from "@/utils/formatDate";

export type QuestionFilter =
  | "newest"
  | "oldest"
  | "leastResponses"
  | "mostResponses";
export const QAInterface = ({
  autoSelectQuestionId,
  onManualSelect,
}: {
  autoSelectQuestionId: string | null;
  onManualSelect: (id: string | null) => void;
}) => {
  const [selectedQuestion, setSelectedQuestion] = useState<string | null>(null);
  const [newAnswer, setNewAnswer] = useState<string>("");
  const [isFinalAnswer, setIsFinalAnswer] = useState<boolean>(false);
  const [filter, setFilter] = useState<QuestionFilter>("newest");
  const [sources, setSources] = useState<SourceItem[]>([]);

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
  } = useGetAllocatedQuestions(LIMIT, filter, preferences);
  const { data: exactQuestionPage, isLoading: isLoading } =
    useGetAllocatedQuestionPage(autoSelectQuestionId!);

  // const questions = questionPages?.pages.flat() || [];
  const questions = useMemo(() => {
    return questionPages?.pages.flat() || [];
  }, [questionPages]);

  const { data: selectedQuestionData, isLoading: isSelectedQuestionLoading } =
    useGetQuestionById(selectedQuestion);

  // const { mutateAsync: submitAnswer, isPending: isSubmittingAnswer } =
  //   useSubmitAnswer();
  const { mutateAsync: respondQuestion, isPending: isResponding } =
    useReviewAnswer();

  const [isLoadingTargetQuestion, setIsLoadingTargetQuestion] = useState(false);
  //for selecting the first question
  useEffect(() => {
    if (autoSelectQuestionId) return;

    if (!isLoading && questions.length > 0) {
      setSelectedQuestion(questions[0]!.id);
    }
  }, [isLoading, questions, autoSelectQuestionId]);

  const hasInitialized = useRef(false);
  const questionsRef = useRef(questions);
  const questionItemRefs = useRef<Record<string, HTMLDivElement>>({});

  // Function to set ref for each question item
  const setQuestionRef = (
    questionId: string,
    element: HTMLDivElement | null
  ) => {
    if (element) {
      questionItemRefs.current[questionId] = element;
    } else {
      delete questionItemRefs.current[questionId];
    }
  };
  useEffect(() => {
    questionsRef.current = questions;
  }, [questions]);

  //to scroll to questions
  useEffect(() => {
    setNewAnswer("");
    setSources([]);
    setIsFinalAnswer(false);
    if (!selectedQuestion || !scrollRef.current) return;

    // Small delay to ensure the DOM is updated and question is rendered
    const scrollTimer = setTimeout(() => {
      const questionElement = questionItemRefs.current[selectedQuestion];
      if (questionElement && scrollRef.current) {
        questionElement.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "nearest",
        });
      } else {
        console.log(
          "Question element not found for scrolling:",
          selectedQuestion
        );
      }
    }, 200);

    return () => clearTimeout(scrollTimer);
  }, [selectedQuestion]);

  //To auto select from notifications
  useEffect(() => {
    if (!autoSelectQuestionId || !exactQuestionPage || isQuestionsLoading)
      return;

    const findAndSelectQuestion = async () => {
      setIsLoadingTargetQuestion(true);

      // Check if question is in currently loaded pages
      const allLoadedQuestions = questionPages?.pages.flat() || [];
      const questionExists = allLoadedQuestions.some(
        (q) => q?.id === autoSelectQuestionId
      );

      if (questionExists) {
        // Question is already loaded - select it
        setSelectedQuestion(autoSelectQuestionId);
        onManualSelect?.(autoSelectQuestionId);
        setIsLoadingTargetQuestion(false);
        return;
      }

      // Question is not in loaded pages - we need to load more pages
      try {
        const targetPage = exactQuestionPage;
        const currentlyLoadedPages = questionPages?.pages.length || 0;
        if (targetPage > currentlyLoadedPages) {
          // Load pages until we reach the target page
          let pagesToLoad = targetPage - currentlyLoadedPages;
          for (let i = 0; i < pagesToLoad; i++) {
            if (hasNextPage && !isFetchingNextPage) {
              await fetchNextPage();
            } else {
              break;
            }
          }
        } else {
          if (questions.length > 0) {
            setSelectedQuestion(questions[0]!.id);
            onManualSelect?.(null); // Clear the auto-select since question doesn't exist
          }
          setIsLoadingTargetQuestion(false);
        }
      } catch (error) {
        console.error("Error loading target question:", error);
        setIsLoadingTargetQuestion(false);
      }
    };

    findAndSelectQuestion();
  }, [
    exactQuestionPage,
    autoSelectQuestionId,
    questionPages,
    isQuestionsLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  ]);

  // Reset initialization when filters change
  useEffect(() => {
    hasInitialized.current = false;
  }, [filter, preferences]);

  //for pagination
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

  const handleSubmitResponse = async (
    status?: "accepted" | "rejected",
    currentReviewingAnswer?: string,
    rejectionReason?: string
  ) => {
    if (!selectedQuestion || isResponding) return;

    let payload = { questionId: selectedQuestion } as IReviewAnswerPayload;

    if (!status) {
      // responding first time
      if (!sources.length) {
        toast.error("Atleast one source is required!");
        return;
      }

      payload.sources = sources;
      payload.answer = newAnswer;
    } else if (status == "accepted") {
      payload.status = "accepted";
      payload.approvedAnswer = currentReviewingAnswer;
    } else if (status == "rejected") {
      if (!sources.length) {
        toast.error("Atleast one source is required!");
        return;
      }
      payload.rejectedAnswer = currentReviewingAnswer;
      payload.reasonForRejection = rejectionReason;
      payload.answer = newAnswer;
      payload.sources = sources;
      payload.status = "rejected";
    }

    try {
      await respondQuestion(payload);
      onManualSelect?.(null);
      setSelectedQuestion(null);
      setNewAnswer("");
      setSources([]);
      toast.success("Your response submitted, thankyou!");
    } catch (error) {
      console.log("Failed to submit: ", error);
    }
  };

  const handleQuestionClick = (id: string) => {
    setSelectedQuestion(id);
    if (autoSelectQuestionId && id !== autoSelectQuestionId) {
      onManualSelect(null);
    }
  };

  return (
    <div className="container mx-auto px-4 md:px-6 bg-transparent py-4 ">
      <div className="flex flex-col space-y-6">
        <div
          className={`grid grid-cols-1 ${
            questions.length && "lg:grid-cols-2"
          } gap-6`}
        >
          <Card className="w-full md:max-h-[120vh]  max-h-[80vh] min-h-[75vh] border border-gray-200 dark:border-gray-700 shadow-sm rounded-lg bg-transparent">
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

              {/* <div className="flex items-center gap-3 flex-wrap">
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

                </div> */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                className="h-9 px-3 bg-transparent hidden md:block"
              >
                <RefreshCw className="w-4 h-4" />
                <span className="sr-only">Refresh</span>
              </Button>
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
                  onValueChange={handleQuestionClick}
                  className="space-y-4"
                >
                  {questions?.map((question, index) => (
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

          {selectedQuestionData &&
            selectedQuestionData?.history?.length == 0 && (
              <Card className="w-full  border border-gray-200 dark:border-gray-700 shadow-sm rounded-lg bg-transparent mb-3 md:mb-0">
                <CardHeader className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-700">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <CardTitle className="text-lg font-semibold">
                    Response
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-full flex flex-col space-y-6 p-4 overflow-hidden scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600 scrollbar-track-gray-200 dark:scrollbar-track-gray-800">
                  {isSelectedQuestionLoading ? (
                    <div className="h-full flex flex-col items-center justify-center">
                      <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Loading responses...
                      </p>
                    </div>
                  ) : selectedQuestionData ? (
                    <>
                      <div className="flex flex-col w-full">
                        <div className="flex items-center justify-between gap-2">
                          <Label className="text-sm font-medium text-muted-foreground">
                            Current Query:
                          </Label>
                          <QuestionDetailsDialog
                            question={selectedQuestionData}
                          />
                        </div>

                        <p className="text-sm mt-1 p-3 rounded-md border border-gray-200 dark:border-gray-600 break-words">
                          {selectedQuestionData.text}
                        </p>
                      </div>

                      <div>
                        <Label
                          htmlFor="new-answer"
                          className="text-sm font-medium"
                        >
                          Draft Response:
                        </Label>
                        <Textarea
                          id="new-answer"
                          placeholder="Enter your answer here..."
                          value={newAnswer}
                          onChange={(e) => setNewAnswer(e.target.value)}
                          className="mt-1 md:max-h-[190px] max-h-[170px] min-h-[150px] resize-y border border-gray-200 dark:border-gray-600 text-sm md:text-md rounded-md overflow-y-auto p-3 pb-0 bg-transparent"
                        />

                        <div className="bg-card border border-border rounded-xl p-6 shadow-sm mt-3 md:mt-6">
                          <SourceUrlManager
                            sources={sources}
                            onSourcesChange={setSources}
                          />

                          {sources.length > 0 && (
                            <div className="mt-6 pt-6 border-t border-border">
                              <p className="text-sm text-muted-foreground">
                                {sources.length}{" "}
                                {sources.length === 1 ? "source" : "sources"}{" "}
                                added
                              </p>
                            </div>
                          )}
                        </div>
                        {isFinalAnswer && (
                          <p className="mt-2 flex items-center gap-2 text-green-600 dark:text-green-400 text-sm font-medium">
                            <CheckCircle className="w-4 h-4" />
                            <span>
                              Congratulations! Your response was selected as the
                              final answer. Great job!
                            </span>
                          </p>
                        )}
                      </div>
                      <div className="flex items-center justify-between  p-4 pt-0">
                        <div className="flex items-center space-x-3">
                          <ConfirmationModal
                            title="Submit Response"
                            description="You are the first expert responding to this question. Please cross-check your answer carefully before submitting — accurate responses improve your approval conversion rate."
                            confirmText="Submit Response"
                            cancelText="Cancel"
                            onConfirm={() => handleSubmitResponse()}
                            trigger={
                              <Button
                                disabled={!newAnswer.trim() || isResponding}
                                className="flex items-center gap-2"
                              >
                                {isResponding ? (
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
                            }
                          />

                          {/* <Button
                            onClick={handleSubmit}
                            disabled={!newAnswer.trim() || isSubmittingAnswer}
                            className="flex items-center gap-2"
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
                          </Button> */}
                          <Button variant="secondary" onClick={handleReset}>
                            <span className="sr-only">Reset answer</span>
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        </div>

                        {/* <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="outline"
                              className="bg-transparent flex items-center"
                            >
                              <Eye className="w-4 h-4 md:mr-2" />

                              <span className="hidden md:inline">
                                View Other Responses
                              </span>
                            </Button>
                          </DialogTrigger>
                          <DialogContent
                            className="max-w-6xl max-h-[80vh] overflow-y-auto "
                            style={{ maxWidth: "70vw" }}
                          >
                            <div className="mt-4">
                              {selectedQuestionData.currentAnswers &&
                              selectedQuestionData.currentAnswers.length > 0 ? (
                                <div className="space-y-6">
                                  {selectedQuestionData.currentAnswers
                                    ?.slice()
                                    .sort(
                                      (a, b) =>
                                        (b.isFinalAnswer ? 1 : 0) -
                                        (a.isFinalAnswer ? 1 : 0)
                                    )
                                    .map((currentAnswer, index) => (
                                      <div
                                        key={currentAnswer.id}
                                        className={`relative overflow-hidden rounded-xl border transition-all duration-300 hover:shadow-lg ${
                                          currentAnswer.isFinalAnswer
                                            ? "bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/20 border-green-200 dark:border-green-800 shadow-green-100/50 dark:shadow-green-900/20"
                                            : ""
                                        }`}
                                      >
                                        <div
                                          className={`absolute left-0 top-0 h-full w-1 ${
                                            currentAnswer.isFinalAnswer
                                              ? "bg-gradient-to-b from-green-500 to-emerald-600"
                                              : "bg-gradient-to-b from-primary to-primary/60"
                                          }`}
                                        />

                                        {currentAnswer.isFinalAnswer && (
                                          <div className="absolute top-0 right-0 w-20 h-20 overflow-hidden">
                                            <div className="absolute top-0 right-0 w-8 h-8 bg-green-200/30 dark:bg-green-700/20 rounded-bl-full" />
                                            <div className="absolute top-2 right-2 w-4 h-4 bg-green-300/40 dark:bg-green-600/30 rounded-full" />
                                          </div>
                                        )}

                                        <div className="relative p-6">
                                          <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-3">
                                              <div
                                                className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                                  currentAnswer.isFinalAnswer
                                                    ? "bg-green-100 dark:bg-green-900/50"
                                                    : "bg-gray-100 dark:bg-gray-800"
                                                }`}
                                              >
                                                {currentAnswer.isFinalAnswer ? (
                                                  <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                                                ) : (
                                                  <div className="p-2 rounded-lg bg-primary/10">
                                                    <MessageCircle className="w-4 h-4 text-primary" />
                                                  </div>
                                                )}
                                              </div>

                                              <div className="flex flex-col">
                                                <span className="text-sm font-semibold text-foreground">
                                                  Response {index + 1}
                                                </span>
                                                <span className="text-xs text-muted-foreground">
                                                  {new Date(
                                                    currentAnswer.createdAt
                                                  ).toLocaleString("en-US", {
                                                    month: "short",
                                                    day: "numeric",
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                  })}
                                                </span>
                                              </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                              {currentAnswer.isFinalAnswer && (
                                                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200 rounded-full border border-green-200 dark:border-green-800">
                                                  <svg
                                                    className="w-3 h-3"
                                                    fill="currentColor"
                                                    viewBox="0 0 20 20"
                                                  >
                                                    <path
                                                      fillRule="evenodd"
                                                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                                      clipRule="evenodd"
                                                    />
                                                  </svg>
                                                  <span className="text-xs font-semibold">
                                                    Final Answer
                                                  </span>
                                                </div>
                                              )}
                                            </div>
                                          </div>

                                          <div className="space-y-4">
                                            <div
                                              className={`prose prose-sm max-w-none ${
                                                currentAnswer.isFinalAnswer
                                                  ? "prose-green dark:prose-invert"
                                                  : "dark:prose-invert"
                                              }`}
                                            >
                                              <p className="text-base leading-relaxed text-foreground/90 mb-0">
                                                {currentAnswer.answer}
                                              </p>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                </div>
                              ) : (
                                <div className="text-center py-12">
                                  <p className="text-muted-foreground italic">
                                    No responses provided yet, Draft your first
                                    Response!
                                  </p>
                                </div>
                              )}
                            </div>
                          </DialogContent>
                        </Dialog> */}
                      </div>
                    </>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center space-y-4 px-6">
                      <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-2">
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
                            d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                      </div>

                      <div className="space-y-2">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                          No Question Selected
                        </h3>
                        <p className="text-sm text-muted-foreground max-w-sm">
                          Select a question from the right side to view its
                          details, add your response, or check existing
                          responses.
                        </p>
                      </div>

                      <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                        <div className="flex items-start space-x-3">
                          <div className="flex-shrink-0">
                            <svg
                              className="w-5 h-5 text-blue-500 dark:text-blue-400 mt-0.5"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </div>
                          <div className="text-left">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              Getting Started
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Choose any question from the list to start
                              drafting responses or reviewing existing answers.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

          {questions &&
            questions.length != 0 &&
            selectedQuestionData &&
            selectedQuestionData?.history?.length > 0 && (
              <ResponseTimeline
                SourceUrlManager={SourceUrlManager}
                handleReset={handleReset}
                handleSubmit={handleSubmitResponse}
                isFinalAnswer={isFinalAnswer}
                isSelectedQuestionLoading={isSelectedQuestionLoading}
                isSubmittingAnswer={isResponding}
                newAnswer={newAnswer}
                selectedQuestionData={selectedQuestionData!}
                setNewAnswer={setNewAnswer}
                setSources={setSources}
                sources={sources}
              />
            )}
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
    status,
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
                  value={status}
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

interface ResponseTimelineProps {
  isSelectedQuestionLoading: boolean;
  selectedQuestionData: IQuestion;
  newAnswer: string;
  setNewAnswer: (value: string) => void;
  sources: SourceItem[];
  setSources: (sources: any[]) => void;
  isFinalAnswer: boolean;
  isSubmittingAnswer: boolean;
  handleSubmit: (
    status?: "accepted" | "rejected",
    currentReviewingAnswer?: string,
    rejectionReason?: string
  ) => void;
  handleReset: () => void;
  SourceUrlManager: React.ComponentType<any>;
}

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
}: ResponseTimelineProps) => {
  const [rejectionReason, setRejectionReason] = useState("");
  const [isRejectionSubmitted, setIsRejectionSubmitted] = useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [urlOpen, setUrlOpen] = useState(false);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [isRejecConfirmationOpen, setIsRejecConfirmationOpen] = useState(false);
  const [isAccepConfirmationOpen, setIsAccepConfirmationOpen] = useState(false);

  const history = selectedQuestionData?.history || [];

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

  useEffect(() => {
    if (currentReviewingAnswer && currentReviewingAnswer.answer)
      setNewAnswer(currentReviewingAnswer.answer);
  }, [currentReviewingAnswer]);

  const handleCopy = async (url: string, index: number) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 1500);
    } catch (err) {
      console.error("Failed to copy: ", err);
    }
  };

  const handleReject = () => {
    if (rejectionReason.trim() === "") {
      toast.error("No reason provided for rejection");
      return;
    }
    if (rejectionReason.length < 8) {
      toast.error("Rejection reason must be atleast 8 letters");
      return;
    }

    if (!currentReviewingAnswer) {
      toast.error(
        "Unable to locate the current review answer. Please refresh and try again."
      );
      return;
    }

    const reviewAnswerId = currentReviewingAnswer._id?.toString();

    handleSubmit("rejected", reviewAnswerId, rejectionReason);
  };

  const handleAccept = () => {
    if (!currentReviewingAnswer) {
      toast.error(
        "Unable to locate the current review answer. Please refresh and try again."
      );
      return;
    }

    const reviewAnswerId = currentReviewingAnswer._id?.toString();

    handleSubmit("accepted", reviewAnswerId);
  };

  const handleOpenUrl = (url: string) => {
    setSelectedUrl(url);
    setUrlOpen(true);
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
              {selectedQuestionData?.history.map((item, index) => {
                const isFirst = index === 0;
                return (
                  <div key={item.updatedBy._id} className="relative">
                    {!isFirst && (
                      <div className="absolute left-4 top-10 bottom-0 w-0.5 bg-border" />
                    )}

                    <div className="flex gap-4">
                      <div
                        className={`relative flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                          item.rejectedAnswer
                            ? "bg-red-100 dark:bg-red-900/30"
                            : item.approvedAnswer
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
                        {(item.status == "in-review" || // if the answer is ther andn status is in-review means (first res)and if the status the reviewed that means he reviewed/ rejected previous answer and given new answer
                          item.status == "reviewed") &&
                        item.answer ? (
                          <Target className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        ) : item.approvedAnswer ? (
                          <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                        ) : item.rejectedAnswer ? (
                          <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
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
                                  (item.status == "in-review" || // if the answer is ther andn status is in-review means (first res)and if the status the reviewed that means he reviewed/ rejected previous answer and given new answer
                                    item.status == "reviewed") &&
                                  item.answer
                                    ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300"
                                    : item.status === "approved"
                                    ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300"
                                    : item.status === "rejected"
                                    ? "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300"
                                    : "bg-primary/10 text-primary"
                                }`}
                              >
                                {(item.status == "in-review" || // if the answer is ther andn status is in-review means (first res)and if the status the reviewed that means he reviewed/ rejected previous answer and given new answer
                                  item.status == "reviewed") &&
                                item.answer
                                  ? "Answer created"
                                  : item.status
                                  ? item.status.charAt(0).toUpperCase() +
                                    item.status.slice(1)
                                  : ""}
                              </span>
                            )}
                          </div>
                        </div>

                        {item.approvedAnswer && (
                          <div className="text-sm p-3 rounded-md border bg-green-50 dark:bg-green-900/10 border-green-300 dark:border-green-700 text-green-800 dark:text-green-300">
                            Accepted.
                          </div>
                        )}

                        {item.status == "in-review" && !item.answer && (
                          <div className="text-sm p-3 rounded-md border bg-muted/30 text-muted-foreground">
                            Awaiting your response.
                          </div>
                        )}

                        {item.answer && (
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
                                            (
                                              source: SourceItem,
                                              index: number
                                            ) => (
                                              <li
                                                key={index}
                                                className="flex items-center justify-between gap-2 text-sm 
                            p-2 border border-border/50 rounded-md 
                            hover:bg-muted/40 transition-colors duration-200"
                                              >
                                                {/* <button
                                                  onClick={() =>
                                                    handleOpenUrl(source.source)
                                                  }
                                                  className="text-blue-600 dark:text-blue-400  break-all inline-flex items-center gap-2 text-left"
                                                >
                                                  <span className="hover:underline">
                                                    {source.source}
                                                  </span>
                                                  {source.page && (
                                                    <>
                                                      <span className="text-muted-foreground">
                                                        •
                                                      </span>
                                                      <span className="text-xs text-muted-foreground">
                                                        page {source.page}
                                                      </span>
                                                    </>
                                                  )}
                                                </button> */}
                                                <a
                                                  href={source.source}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="text-blue-600 dark:text-blue-400 break-all inline-flex items-center gap-2 text-left"
                                                >
                                                  <span className="hover:underline">
                                                    {source.source}
                                                  </span>

                                                  {source.page && (
                                                    <>
                                                      <span className="text-muted-foreground">
                                                        •
                                                      </span>
                                                      <span className="text-xs text-muted-foreground">
                                                        page {source.page}
                                                      </span>
                                                    </>
                                                  )}
                                                </a>
                                                <button
                                                  onClick={() =>
                                                    handleCopy(
                                                      source.source,
                                                      index
                                                    )
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
                        {!item.answer &&
                          !item.approvedAnswer &&
                          !item.rejectedAnswer &&
                          item.status == "in-review" && (
                            <div className="flex items-center gap-2 mt-3">
                              <ConfirmationModal
                                title="Confirm Acceptance"
                                description="Are you sure you want to accept this request? This action cannot be undone."
                                confirmText="Accept"
                                cancelText="Cancel"
                                isLoading={isSubmittingAnswer}
                                open={isAccepConfirmationOpen}
                                onOpenChange={setIsAccepConfirmationOpen}
                                onConfirm={handleAccept}
                                trigger={
                                  <Button
                                    disabled={isSubmittingAnswer}
                                    size="sm"
                                    className="flex items-center gap-1"
                                  >
                                    {isSubmittingAnswer &&
                                    !rejectionReason &&
                                    !isRejectionSubmitted ? (
                                      <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Accepting...
                                      </>
                                    ) : (
                                      <>
                                        <CheckCircle className="w-4 h-4" />
                                        Accept
                                      </>
                                    )}
                                  </Button>
                                }
                              />

                              <Button
                                size="sm"
                                disabled={isSubmittingAnswer}
                                variant="destructive"
                                className="flex items-center gap-1"
                                onClick={() => setIsRejectDialogOpen(true)}
                              >
                                {isSubmittingAnswer &&
                                rejectionReason &&
                                isRejectionSubmitted ? (
                                  <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Rejecting...
                                  </>
                                ) : (
                                  <>
                                    <XCircle className="w-4 h-4" />
                                    Reject
                                  </>
                                )}
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
        <DialogContent
          className="max-w-4xl min-h-[70vh] max-h-[90vh] overflow-y-auto "
          style={{ minWidth: "100vh" }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="p-2 rounded-lg ">
                <XCircle className="w-5 h-5 text-red-500 dark:text-red-700" />
              </div>
              Reject Response
            </DialogTitle>
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
                      <ConfirmationModal
                        title="Confirm Rejection"
                        description="Are you sure you want to reject this request? This action cannot be undone."
                        confirmText="Reject"
                        cancelText="Cancel"
                        type="delete"
                        isLoading={isSubmittingAnswer}
                        open={isRejecConfirmationOpen}
                        onOpenChange={setIsRejecConfirmationOpen}
                        onConfirm={handleReject}
                        trigger={
                          <Button
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
                        }
                      />

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
