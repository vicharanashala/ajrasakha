"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CheckCircle,
  RefreshCw,
  RotateCcw,
  MessageCircle,
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
  FileSearch,
  ArrowRight,
  CheckCheck,
  X,
  History,
  Cross,
  CroissantIcon,
  CrossIcon,
  Bot,
  Zap,
  Cpu,
  Brain,
  ArrowUpRight
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
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./atoms/dialog";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./atoms/tooltip";
import { SourceUrlManager } from "./source-url-manager";
import {
  type AdvanceFilterValues,
  type QuestionDateRangeFilter,
  type QuestionFilterStatus,
  type QuestionPriorityFilter,
  type QuestionSourceFilter,
} from "./advanced-question-filter";
import type {} from "./questions-page";
import type {
  HistoryItem,
  IQuestion,
  IReviewParmeters,
  SourceItem,
} from "@/types";
import { ScrollArea } from "./atoms/scroll-area";
import { ExpandableText } from "./expandable-text";
import { ConfirmationModal } from "./confirmation-modal";
import {
  useReviewAnswer,
  type IReviewAnswerPayload,
} from "@/hooks/api/answer/useReviewAnswer";
import { formatDate } from "@/utils/formatDate";
import { Switch } from "./atoms/switch";
import { Badge } from "./atoms/badge";
import { Separator } from "./atoms/separator";
import { CommentsSection } from "./comments-section";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./atoms/accordion";
import { renderModificationDiff } from "./question-details";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/atoms/select";

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
  const [actionType, setActionType] = useState<"allocated" | "reroute">(
    "allocated"
  );
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
  const [remarks, setRemarks] = useState("");

  const [isLoaded, setIsLoaded] = useState(false);
  // const [advanceFilter, setAdvanceFilterValues] = useState<AdvanceFilterValues>(
  //   {
  //     status: "all",
  //     source: "all",
  //     state: "all",
  //     answersCount: [0, 100],
  //     dateRange: "all",
  //     crop: "all",
  //     priority: "all",
  //     domain: "all",
  //     user: "all",
  //   }
  // );
  // const handleDialogChange = (key: string, value: any) => {
  //   setAdvanceFilterValues((prev) => ({ ...prev, [key]: value }));
  // };
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
  } = useGetAllocatedQuestions(LIMIT, filter, preferences,actionType);
  const { data: exactQuestionPage, isLoading: isLoading } =
    useGetAllocatedQuestionPage(autoSelectQuestionId!);

  // const questions = questionPages?.pages.flat() || [];
  /*const questions = useMemo(() => {
     return questionPages?.pages.flat() || [];
     }, [questionPages]);*/
  const questions = useMemo(() => {
    if (!questionPages?.pages) return [];
  
    if (actionType === "allocated") {
      return questionPages.pages.flat();
    }
  
    return questionPages.pages[0]?.data?.flat() || [];
  }, [questionPages, actionType]);

  const { data: selectedQuestionData, isLoading: isSelectedQuestionLoading } =
    useGetQuestionById(selectedQuestion,actionType);

  // const { mutateAsync: submitAnswer, isPending: isSubmittingAnswer } =
  //   useSubmitAnswer();
  const { mutateAsync: respondQuestion, isPending: isResponding } =
    useReviewAnswer();

  const [isLoadingTargetQuestion, setIsLoadingTargetQuestion] = useState(false);
  //for selecting the first question

  const hasInitialized = useRef(false);
  const questionsRef = useRef(questions);
  const questionItemRefs = useRef<Record<string, HTMLDivElement>>({});
  // const [isLoaded, setIsLoaded] = useState(false);

  const [drafts, setDrafts] = useState<
    Record<string, { answer: string; sources: any[]; remarks: string }>
  >({});

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

  useEffect(() => {
    const saved = localStorage.getItem("questionDrafts");

    if (saved) {
      setDrafts(JSON.parse(saved));
    }

    const savedSelected = localStorage.getItem("selectedQuestion");
    if (savedSelected) setSelectedQuestion(savedSelected);

    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (!isLoaded) return; // wait until drafts + selected are loaded
    if (autoSelectQuestionId) return;

    const savedSelected = localStorage.getItem("selectedQuestion");

    if (savedSelected && questions.some((q) => q?.id === savedSelected)) {
      setSelectedQuestion(savedSelected);
    } else {
      console.log("the questions coming===",questions)
      const firstId = questions[0]?.id ?? null;
      setSelectedQuestion(firstId);
      console.log("the selected question coming===",questions[0]?.id)
    }
  }, [isLoading, questions, autoSelectQuestionId,actionType]);

  useEffect(() => {
    if (!selectedQuestion) return;

    localStorage.setItem("selectedQuestion", selectedQuestion);

    const draft = drafts[selectedQuestion];

    if (draft) {
      setNewAnswer(draft.answer);
      setSources(draft.sources);
      setRemarks(draft.remarks);
    } else {
      setNewAnswer("");
      setSources([]);
    }
  }, [selectedQuestion]);

  useEffect(() => {
    if (!selectedQuestion) return;

    setDrafts((prev) => {
      const existing = prev[selectedQuestion];

      // Prevent unnecessary update loops
      if (
        existing &&
        existing.answer === newAnswer &&
        JSON.stringify(existing.sources) === JSON.stringify(sources) &&
        existing.remarks === remarks
      ) {
        return prev;
      }

      return {
        ...prev,
        [selectedQuestion]: {
          answer: newAnswer,
          sources,
          remarks,
        },
      };
    });
  }, [newAnswer, sources, remarks, selectedQuestion]);

  useEffect(() => {
    if (!isLoaded) return;
    localStorage.setItem("questionDrafts", JSON.stringify(drafts));
  }, [drafts, isLoaded]);

  //to scroll to questions
  useEffect(() => {
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

  // const handleFilterChange = (value: QuestionFilter) => {
  //   setFilter(value);
  // };

  useEffect(() => {
    if (!selectedQuestionData?.aiInitialAnswer || !selectedQuestion) return;

    const draft = drafts[selectedQuestion]; // previous answer that were stored in localstorage

    // Set AI initial answer only if user hasn't typed anything
    if (!newAnswer && !draft?.answer) {
      setNewAnswer(selectedQuestionData.aiInitialAnswer);
    }

    const isAiAnswer =
      newAnswer.trim() === selectedQuestionData.aiInitialAnswer.trim();

    if (!draft?.remarks) setRemarks(isAiAnswer ? "AI Generated Answer" : "");
  }, [selectedQuestionData, newAnswer]);

  const handleReset = () => {
    setNewAnswer("");
    setSources([]);
    setRemarks("");
  };

  const handleSubmitResponse = async (
    status?: "accepted" | "rejected" | "modified",
    parameters?: IReviewParmeters,
    currentReviewingAnswerId?: string,
    rejectionReason?: string
  ) => {
    if (!selectedQuestion || isResponding) return;

    const payload = {
      questionId: selectedQuestion,
      parameters,
    } as IReviewAnswerPayload;

    const requiresSources =
      !status || status === "rejected" || status === "modified";

    // Validate sources only where needed
    if (requiresSources && sources.length === 0) {
      toast.error("At least one source is required!");
      return;
    }

    // Handle first-time response
    if (!status) {
      payload.answer = newAnswer;
      payload.sources = sources;
      payload.remarks = remarks;
    }

    // Accepted
    if (status === "accepted") {
      payload.status = "accepted";
      payload.approvedAnswer = currentReviewingAnswerId;
    }

    // Rejected
    if (status === "rejected") {
      payload.status = "rejected";
      payload.rejectedAnswer = currentReviewingAnswerId;
      payload.reasonForRejection = rejectionReason;
      payload.answer = newAnswer;
      payload.sources = sources;
      payload.remarks = remarks;
    }

    // Modified
    if (status === "modified") {
      payload.status = "modified";
      payload.modifiedAnswer = currentReviewingAnswerId;
      payload.reasonForModification = rejectionReason; // Currently both modification and rejection reason storing in a single state
      payload.answer = newAnswer;
      payload.sources = sources;
    }

    try {
      await respondQuestion(payload);

      // Reset UI
      onManualSelect?.(null);
      setDrafts((prev) => {
        const updated = { ...prev };
        delete updated[selectedQuestion];
        return updated;
      });
      setSelectedQuestion(null);
      handleReset();

      toast.success("Your response has been submitted. Thank you!");
    } catch (error) {
      console.error("Failed to submit:", error);
    }
  };

  const handleQuestionClick = (id: string) => {
    setSelectedQuestion(id);
    if (autoSelectQuestionId && id !== autoSelectQuestionId) {
      onManualSelect(null);
    }
    handleReset();
  };

  // if(isLoadingTargetQuestion){
  //   return <Spinner/>
  // }

const handleActionChange = (value: string) => {
  setActionType(value as "allocated" | "reroute");
};
  return (
    <div className=" mx-auto px-4 md:px-6 bg-transparent py-4 ">
      <div className="flex flex-col space-y-6">
        <div
          className={`grid grid-cols-1 ${
            questions.length && !isLoadingTargetQuestion && "lg:grid-cols-2"
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
              <div className="flex ">
              <Select value={actionType} onValueChange={handleActionChange} >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select action" />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="allocated">Allocated Questions</SelectItem>
                <SelectItem value="reroute">ReRouted Questions</SelectItem>
              </SelectContent>
            </Select>

              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                className="h-9 px-3 bg-transparent hidden md:block ml-3"
              >
                <RefreshCw className="w-4 h-4" />
                <span className="sr-only">Refresh</span>
              </Button>
              </div>
            </CardHeader>
            {isQuestionsLoading || isLoadingTargetQuestion ? (
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
                    {isLoadingTargetQuestion
                      ? "Retrieving Selected Question"
                      : "Loading Questions"}
                  </h3>

                  <p className="text-sm text-muted-foreground max-w-sm">
                    Please wait while we
                    {isLoadingTargetQuestion
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
                  onValueChange={handleQuestionClick}
                  className="space-y-4"
                >
                  {questions?.map((question) => (
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

                  <div className="flex items-center justify-between w-full">
                    <CardTitle className="text-lg font-semibold">
                      Response
                    </CardTitle>

                    <QuestionDetailsDialog question={selectedQuestionData} />
                  </div>
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
                          {/* <QuestionDetailsDialog
                            question={selectedQuestionData}
                          /> */}
                        </div>

                        <p className="text-sm mt-1 p-3 rounded-md border border-gray-200 dark:border-gray-600 break-words">
                          {selectedQuestionData.text}
                        </p>
                      </div>

                      <div>
                        <div className="flex items-center justify-between">
                          <Label
                            htmlFor="new-answer"
                            className="text-sm font-medium flex items-center gap-1"
                          >
                            {selectedQuestionData.aiInitialAnswer &&
                            newAnswer.trim() ===
                              selectedQuestionData.aiInitialAnswer ? (
                              <>
                                <Bot className="h-4 w-4 text-blue-600" />
                                AI Suggested Answer:
                              </>
                            ) : (
                              "Draft Response:"
                            )}
                          </Label>

                          {selectedQuestionData.aiInitialAnswer &&
                            !newAnswer && (
                              <button
                                onClick={() => {
                                  setNewAnswer(
                                    selectedQuestionData.aiInitialAnswer || ""
                                  );
                                  setRemarks("AI Suggested Answer");
                                }}
                                // The classes below are the ones you provided, slightly adjusted for square shape
                                className="
                                  inline-flex items-center justify-center 
                                  text-blue-500 dark:text-blue-400
                                  bg-transparent
                                  rounded-lg 
                                  p-1
                                  shadow-none
                                  hover:border-blue-300 hover:text-blue-400
                                  hover:shadow-[0_0_10px_rgba(59,130,246,0.5)] dark:hover:shadow-[0_0_10px_rgba(96,165,250,0.5)]
                                  transition-all duration-200 ease-in-out
                                  active:scale-[0.98]
                                  focus:outline-none focus:ring-1 focus:ring-blue-300
                                "
                                aria-label="Apply Suggested AI Answer"
                              >
                                <Bot className="h-5 w-5" />
                              </button>
                            )}
                        </div>
                        <Textarea
                          id="new-answer"
                          placeholder="Enter your answer here..."
                          value={newAnswer}
                          onChange={(e) => setNewAnswer(e.target.value)}
                          className={`mt-1 md:max-h-[240px] max-h-[170px] min-h-[210px] resize-y border text-sm md:text-md rounded-md overflow-y-auto p-3 pb-0 bg-transparent ${
                            newAnswer.trim() ===
                              selectedQuestionData?.aiInitialAnswer &&
                            selectedQuestionData.aiInitialAnswer
                              ? "border-blue-400/70 bg-blue-50 dark:bg-blue-950/30 italic"
                              : "border-gray-200 dark:border-gray-600"
                          }`}
                        />

                        {/* Remarks */}
                        <div className="mt-3">
                          <Label
                            htmlFor="remarks"
                            className="text-sm font-medium"
                          >
                            Remarks
                          </Label>
                          <Textarea
                            id="remarks"
                            placeholder="Enter remarks..."
                            value={remarks}
                            onChange={(e) => setRemarks(e.target.value)}
                            className="mt-1 md:max-h-[190px] max-h-[170px] min-h-[80px] resize-y border border-gray-200 dark:border-gray-600 text-sm md:text-md rounded-md overflow-y-auto p-3 pb-0 bg-transparent"
                          />
                        </div>

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

                          <Button variant="secondary" onClick={handleReset}>
                            <span className="sr-only">Reset answer</span>
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        </div>
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
            questions.length != 0 && actionType=="allocated" &&
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
                remarks={remarks}
                setRemarks={setRemarks}
              />
            )}
            {questions &&
            questions.length != 0 && actionType=="reroute" &&
            selectedQuestionData &&
            
             (
              <ReRouteResponseTimeline
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
                remarks={remarks}
                setRemarks={setRemarks}
                questions={questions}
                selectedQuestion={selectedQuestion}
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
          variant="outline"
          className="flex items-center gap-2 rounded-xl border-primary/30 hover:border-primary hover:bg-primary/5 transition-all"
          aria-label={buttonLabel}
          title={buttonLabel}
        >
          <FileSearch className="h-5 w-5 text-primary" />
          <span className="text-sm font-semibold">View Metadata</span>
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

interface ReviewChecklistProps {
  value: IReviewParmeters;
  onChange: (values: IReviewParmeters) => void;
}

const ReviewChecklist = ({ value, onChange }: ReviewChecklistProps) => {
  const handleToggle = (key: keyof IReviewParmeters) => {
    onChange({
      ...value,
      [key]: !value[key],
    });
  };

  const items = [
    {
      key: "contextRelevance",
      label: "Context & Relevance",
      desc: "Checks whether the response directly addresses the question, stays on topic, and provides contextually appropriate information.",
    },
    {
      key: "technicalAccuracy",
      label: "Technical Accuracy",
      desc: "Ensures the explanation, data, and facts are correct and technically sound without misinformation.",
    },
    {
      key: "practicalUtility",
      label: "Practical Utility",
      desc: "Verifies whether the answer provides actionable, useful, and implementable guidance for real-world scenarios.",
    },
    {
      key: "valueInsight",
      label: "Value Addition / Insight",
      desc: "Evaluates whether the response goes beyond basics by offering insights, examples, or additional meaningful knowledge.",
    },
    {
      key: "credibilityTrust",
      label: "Credibility & Trust",
      desc: "Checks for reliability, neutrality, proper reasoning, and whether the tone conveys trustworthiness and unbiased information.",
    },
    {
      key: "readabilityCommunication",
      label: "Readability & Communication",
      desc: "Ensures the answer is easy to read, well-structured, grammatically clear, and effectively communicates the intended message.",
    },
  ] as const;

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {items.map((item) => (
          <div key={item.key} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger className="cursor-pointer">
                  <Info className="w-4 h-4 text-primary" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs p-3 text-sm">
                  {item.desc}
                </TooltipContent>
              </Tooltip>
              <Label className="text-sm font-medium">{item.label}</Label>
            </div>

            <Switch
              checked={value[item.key]}
              onCheckedChange={() => handleToggle(item.key)}
            />
          </div>
        ))}
      </div>
    </TooltipProvider>
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
    status: "accepted" | "rejected" | "modified",
    parameters: IReviewParmeters,
    currentReviewingAnswer?: string,
    rejectionReason?: string
  ) => void;
  handleReset: () => void;
  SourceUrlManager: React.ComponentType<any>;
  remarks: string;
  setRemarks: (value: string) => void;
}

export const ResponseTimeline = ({
  isSelectedQuestionLoading,
  selectedQuestionData,
  newAnswer,
  setNewAnswer,
  sources,
  setSources,
  // isFinalAnswer,
  isSubmittingAnswer,
  handleSubmit,
  handleReset,
  remarks,
  setRemarks,
}: // SourceUrlManager,
ResponseTimelineProps) => {
  const [rejectionReason, setRejectionReason] = useState("");
  const [isRejectionSubmitted, setIsRejectionSubmitted] = useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [isModifyDialogOpen, setIsModifyDialogOpen] = useState(false);
  // const [urlOpen, setUrlOpen] = useState(false);
  // const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  // const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [isRejecConfirmationOpen, setIsRejecConfirmationOpen] = useState(false);
  // const [isAccepConfirmationOpen, setIsAccepConfirmationOpen] = useState(false);

  const [checklist, setChecklist] = useState<IReviewParmeters>({
    contextRelevance: false,
    technicalAccuracy: false,
    practicalUtility: false,
    valueInsight: false,
    credibilityTrust: false,
    readabilityCommunication: false,
  });

  const questionId = selectedQuestionData.id || "";

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
    if (
      currentReviewingAnswer &&
      currentReviewingAnswer.answer &&
      currentReviewingAnswer.sources
    ) {
      setNewAnswer(currentReviewingAnswer.answer);
      setSources(currentReviewingAnswer.sources);
    }
  }, [currentReviewingAnswer]);

  // const handleCopy = async (url: string, index: number) => {
  //   try {
  //     await navigator.clipboard.writeText(url);
  //     setCopiedIndex(index);
  //     setTimeout(() => setCopiedIndex(null), 1500);
  //   } catch (err) {
  //     console.error("Failed to copy: ", err);
  //   }
  // };

  // const handleRejectOrModify = (type: "reject" | "modify") => {
  //   if (rejectionReason.trim() === "") {
  //     toast.error("No reason provided for rejection");
  //     return;
  //   }
  //   if (rejectionReason.length < 8) {
  //     toast.error("Rejection reason must be atleast 8 letters");
  //     return;
  //   }

  //   if (!currentReviewingAnswer) {
  //     toast.error(
  //       "Unable to locate the current review answer. Please refresh and try again."
  //     );
  //     return;
  //   }

  //   const reviewAnswerId = currentReviewingAnswer._id?.toString();

  //   handleSubmit("rejected", reviewAnswerId, rejectionReason);
  // };

  const handleRejectOrModify = (type: "reject" | "modify") => {
    const actionLabel = type === "reject" ? "rejection" : "modification";

    if (!rejectionReason.trim()) {
      toast.error(`Please provide a reason for the ${actionLabel}.`);
      return;
    }

    if (rejectionReason.trim().length < 8) {
      toast.error(
        `${
          actionLabel.charAt(0).toUpperCase() + actionLabel.slice(1)
        } reason must be at least 8 characters.`
      );
      return;
    }

    if (!currentReviewingAnswer || !currentReviewingAnswer._id) {
      toast.error(
        "Unable to locate the current reviewing answer. Please refresh and try again."
      );
      return;
    }

    const reviewAnswerId = currentReviewingAnswer._id.toString();

    handleSubmit(
      type === "reject" ? "rejected" : "modified",
      checklist,
      reviewAnswerId,
      rejectionReason
    );
  };

  const handleAccept = () => {
    if (!currentReviewingAnswer) {
      toast.error(
        "Unable to locate the current review answer. Please refresh and try again."
      );
      return;
    }

    const reviewAnswerId = currentReviewingAnswer._id?.toString();

    handleSubmit("accepted", checklist, reviewAnswerId);
  };

  // const handleOpenUrl = (url: string) => {
  //   setSelectedUrl(url);
  //   setUrlOpen(true);
  // };

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
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />

            <h3 className="text-lg font-semibold">Response History</h3>
          </div>

          <QuestionDetailsDialog question={selectedQuestionData} />
        </CardHeader>

        <CardContent className="p-6 py-4 flex-1 flex flex-col overflow-hidden">
          <ScrollArea className="flex-1 pe-4">
            <ReviewHistoryTimeline
              history={history}
              isSubmittingAnswer={isSubmittingAnswer}
              rejectionReason={rejectionReason}
              isRejectionSubmitted={isRejectionSubmitted}
              checklist={checklist}
              setChecklist={setChecklist}
              setIsRejectDialogOpen={setIsRejectDialogOpen}
              setIsModifyDialogOpen={setIsModifyDialogOpen}
              handleAccept={handleAccept}
              questionId={questionId}
            />
          </ScrollArea>
        </CardContent>
      </Card>

      <ReviewResponseDialog
        isOpen={isRejectDialogOpen}
        onOpenChange={setIsRejectDialogOpen}
        type="reject"
        title="Reject Response"
        icon={<XCircle className="w-5 h-5 text-red-500 dark:text-red-700" />}
        reasonLabel="Reason for Rejection"
        submitReasonText="Submit Reason"
        checklist={checklist}
        onChecklistChange={setChecklist}
        rejectionReason={rejectionReason}
        setRejectionReason={setRejectionReason}
        isStageSubmitted={isRejectionSubmitted}
        setIsStageSubmitted={setIsRejectionSubmitted}
        newAnswer={newAnswer}
        setNewAnswer={setNewAnswer}
        selectedQuestionData={selectedQuestionData}
        isSubmitting={isSubmittingAnswer}
        handleSubmit={handleRejectOrModify}
        handleReset={handleReset}
        sources={sources}
        setSources={setSources}
        confirmOpen={isRejecConfirmationOpen}
        setConfirmOpen={setIsRejecConfirmationOpen}
        remarks={remarks}
        setRemarks={setRemarks}
      />

      <ReviewResponseDialog
        isOpen={isModifyDialogOpen}
        onOpenChange={setIsModifyDialogOpen}
        title="Modify Response"
        type="modify"
        icon={<Pencil className="w-5 h-5 text-blue-500 dark:text-blue-400" />}
        reasonLabel="Reason for Modification"
        submitReasonText="Proceed"
        checklist={checklist}
        onChecklistChange={setChecklist}
        rejectionReason={rejectionReason}
        setRejectionReason={setRejectionReason}
        isStageSubmitted={isRejectionSubmitted}
        setIsStageSubmitted={setIsRejectionSubmitted}
        newAnswer={newAnswer}
        setNewAnswer={setNewAnswer}
        selectedQuestionData={selectedQuestionData}
        isSubmitting={isSubmittingAnswer}
        handleSubmit={handleRejectOrModify}
        handleReset={handleReset}
        sources={sources}
        setSources={setSources}
        confirmOpen={isRejecConfirmationOpen}
        setConfirmOpen={setIsRejecConfirmationOpen}
        remarks={remarks}
        setRemarks={setRemarks}
      />
    </div>
  );
};
interface ReRouteResponseTimelineProps {
  isSelectedQuestionLoading: boolean;
  selectedQuestionData: IQuestion;
  newAnswer: string;
  setNewAnswer: (value: string) => void;
  sources: SourceItem[];
  setSources: (sources: any[]) => void;
  isFinalAnswer: boolean;
  isSubmittingAnswer: boolean;
  handleSubmit: (
    status: "accepted" | "rejected" | "modified",
    parameters: IReviewParmeters,
    currentReviewingAnswer?: string,
    rejectionReason?: string
  ) => void;
  handleReset: () => void;
  SourceUrlManager: React.ComponentType<any>;
  remarks: string;
  setRemarks: (value: string) => void;
  questions:any
  selectedQuestion:string
}

export const ReRouteResponseTimeline = ({
  isSelectedQuestionLoading,
  selectedQuestionData,
  newAnswer,
  setNewAnswer,
  sources,
  setSources,
  // isFinalAnswer,
  isSubmittingAnswer,
  handleSubmit,
  handleReset,
  remarks,
  setRemarks,
  questions,
  selectedQuestion
}: // SourceUrlManager,
ReRouteResponseTimelineProps) => {
  console.log("the questions coming===",questions,selectedQuestionData,selectedQuestion)
  const [rejectionReason, setRejectionReason] = useState("");
  const [isRejectionSubmitted, setIsRejectionSubmitted] = useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [isModifyDialogOpen, setIsModifyDialogOpen] = useState(false);
  // const [urlOpen, setUrlOpen] = useState(false);
  // const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  // const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [isRejecConfirmationOpen, setIsRejecConfirmationOpen] = useState(false);
  // const [isAccepConfirmationOpen, setIsAccepConfirmationOpen] = useState(false);

  const [checklist, setChecklist] = useState<IReviewParmeters>({
    contextRelevance: false,
    technicalAccuracy: false,
    practicalUtility: false,
    valueInsight: false,
    credibilityTrust: false,
    readabilityCommunication: false,
  });

  const questionId = selectedQuestionData.id || "";

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
    if (
      currentReviewingAnswer &&
      currentReviewingAnswer.answer &&
      currentReviewingAnswer.sources
    ) {
      setNewAnswer(currentReviewingAnswer.answer);
      setSources(currentReviewingAnswer.sources);
    }
  }, [currentReviewingAnswer]);

  // const handleCopy = async (url: string, index: number) => {

  

 
  

  // const handleOpenUrl = (url: string) => {
  //   setSelectedUrl(url);
  //   setUrlOpen(true);
  // };
  const [editedAnswer, setEditedAnswer] = useState(newAnswer);
  const handleSubmitAnswer = async(answer: string) => {
    console.log("Final Answer:", answer);
    const payload = {
      questionId: selectedQuestion,
      
    } as IReviewAnswerPayload;
    payload.answer = answer;
    payload.sources = sources;
    payload.type="re-roted"
    
    try {
      await respondQuestion(payload);
     toast.success("Your response has been submitted. Thank you!");
    } catch (error) {
      console.error("Failed to submit:", error);
    }
  
    // call API / mutation here
    // submitAnswerMutation.mutate(answer);
  };
  const { mutateAsync: respondQuestion, isPending: isResponding } =
  useReviewAnswer();
  

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
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />

            <h3 className="text-lg font-semibold">Response History</h3>
          </div>

          <QuestionDetailsDialog question={selectedQuestionData} />
        </CardHeader>

        <CardContent className="p-6 py-4 flex-1 flex flex-col overflow-hidden">
          <ScrollArea className="flex-1 pe-4">
          <div className="flex flex-col w-full">
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <Label className="text-sm font-medium text-muted-foreground">
                            Current Query:
                          </Label>
                          {/* <QuestionDetailsDialog
                            question={selectedQuestionData}
                          /> */}
                        </div>

                        <p className="text-sm mt-1 p-3 rounded-md border border-gray-200 dark:border-gray-600 break-words mb-3">
                          {selectedQuestionData.text}
                        </p>
                      </div>
                       <div className="flex flex-col w-full">
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <Label className="text-sm font-medium text-muted-foreground">
                            Re Routed By:
                          </Label>
                          {/* <QuestionDetailsDialog
                            question={selectedQuestionData}
                          /> */}
                        </div>

                        <p className="text-sm mt-1 p-3 rounded-md border border-gray-200 dark:border-gray-600 break-words mb-3">
                          {selectedQuestionData.history[0].moderator.firstName}{`(${selectedQuestionData.history[0].moderator.email})`}
                        </p>
                      </div>
                      <div className="flex flex-col w-full">
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <Label className="text-sm font-medium text-muted-foreground">
                            Comments From Moderator:
                          </Label>
                          {/* <QuestionDetailsDialog
                            question={selectedQuestionData}
                          /> */}
                        </div>

                        <p className="text-sm mt-1 p-3 rounded-md border border-gray-200 dark:border-gray-600 break-words mb-3">
                          {selectedQuestionData.history[0].reroute.comment}
                        </p>
                      </div>
                      <div>
                    <p className="text-sm font-medium text-foreground mb-3">
                      Answer Content
                    </p>
                    <div className="rounded-lg border bg-muted/30 h-[30vh] mb-3 ">
                      <ScrollArea className="h-full">
                        <div className="p-4">
                          <p className=" text-foreground">
                            {newAnswer}
                          </p>
                        </div>
                      </ScrollArea>
                    </div>
                  </div>
                     
                      
                      {selectedQuestionData.history[0].answer.sources?.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-foreground mb-3">
                        Source URLs
                      </p>

                      <div className="space-y-2">
                        {selectedQuestionData.history[0].answer.sources.map((source, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between rounded-lg border bg-muted/30 p-2 pr-3"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span
                                    className="text-sm truncate max-w-[260px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                                    onClick={() =>
                                      window.open(source.source, "_blank")
                                    }
                                  >
                                    {source.source}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>{source.source}</TooltipContent>
                              </Tooltip>

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
                            </div>
                            <a
                              href={source.source}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 rounded hover:bg-muted/20 dark:hover:bg-muted/50 transition-colors"
                            >
                              <ArrowUpRight className="w-4 h-4 text-foreground/80" />
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}


                     <div className="mt-10">
                     <Button
                          size="sm"
                          disabled={isSubmittingAnswer}
                          className="gap-1 h-8 px-3 text-xs bg-green-600 dark:bg-green-900 text-white hover:bg-green-600"
                          onClick={() => {setIsModifyDialogOpen(true);
                            setEditedAnswer(newAnswer)}}
                        >
                          {isSubmittingAnswer &&
                          rejectionReason &&
                          isRejectionSubmitted ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Creating...
                            </>
                          ) : (
                            <>
                              <Pencil className="w-3 h-3" />
                              Create Answer
                            </>
                          )}
                        </Button>
                       <Button
                          size="sm"
                          disabled={isSubmittingAnswer}
                          onClick={() => setIsRejectDialogOpen(true)}
                          variant="destructive"
                          className="gap-1 h-8 px-3 text-xs ml-10"
                        >
                          {isSubmittingAnswer &&
                          rejectionReason &&
                          isRejectionSubmitted ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Rejecting...
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3 h-3" />
                              Reject
                            </>
                          )}
                        </Button>


                       
                     </div>
                   


          </ScrollArea>
        </CardContent>
      </Card>
      <Dialog open={isModifyDialogOpen} onOpenChange={setIsModifyDialogOpen}>
  <DialogContent className="max-w-lg">
    <DialogHeader>
      <DialogTitle>Create Answer</DialogTitle>
    </DialogHeader>

    {/* Editable Answer */}
    <Textarea
      value={editedAnswer}
      onChange={(e) => setEditedAnswer(e.target.value)}
      rows={6}
      className="mt-2"
      placeholder="Write your answer..."
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
     

    <DialogFooter className="mt-4 gap-2">
      {/* Cancel */}
      <Button
        variant="outline"
        onClick={() => setIsModifyDialogOpen(false)}
      >
        Cancel
      </Button>

      {/* Submit */}
      <Button
        disabled={!editedAnswer.trim() || isSubmittingAnswer}
        onClick={() => {
          handleSubmitAnswer(editedAnswer);
          setIsModifyDialogOpen(false);
        }}
      >
        {isSubmittingAnswer ? "Submitting..." : "Submit"}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>


      
     
    </div>
  );
};

interface ReviewHistoryTimelineProps {
  history: HistoryItem[];
  isSubmittingAnswer: boolean;
  rejectionReason: string;
  isRejectionSubmitted: boolean;
  checklist: any;
  setChecklist: (checklist: any) => void;
  setIsRejectDialogOpen: (open: boolean) => void;
  setIsModifyDialogOpen: (open: boolean) => void;
  handleAccept: () => void;
  questionId: string;
}
export const parameterLabels: Record<keyof IReviewParmeters, string> = {
  contextRelevance: "Context Relevance",
  technicalAccuracy: "Technical Accuracy",
  practicalUtility: "Practical Utility",
  valueInsight: "Value Insight",
  credibilityTrust: "Credibility & Trust",
  readabilityCommunication: "Readability",
};
export const ReviewHistoryTimeline = ({
  history,
  isSubmittingAnswer,
  rejectionReason,
  isRejectionSubmitted,
  checklist,
  setChecklist,
  setIsRejectDialogOpen,
  setIsModifyDialogOpen,
  handleAccept,
  questionId,
}: ReviewHistoryTimelineProps) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopy = async (url: string, index: number) => {
    await navigator.clipboard.writeText(url);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const getStatusBadgeClasses = (item: Partial<HistoryItem>) => {
    if (
      (item.status === "in-review" || item.status === "reviewed") &&
      item.answer
    ) {
      return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300 border-yellow-700";
    }
    if (item.status === "approved") {
      return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 border-green-700";
    }
    if (item.status === "rejected") {
      return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-red-700";
    }
    return "bg-primary/10 text-primary hover:bg-primary/10 border-primary";
  };

  const getStatusIcon = (item: HistoryItem) => {
    if (
      (item.status === "in-review" || item.status === "reviewed") &&
      item.answer
    ) {
      return <Target className="w-5 h-5 text-blue-600 dark:text-blue-400" />;
    }
    if (item.approvedAnswer) {
      return (
        <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
      );
    }
    if (item.rejectedAnswer) {
      return <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />;
    }
    if (item.modifiedAnswer) {
      return (
        <Pencil className="w-5 h-5 text-orange-600 dark:text-orange-400" />
      );
    }

    if (!item.answer) {
      return <Clock className="w-5 h-5 text-primary" />;
    }
    if (item.status === "approved") {
      return (
        <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
      );
    }
    if (item.status === "rejected") {
      return <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />;
    }
    return <Clock className="w-5 h-5 text-primary" />;
  };

  const getStatusText = (item: HistoryItem) => {
    if (
      (item.status === "in-review" || item.status === "reviewed") &&
      item.answer
    ) {
      return "Answer Created";
    }
    return item.status
      ? item.status.charAt(0).toUpperCase() + item.status.slice(1)
      : "";
  };

  return (
    <div className="space-y-6">
      {history.map((item, index) => {
        const isFirst = index === 0;
        const isLast = index == history.length - 1;
        const isMine = item.status === "in-review" && !item.answer;
        const modification = item.review?.answer?.modifications?.find(
          (mod) => mod.modifiedBy === item.updatedBy._id
        );
        return (
          <div key={item.updatedBy._id + index} className="relative">
            {!isFirst && (
              <div className="absolute left-5 -top-1 bottom-0 h-6 w-0.5 bg-border/50 -translate-y-5" />
            )}

            <Card className="p-3 py-6 hover:shadow-md transition-shadow duration-200 border border-border/50">
              <div className="flex gap-3">
                <div
                  className={`relative -top-1 flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all`}
                >
                  {getStatusIcon(item)}
                </div>

                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center justify-between gap-2 mb-4">
                    <div className="flex items-center gap-2 min-w-0 text-sm">
                      {/* USER ICON */}
                      <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />

                      {/* NAME (TRUNCATE) */}
                      <span className="font-medium truncate max-w-[120px]">
                        {item.updatedBy.userName}
                      </span>

                      {/* DATE */}
                      <span className="text-xs text-muted-foreground flex-shrink-0 ml-auto">
                        {formatDate(item.createdAt)}
                      </span>

                      {/* AUTHOR BADGE */}
                      {/* {isLast && (
                        <span className="px-2 py-0.5 text-[10px] rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-100 font-semibold flex-shrink-0">
                          Author
                        </span>
                      )} */}
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {item.status === "approved" && item.answer && (
                        <Badge
                          variant="secondary"
                          className="gap-0.5 text-xs py-0.5"
                        >
                          <CheckCheck className="w-3 h-3" />
                          <span>{item.answer.approvalCount || "0"}</span>
                        </Badge>
                      )}
                      {/* {item.status && (
                        <Badge
                          className={`${getStatusBadgeClasses(
                            item
                          )} text-xs font-medium py-0.5`}
                        >
                          {getStatusText(item)}
                        </Badge>
                      )} */}
                      {item.status && (
                        <div className="flex items-center gap-2">
                          <Badge
                            className={`${getStatusBadgeClasses(
                              item
                            )} text-xs font-medium py-0.5`}
                          >
                            {getStatusText(item)}
                          </Badge>
                          {getStatusText(item) === "Answer Created" && (
                            <Badge
                              className={`
                                        ${getStatusBadgeClasses({
                                          status: "reviewed",
                                        })}
                                        `}
                            >
                              Reviewed
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {(item.review?.parameters || item.review?.reason) && (
                    <div className="mt-10">
                      {/* REVIEW PARAMETERS */}
                      {item.review?.parameters &&
                        item.review?.action !== "accepted" && (
                          <div className="flex flex-wrap gap-2 mt-1 mb-3">
                            <div className="flex flex-wrap gap-2">
                              {Object.entries(item.review.parameters ?? {})
                                .filter(([_, value]) => value === false)
                                .map(([key]) => (
                                  <Badge
                                    key={key}
                                    variant="outline"
                                    className="flex items-center gap-1.5 px-3 py-1 text-xs rounded-full border 
                                      bg-red-100 text-red-800 border-red-300
                                      dark:bg-red-900/30 dark:text-red-300 dark:border-red-700"
                                  >
                                    <X className="w-3 h-3" />

                                    {
                                      parameterLabels[
                                        key as keyof typeof parameterLabels
                                      ]
                                    }
                                  </Badge>
                                ))}
                            </div>
                          </div>
                        )}

                      {/* REVIEW NOTE (MODIFY / REJECT) */}
                      {item.review?.reason && (
                        <div className="p-3 rounded-md bg-muted/30 border border-border/50 text-sm mt-2">
                          <span className="dark:text-gray-200">
                            {item.review.action === "modified"
                              ? "Modification Note: "
                              : "Rejection Note: "}
                          </span>

                          <p className="text-foreground">
                            {/* {item.review.reason} */}
                            <ExpandableText
                              text={item.review.reason}
                              maxLength={0}
                            />
                          </p>
                        </div>
                      )}

                      {item.review?.action === "modified" && modification && (
                        <div className="mt-3">
                          <Accordion
                            type="single"
                            collapsible
                            className="w-full"
                          >
                            <AccordionItem
                              value={`mod-details-${item.review._id}`}
                            >
                              <AccordionTrigger className="text-sm font-medium">
                                View Modification Details
                              </AccordionTrigger>

                              <AccordionContent>
                                {renderModificationDiff(modification)}
                              </AccordionContent>
                            </AccordionItem>
                          </Accordion>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {item.approvedAnswer && (
                      <span className="text-sm px-2 py-2 w-full rounded border bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 ">
                        Answer Accepted
                      </span>
                    )}
                    {item.modifiedAnswer && (
                      <span
                        className="
                          text-sm px-2 py-2 w-full rounded border
                          bg-orange-100 dark:bg-orange-900/30
                          border-orange-300 dark:border-orange-700
                          text-orange-700 dark:text-orange-400
                        "
                      >
                        Answer Modified
                      </span>
                    )}

                    {item.status === "in-review" && !item.answer && (
                      <span className="text-sm px-2 py-4 w-full rounded border bg-muted/40 text-muted-foreground font-medium flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Awaiting response
                      </span>
                    )}
                  </div>

                  {item.answer && (
                    <div className="space-y-2 pt-1">
                      {item.answer && (
                        <div className="space-y-2 pt-1">
                          {/* ANSWER BOX */}
                          <div className="space-y-1 ">
                            {/* LABEL */}
                            <Label className="text-sm font-medium text-muted-foreground px-1 dark:text-gray-200">
                              {item.status == "reviewed" && "New "} Answer:{" "}
                              {item.rejectedAnswer}
                            </Label>

                            {/* ANSWER BOX */}
                            <div className="p-5 rounded-md border bg-card/50 text-sm relative">
                              <ExpandableText
                                text={item.answer.answer}
                                maxLength={350}
                              />

                              {(item.answer.sources?.length > 0 ||
                                item.reasonForRejection) && (
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <button className="absolute bottom-2 right-2 text-xs px-2 py-1 border rounded-md hover:bg-muted/50 flex items-center gap-1">
                                      <Info className="w-3 h-3" />
                                      View Details
                                    </button>
                                  </DialogTrigger>

                                  <DialogContent className="max-w-md min-h-[25vh] max-h-[80vh] overflow-y-auto">
                                    <DialogHeader>
                                      <DialogTitle className="text-lg font-semibold">
                                        Answer Details
                                      </DialogTitle>
                                    </DialogHeader>

                                    <div className="space-y-5 text-sm">
                                      {/* SOURCES */}
                                      {item.answer.sources?.length > 0 && (
                                        <div className="space-y-2">
                                          <p className="text-sm font-semibold text-muted-foreground">
                                            Sources (
                                            {item.answer.sources.length})
                                          </p>

                                          <div className="space-y-2">
                                            {item.answer.sources.map(
                                              (source: any, idx: number) => (
                                                <div
                                                  key={idx}
                                                  className="flex items-center justify-between gap-2 p-3 border rounded-md hover:bg-muted/40 transition-colors text-sm"
                                                >
                                                  <a
                                                    href={source.source}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-blue-600 dark:text-blue-400 break-all inline-flex items-center gap-1 hover:underline text-sm"
                                                  >
                                                    <span className="line-clamp-2">
                                                      {source.source}
                                                    </span>

                                                    {source.page && (
                                                      <>
                                                        <span className="text-muted-foreground flex-shrink-0">
                                                          •
                                                        </span>
                                                        <span className="text-muted-foreground flex-shrink-0">
                                                          p{source.page}
                                                        </span>
                                                      </>
                                                    )}
                                                  </a>

                                                  <button
                                                    onClick={() =>
                                                      handleCopy(
                                                        source.source,
                                                        idx
                                                      )
                                                    }
                                                    className="text-muted-foreground hover:text-foreground transition-colors p-1 flex-shrink-0"
                                                    title="Copy URL"
                                                  >
                                                    {copiedIndex === idx ? (
                                                      <Check className="w-4 h-4 text-green-500" />
                                                    ) : (
                                                      <Copy className="w-4 h-4" />
                                                    )}
                                                  </button>
                                                </div>
                                              )
                                            )}
                                          </div>
                                        </div>
                                      )}

                                      {item.answer.remarks && (
                                        <div className="p-3 rounded-md bg-muted/20 border text-sm">
                                          <p className="text-sm font-semibold text-muted-foreground mb-1">
                                            Remarks:
                                          </p>

                                          <div className="text-foreground text-sm">
                                            <ExpandableText
                                              text={item.answer.remarks}
                                              maxLength={220}
                                            />
                                          </div>
                                        </div>
                                      )}

                                      {/* REJECTION REASON */}
                                      {item.status === "rejected" &&
                                        item.reasonForRejection && (
                                          <div className="p-3 rounded-md bg-red-50 dark:bg-red-900/20 border text-sm">
                                            <p className="text-sm font-semibold text-red-700 dark:text-red-400 mb-1">
                                              Rejection Reason:
                                            </p>

                                            <div className="text-red-600 dark:text-red-300 text-sm">
                                              <ExpandableText
                                                text={item.reasonForRejection}
                                                maxLength={120}
                                              />
                                            </div>
                                          </div>
                                        )}
                                    </div>
                                  </DialogContent>
                                </Dialog>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {item.answer && (
                        <div className="pb-6">
                          <Separator className="my-2" />
                          <CommentsSection
                            questionId={questionId}
                            answerId={item.answer._id.toString()}
                            isMine={isMine}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {!item.answer &&
                    !item.approvedAnswer &&
                    !item.rejectedAnswer &&
                    item.status === "in-review" && (
                      <div className="flex items-center gap-1.5 pt-1 flex-wrap">
                        <AcceptReviewDialog
                          checklist={checklist}
                          onChecklistChange={setChecklist}
                          isSubmitting={isSubmittingAnswer}
                          onConfirm={handleAccept}
                        />

                        <Button
                          size="sm"
                          disabled={isSubmittingAnswer}
                          onClick={() => setIsRejectDialogOpen(true)}
                          variant="destructive"
                          className="gap-1 h-8 px-3 text-xs"
                        >
                          {isSubmittingAnswer &&
                          rejectionReason &&
                          isRejectionSubmitted ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Rejecting...
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3 h-3" />
                              Reject
                            </>
                          )}
                        </Button>

                        <Button
                          size="sm"
                          disabled={isSubmittingAnswer}
                          className="gap-1 h-8 px-3 text-xs bg-blue-600 dark:bg-blue-900 text-white hover:bg-blue-600"
                          onClick={() => setIsModifyDialogOpen(true)}
                        >
                          {isSubmittingAnswer &&
                          rejectionReason &&
                          isRejectionSubmitted ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Modifying...
                            </>
                          ) : (
                            <>
                              <Pencil className="w-3 h-3" />
                              Modify
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                </div>
              </div>
            </Card>
          </div>
        );
      })}
    </div>
  );
};

interface ReviewResponseDialogProps {
  isOpen: boolean;
  onOpenChange: (value: boolean) => void;
  type: "reject" | "modify";
  title: string;
  icon?: React.ReactNode;
  reasonLabel?: string;
  submitReasonText?: string;
  checklist: IReviewParmeters;
  onChecklistChange: (value: IReviewParmeters) => void;
  rejectionReason: string;
  setRejectionReason: (val: string) => void;
  isStageSubmitted: boolean;
  setIsStageSubmitted: (val: boolean) => void;
  newAnswer: string;
  setNewAnswer: (val: string) => void;
  selectedQuestionData: any;
  isSubmitting: boolean;
  handleSubmit: (type: "reject" | "modify") => void;
  handleReset: () => void;
  isFinalAnswer?: boolean;
  sources: SourceItem[];
  setSources: (value: SourceItem[]) => void;
  confirmOpen: boolean;
  setConfirmOpen: (value: boolean) => void;
  remarks: string;
  setRemarks: (value: string) => void;
}

const ReviewResponseDialog = (props: ReviewResponseDialogProps) => {
  const {
    isOpen,
    onOpenChange,
    type,
    title,
    icon,
    reasonLabel = "Reason",
    submitReasonText = "Continue",
    checklist,
    onChecklistChange,
    rejectionReason,
    setRejectionReason,
    isStageSubmitted,
    setIsStageSubmitted,
    newAnswer,
    setNewAnswer,
    selectedQuestionData,
    isSubmitting,
    handleSubmit,
    handleReset,
    isFinalAnswer,
    sources,
    setSources,
    confirmOpen,
    setConfirmOpen,
    remarks,
    setRemarks,
  } = props;
  const [tempRejectAnswer, setTempRejectAnswer] = useState("");
  const [tempSources, setTempSources] = useState<SourceItem[]>([]);
  const [suggestion, setSuggestion] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen)
      if (type === "modify") {
        setTempRejectAnswer(newAnswer);
        setTempSources(sources);
        onChecklistChange({
          ...checklist,
          valueInsight: true,
        });
      } else {
        onChecklistChange({
          contextRelevance: false,
          credibilityTrust: false,
          practicalUtility: false,
          readabilityCommunication: false,
          technicalAccuracy: false,
          valueInsight: false,
        });
        setTempRejectAnswer("");
        setTempSources([]);
      }
  }, [isOpen, type]);

  useEffect(() => {
    const msg = getReviewSuggestion(checklist);
    setSuggestion(msg);
  }, [checklist]);

  const getReviewSuggestion = (checklist: IReviewParmeters) => {
    const {
      contextRelevance,
      credibilityTrust,
      practicalUtility,
      readabilityCommunication,
      technicalAccuracy,
      valueInsight,
    } = checklist;

    const disabledCount = [
      contextRelevance,
      credibilityTrust,
      practicalUtility,
      readabilityCommunication,
      technicalAccuracy,
    ].filter((v) => !v).length;

    if (!valueInsight && type === "modify") {
      return "To proceed with modifications, please enable Value & Insight.";
    }

    if (valueInsight && type === "reject") {
      return "To reject this answer, please disable Value & Insight.";
    }

    if (disabledCount <= 0) {
      return "All review parameters look good. You can safely accept this answer.";
    }

    return null;
  };

  const handleResetParameters = () => {
    onChecklistChange({
      contextRelevance: false,
      credibilityTrust: false,
      practicalUtility: false,
      readabilityCommunication: false,
      technicalAccuracy: false,
      valueInsight: type == "modify" ? true : false,
    });
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(state) => {
        onOpenChange(state);
        if (!state) {
          setRejectionReason("");
          setIsStageSubmitted(false);
        }
      }}
    >
      <DialogContent
        className="max-w-4xl min-h-[70vh] max-h-[90vh] overflow-y-auto"
        style={{ minWidth: "100vh" }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="p-2 rounded-lg">{icon}</div>
            {title}
          </DialogTitle>
        </DialogHeader>

        {/* ------- STEP 1 ------- */}
        {!isStageSubmitted && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Checklist */}
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  Review Parameters
                </h2>

                <Button
                  variant="outline"
                  onClick={handleResetParameters}
                  disabled={isSubmitting}
                  className="flex items-center gap-1"
                >
                  <RotateCcw className="h-4 w-4" />
                  Reset
                </Button>
              </div>

              <div className="p-4 rounded-xl border bg-card shadow-sm">
                <ReviewChecklist
                  value={checklist}
                  onChange={onChecklistChange}
                />
              </div>

              {/* Reason Box */}
              <div className="space-y-2">
                <Label htmlFor="reason" className="text-base font-semibold">
                  {reasonLabel} *
                </Label>

                <Textarea
                  id="reason"
                  placeholder={
                    type === "modify"
                      ? "Describe the reason to proceed with modification…"
                      : "Please explain why this response should be rejected…"
                  }
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="min-h-[20vh] max-h-[55vh] w-full border bg-card p-4 rounded-xl"
                />
              </div>
            </div>
            {suggestion && (
              <div className="mt-2 p-3 rounded-md bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 text-sm border border-yellow-300 dark:border-yellow-700">
                {suggestion}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  onOpenChange(false);
                  setRejectionReason("");
                  setIsStageSubmitted(false);
                }}
              >
                Cancel
              </Button>

              <Button
                variant={type === "modify" ? "default" : "destructive"}
                onClick={() => setIsStageSubmitted(true)}
                disabled={!rejectionReason.trim() || !!suggestion}
                className="group flex items-center justify-center gap-2 transition-all duration-200 hover:opacity-90 hover:scale-[1.02]"
              >
                {submitReasonText}
                <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
              </Button>
            </div>
          </div>
        )}

        {isStageSubmitted && rejectionReason && (
          <div className="h-fit flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-8 duration-400">
            <Card className="border flex-1 flex flex-col">
              <CardContent className="p-6 space-y-4 flex-1 overflow-y-auto">
                {/* Title */}
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-semibold">
                    Submit {type == "modify" ? "Updated " : "New "}
                    Response
                  </h3>
                </div>

                <div className="flex flex-col">
                  <Label className="text-sm text-muted-foreground mb-1">
                    Current Query:
                  </Label>
                  <p className="text-sm p-3 rounded-md border bg-muted/50">
                    {selectedQuestionData.text}
                  </p>
                </div>

                {/* <div>
                  <Label htmlFor="new-answer" className="text-sm font-medium">
                    {type == "modify" && "Draft"} Response *
                  </Label>
                  <Textarea
                    id="new-answer"
                    placeholder="Enter your Response..."
                    value={tempRejectAnswer}
                    onChange={(e) => {
                      setTempRejectAnswer(e.target.value);
                      setNewAnswer(e.target.value);
                    }}
                    className="mt-1 min-h-[100px] p-3 rounded-md"
                  />
                  <div className="border rounded-xl p-6 shadow-sm mt-3 bg-muted/20">
                    <SourceUrlManager
                      sources={tempSources}
                      onSourcesChange={(updated) => {
                        setTempSources(updated);
                        setSources(updated);
                      }}
                    />
                  </div>

                  {isFinalAnswer && (
                    <p className="mt-2 flex items-center gap-2 text-green-600 text-sm font-medium">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Final answer selected!
                    </p>
                  )}
                </div> */}

                <div>
                  <Label htmlFor="new-answer" className="text-sm font-medium">
                    {type == "modify" && "Draft"} Response *
                  </Label>

                  <Textarea
                    id="new-answer"
                    placeholder="Enter your Response..."
                    value={tempRejectAnswer}
                    onChange={(e) => {
                      setTempRejectAnswer(e.target.value);
                      setNewAnswer(e.target.value);
                    }}
                    className="mt-1 min-h-[100px] p-3 rounded-md"
                  />

                  {type == "reject" && (
                    <div className="mt-3">
                      <Label htmlFor="remarks" className="text-sm font-medium">
                        Remarks
                      </Label>
                      <Textarea
                        id="remarks"
                        placeholder="Enter remarks..."
                        value={remarks}
                        onChange={(e) => setRemarks(e.target.value)}
                        className="mt-1 md:max-h-[190px] max-h-[170px] min-h-[80px] resize-y border border-gray-200 dark:border-gray-600 text-sm md:text-md rounded-md overflow-y-auto p-3 pb-0 bg-transparent"
                      />
                    </div>
                  )}

                  {/* Sources */}
                  <div className="border rounded-xl p-6 shadow-sm mt-3 bg-muted/20">
                    <SourceUrlManager
                      sources={tempSources}
                      onSourcesChange={(updated) => {
                        setTempSources(updated);
                        setSources(updated);
                      }}
                    />
                  </div>

                  {isFinalAnswer && (
                    <p className="mt-2 flex items-center gap-2 text-green-600 text-sm font-medium">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Final answer selected!
                    </p>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-4">
                  <div className="flex items-center space-x-3">
                    <ConfirmationModal
                      title={`Confirm ${
                        type == "modify" ? "Modification" : "Rejection"
                      }`}
                      description="Please review your answer carefully before proceeding. The submitted response will be evaluated by the next reviewer in the workflow."
                      confirmText="Submit"
                      cancelText="Cancel"
                      isLoading={isSubmitting}
                      open={confirmOpen}
                      onOpenChange={setConfirmOpen}
                      onConfirm={() => handleSubmit(type)}
                      trigger={
                        <Button
                          disabled={!newAnswer.trim() || isSubmitting}
                          className="flex items-center gap-2"
                        >
                          {isSubmitting ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Submitting…
                            </>
                          ) : (
                            <>
                              <Send className="w-4 h-4" />
                              Submit
                            </>
                          )}
                        </Button>
                      }
                    />

                    <Button variant="secondary" onClick={handleReset}>
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  </div>

                  <Button
                    variant="ghost"
                    onClick={() => setIsStageSubmitted(false)}
                    disabled={!isStageSubmitted}
                    className="flex items-center gap-2 text-muted-foreground"
                  >
                    <Pencil className="w-4 h-4" />
                    Edit Reason
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

const AcceptReviewDialog = ({
  checklist,
  onChecklistChange,
  isSubmitting,
  onConfirm,
}: {
  checklist: IReviewParmeters;
  onChecklistChange: (value: IReviewParmeters) => void;
  isSubmitting: boolean;
  onConfirm: () => void;
}) => {
  const [open, setOpen] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);

  useEffect(() => {
    const msg = getReviewSuggestion(checklist);
    setSuggestion(msg);
  }, [checklist]);

  const handleConfirm = () => {
    // const suggestion = getReviewSuggestion(checklist);

    // if (suggestion) {
    //   toast.warning(suggestion);
    //   return; // Prevent accept
    // }

    onConfirm();
    setOpen(false);
  };

  useEffect(() => {
    onChecklistChange({
      contextRelevance: true,
      credibilityTrust: true,
      practicalUtility: true,
      readabilityCommunication: true,
      technicalAccuracy: true,
      valueInsight: true,
    });
  }, []);

  const handleReset = () => {
    const defaultChecklist: IReviewParmeters = {
      contextRelevance: true,
      credibilityTrust: true,
      practicalUtility: true,
      readabilityCommunication: true,
      technicalAccuracy: true,
      valueInsight: true,
    };

    onChecklistChange(defaultChecklist);
    setSuggestion(null);
  };

  const getReviewSuggestion = (checklist: IReviewParmeters) => {
    const {
      contextRelevance,
      credibilityTrust,
      practicalUtility,
      readabilityCommunication,
      technicalAccuracy,
      valueInsight,
    } = checklist;

    // Count disabled parameters except valueInsight
    const disabledCount = [
      contextRelevance,
      credibilityTrust,
      practicalUtility,
      readabilityCommunication,
      technicalAccuracy,
      valueInsight,
    ].filter((v) => !v).length;

    if (!disabledCount) return null;
    // if (valueInsight) {
    //   return "Consider modifying the answer instead accepting it.";
    // }

    if (disabledCount >= 1 && disabledCount <= 3) {
      return "Some criteria are unmet. Please modify/reject the answer instead accepting.";
    }

    if (disabledCount >= 3) {
      return "Multiple criteria are unmet. Consider rejecting the answer.";
    }

    return null;
  };

  return (
    <>
      <Button
        disabled={isSubmitting}
        size="sm"
        className="flex items-center gap-1 
             bg-green-500  text-white
             dark:bg-green-900 hover:bg-green-500"
        onClick={() => setOpen(true)}
      >
        {isSubmitting ? (
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">
              Confirm Acceptance
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Please verify all review parameters before accepting this
              response. This action cannot be undone.
            </p>
          </DialogHeader>

          <div className="mt-4 p-4 rounded-lg border bg-card space-y-4">
            <ReviewChecklist value={checklist} onChange={onChecklistChange} />
          </div>
          {suggestion && (
            <div className="mt-2 p-3 rounded-md bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 text-sm border border-yellow-300 dark:border-yellow-700">
              {suggestion}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={isSubmitting}
              className="flex items-center gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>

            <Button
              onClick={handleConfirm}
              disabled={isSubmitting || !!suggestion}
              className="flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Accepting...
                </>
              ) : (
                "Confirm Accept"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
