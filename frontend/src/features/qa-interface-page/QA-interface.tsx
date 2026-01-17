"use client";
import { useEffect, useMemo, useRef, useState,  } from "react";
import {CheckCircle,RefreshCw,RotateCcw,Info,Loader2,Send,FileText,Bot} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/atoms/card";
import { RadioGroup, RadioGroupItem } from "../../components/atoms/radio-group";
import { Label } from "../../components/atoms/label";
import { Textarea } from "../../components/atoms/textarea";
import { Button } from "../../components/atoms/button";
import {
  useGetAllocatedQuestionPage,
  useGetAllocatedQuestions,
} from "@/hooks/api/question/useGetAllocatedQuestions";
import { useGetQuestionById } from "@/hooks/api/question/useGetQuestionById";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../components/atoms/tooltip";
import { SourceUrlManager } from "../../components/source-url-manager";
import {
  type AdvanceFilterValues,
  type QuestionDateRangeFilter,
  type QuestionFilterStatus,
  type QuestionPriorityFilter,
  type QuestionSourceFilter,
} from "../../components/advanced-question-filter";
import type {} from "../../components/questions-page";
import type {
  HistoryItem,
  IQuestion,
  IReviewParmeters,
  SourceItem,
  QuestionRerouteRepo
} from "@/types";

import { ConfirmationModal } from "../../components/confirmation-modal";
import {
  useReviewAnswer,
  type IReviewAnswerPayload,
} from "@/hooks/api/answer/useReviewAnswer";

import { QuestionDetailsDialog } from "./QuestionDetailsDialog";

import { ResponseTimeline } from "./ResponseTimeline";
import { ReRouteResponseTimeline } from "./ReRouteResponseTimeline";
import { AnswerCreateDialog } from "./AnswerCreateDialog";
import { QaHeader } from "./QaHeader";

export type QuestionFilter =
  | "newest"
  | "oldest"
  | "leastResponses"
  | "mostResponses";
export const QAInterface = ({
  autoSelectQuestionId,
  onManualSelect,
  selectQuestionType
}: {
  autoSelectQuestionId: string | null;
  onManualSelect: (id: string | null) => void;
  selectQuestionType:string|null
}) => {
  
  const [actionType, setActionType] = useState<"allocated" | "reroute">(
    "reroute"
  );
  useEffect(()=>{
    if (!selectQuestionType) return
    if(selectQuestionType=="re-routed")
    {
      setActionType("reroute")
    }
    else{
      setActionType("allocated")
    }
  },[selectQuestionType])
  
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
  const[reviewLevel,setReviewLevel]=useState('all')

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
  } = useGetAllocatedQuestions(LIMIT, filter, preferences,actionType,autoSelectQuestionId,reviewLevel);
  const { data: exactQuestionPage, isLoading: isLoading } =
    useGetAllocatedQuestionPage(autoSelectQuestionId!);
   
  // const questions = questionPages?.pages.flat() || [];
  /*const questions = useMemo(() => {
     return questionPages?.pages.flat() || [];
     }, [questionPages]);*/
  const questions = useMemo(() => {
    if (!questionPages?.pages) return [];
    return questionPages.pages.flat();
  }, [questionPages, actionType]);
  const didInit = useRef(false);

  useEffect(() => {
    // wait until data is loaded
    if (!questionPages?.pages) return;
  
    // run ONLY once
    if (didInit.current) return;
    didInit.current = true;
  
    if (questions.length === 0) {
      setActionType("allocated");
    }
  }, [questionPages, questions]);
  
  

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
      const firstId = questions[0]?.id ?? null;
      setSelectedQuestion(firstId);
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
  }, [newAnswer, sources, remarks, selectedQuestion,actionType]);

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
    payload.type=actionType

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
  setSelectedQuestion(null);
};
  return (
    <div className=" mx-auto px-4 md:px-6 bg-transparent py-4 ">
      <div className="flex flex-col space-y-6">
        <div
          className={`grid grid-cols-1 ${
            questions.length && !isLoadingTargetQuestion && "lg:grid-cols-2"
          } gap-6`}
        >
         <QaHeader
  questions={questions}
  selectedQuestion={selectedQuestion}
  onQuestionSelect={handleQuestionClick}
  isLoading={isQuestionsLoading }
  isLoadingTarget={isLoadingTargetQuestion}
  isFetchingNextPage={isFetchingNextPage}
  onRefresh={refetch}
  actionType={actionType}
  onActionTypeChange={(type) => setActionType(type as any)}
  reviewLevel={reviewLevel}
  onReviewLevelChange={setReviewLevel}
  scrollRef={scrollRef}
  questionItemRefs={questionItemRefs}
  setQuestionRef={setQuestionRef}
/>

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
                    <AnswerCreateDialog/>
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
                setSelectedQuestion={setSelectedQuestion}
                refetchQuestions={refetch}
              />
            )}
            {questions &&
            questions.length != 0 && actionType=="reroute" &&
            selectedQuestionData &&selectedQuestionData?.history?.length > 0 &&
            
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
                setSelectedQuestion={setSelectedQuestion}
                refetchQuestions={refetch}
              />
            )}
        </div>
      </div>
    </div>
  );
};

















