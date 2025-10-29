import type {
  IAnswer,
  IQuestionFullData,
  ISubmission,
  ISubmissionHistory,
  IUser,
  UserRole,
} from "@/types";
import {
  forwardRef,
  use,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Badge } from "./atoms/badge";
import { Card } from "./atoms/card";
import { Separator } from "./atoms/separator";
import { Textarea } from "./atoms/textarea";
import { Button } from "./atoms/button";
import toast from "react-hot-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./atoms/dialog";
import { ScrollArea } from "./atoms/scroll-area";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./atoms/accordion";
import {
  AlertCircle,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Edit,
  Eye,
  FileText,
  Gauge,
  Landmark,
  Layers,
  Link2,
  Loader2,
  MapPin,
  MessageSquare,
  RefreshCw,
  Send,
  Sprout,
  UserCheck,
  Users,
} from "lucide-react";
import { useSubmitAnswer } from "@/hooks/api/answer/useSubmitAnswer";
import { useGetComments } from "@/hooks/api/comment/useGetComments";
import { useAddComment } from "@/hooks/api/comment/useAddComment";
import { SourceUrlManager } from "./source-url-manager";
import { Timeline } from "primereact/timeline";
import { useUpdateAnswer } from "@/hooks/api/answer/useUpdateAnswer";

interface QuestionDetailProps {
  question: IQuestionFullData;
  currentUserId: string;
  goBack: () => void;
  refetchAnswers: () => void;
  isRefetching: boolean;
  currentUser: IUser;
}

const flattenAnswers = (submission: ISubmission): IAnswer[] => {
  const answers: IAnswer[] = [];

  for (const h of submission.history) {
    if (h.answer) {
      answers.push(h.answer);
    }
  }

  return answers.sort((a, b) => {
    const aT = a.createdAt ? +new Date(a.createdAt) : 0;
    const bT = b.createdAt ? +new Date(b.createdAt) : 0;
    return bT - aT;
  });
};

export const QuestionDetails = ({
  question,
  currentUserId,
  refetchAnswers,
  isRefetching,
  currentUser,
  goBack,
}: QuestionDetailProps) => {
  const answers = useMemo(
    () => flattenAnswers(question?.submission),
    [question.submission]
  );
  const ANSWER_VISIBLE_COUNT = 5;
  const [answerVisibleCount, setAnswerVisibleCount] =
    useState(ANSWER_VISIBLE_COUNT);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [showFullContext, setShowFullContext] = useState(false);

  const metrics = question.metrics;
  const context = question.context;

  const commentRef = useRef<any>(null);

  return (
    <main className="mx-auto  pt-0 grid gap-6 ">
      <header className="grid gap-2">
      <Button
              size="sm"
              variant="outline"
              className="inline-flex w-[70px] items-center justify-center gap-1 whitespace-nowrap p-2"
              onClick={() => goBack()}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="w-4 h-4 "
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                  //d="M17 8l4 4m0 0l-4 4m4-4H3"
                />
              </svg>
              <span className="leading-none">Exit</span>
            </Button>
        <div className="flex items-center lg:justify-between md:justify-between sm:justify-between">
          <h1 className="text-2xl font-semibold text-pretty">
            {question.question}
          </h1>
          <div className="flex justify-center gap-2 items-center">
            {question.status != "closed" && currentUser.role != "expert" && (
              <SubmitAnswerDialog
                questionId={question._id}
                isAlreadySubmitted={question.isAlreadySubmitted}
                currentUserId={currentUserId}
                onSubmitted={() => {
                  refetchAnswers();
                }}
              />
            )}
           
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            className={
              question.status === "in-review"
                ? "bg-green-500/10 text-green-600 border-green-500/30"
                : question.status === "open"
                ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
                : question.status === "closed"
                ? "bg-gray-500/10 text-gray-600 border-gray-500/30"
                : "bg-muted text-foreground"
            }
          >
            {question.status.replace("_", " ")}
          </Badge>

          <Badge
            className={
              question.priority === "high"
                ? "bg-red-500/10 text-red-600 border-red-500/30"
                : question.priority === "medium"
                ? "bg-yellow-500/10 text-yellow-600 border-yellow-500/30"
                : question.priority === "low"
                ? "bg-blue-500/10 text-blue-600 border-blue-500/30"
                : "bg-muted text-foreground"
            }
          >
            {question.priority ? question.priority.toUpperCase() : "NIL"}
          </Badge>

          <span className="text-sm text-muted-foreground">
            Total answers: {question.totalAnswersCount}
          </span>
        </div>
        <div className="flex flex-col mt-2 md:flex-row md:mt-0 text-sm">
        <div className=" text-muted-foreground">
          Created: {new Date(question.createdAt).toLocaleString()} 
          <div className="hidden md:inline pl-2  pr-1 ">
          •
          </div>
        </div>
        <div className=" text-muted-foreground mt-2 md:mt-0">
          Updated: {new Date(question.createdAt).toLocaleString()}  
        </div>
        </div>
      </header>

      <Card className="p-4 grid gap-3 
      w-[80vw] sm:w-full sm:max-w-full md:max-w-full lg:max-w-full
      p-4 sm:p-5 md:p-6
      transition-all duration-300
        ">
        <p className="text-sm font-medium">Details</p>

        {/* Basic Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm w-full">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" />
            <span className="text-muted-foreground">State:</span>
            <span className="truncate">{question.details?.state || "-"}</span>
          </div>

          <div className="flex items-center gap-2">
            <Landmark className="w-4 h-4 text-primary" />
            <span className="text-muted-foreground">District:</span>
            <span className="truncate">
              {question.details?.district || "-"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Sprout className="w-4 h-4 text-primary" />
            <span className="text-muted-foreground">Crop:</span>
            <span className="truncate">{question.details?.crop || "-"}</span>
          </div>

          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            <span className="text-muted-foreground">Season:</span>
            <span className="truncate">{question.details?.season || "-"}</span>
          </div>

          <div className="flex items-center gap-2 sm:col-span-2">
            <Layers className="w-4 h-4 text-primary" />
            <span className="text-muted-foreground">Domain:</span>
            <span className="truncate">{question.details?.domain || "-"}</span>
          </div>
        </div>

        <Separator />

        <div className="flex items-center gap-2 text-sm">
          <Link2 className="w-4 h-4 text-primary" />
          <span className="text-muted-foreground">Source:</span>
          <span className="truncate">{question.source || "-"}</span>
        </div>

        {showMoreDetails && (
          <>
            <Separator className="my-2" />

            {context && (
              <div className="grid gap-1 text-sm">
                <div className="flex items-center gap-2 ">
                  <FileText className="w-4 h-4 text-primary" />
                  <span className="text-muted-foreground">Context:</span>
                </div>
                <p className="text-muted-foreground ml-6">
                  {showFullContext || context.length <= 180
                    ? context
                    : `${context.slice(0, 180)}... `}
                  {context.length > 180 && (
                    <button
                      onClick={() => setShowFullContext((prev) => !prev)}
                      className="text-primary text-xs font-medium"
                    >
                      {showFullContext ? "Show less" : "Read more"}
                    </button>
                  )}
                </p>
              </div>
            )}

            {/* Metrics */}
            {metrics && (
              <div className="grid gap-1 text-sm">
                <div className="flex items-center gap-2 mt-2">
                  <Gauge className="w-4 h-4 text-primary" />
                  <span className="text-muted-foreground font-medium">
                    Metrics
                  </span>
                </div>
                <div className="ml-6 grid grid-cols-2 gap-1 text-muted-foreground">
                  <span>Mean Similarity:</span>
                  <span>{metrics.mean_similarity.toFixed(2)}</span>
                  <span>Std Deviation:</span>
                  <span>{metrics.std_similarity.toFixed(2)}</span>
                  <span>Recent Similarity:</span>
                  <span>{metrics.recent_similarity.toFixed(2)}</span>
                  <span>Collusion Score:</span>
                  <span>{metrics.collusion_score.toFixed(2)}</span>
                </div>
              </div>
            )}
          </>
        )}

        {currentUser.role !== "expert" && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 flex items-center gap-1 justify-start text-primary"
            onClick={() => setShowMoreDetails((prev) => !prev)}
          >
            {showMoreDetails ? (
              <>
                <ChevronUp className="w-4 h-4" /> View Less
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" /> View More
              </>
            )}
          </Button>
        )}
      </Card>
      <SubmissionTimeline
        history={question.submission.history}
        queue={question.submission.queue}
        currentUser={currentUser}
      />
      <div className="flex  sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
        <h2 className="text-lg font-semibold flex justify-center sm:justify-start items-center gap-2 ">
          <div className="p-2 rounded-lg bg-primary/10">
            <FileText className="w-5 h-5 text-primary" />
          </div>
          Submission History
        </h2>
        <div className="flex justify-center sm:justify-start">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setIsRefreshing(true);
              setTimeout(() => {
                refetchAnswers();
                if (commentRef.current) {
                  commentRef.current.refetchComments();
                }
                setIsRefreshing(false);
              }, 2000);
              setAnswerVisibleCount(ANSWER_VISIBLE_COUNT);
            }}
            disabled={isRefreshing || isRefetching}
          >
            {isRefreshing || isRefetching ? (
              <Loader2 className="animate-spin w-4 h-4" />
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-1" />
                Refresh
              </>
            )}
          </Button>
        </div>
      </div>

      {answers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No answers yet.</p>
      ) : (
        <div>
          {/* <SubmissionTimeline /> */}
          <AnswerTimeline
            answerVisibleCount={answerVisibleCount}
            answers={answers}
            commentRef={commentRef}
            currentUserId={currentUserId}
            question={question}
            userRole={currentUser.role}
          />
          {answerVisibleCount < answers.length && (
            <div className="flex justify-center">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setIsLoadingMore(true);
                  setTimeout(() => {
                    setAnswerVisibleCount(
                      (prev) => prev + ANSWER_VISIBLE_COUNT
                    );
                    setIsLoadingMore(false);
                  }, 2000);
                }}
                disabled={isLoadingMore}
              >
                {isLoadingMore ? (
                  <Loader2 className="animate-spin w-4 h-4 mr-2" />
                ) : null}
                {isLoadingMore ? "Loading..." : "Load More"}
              </Button>
            </div>
          )}
        </div>
      )}
    </main>
  );
};
interface SubmissionTimelineProps {
  queue: ISubmission["queue"];
  history: ISubmission["history"];
  currentUser: IUser;
}

const SubmissionTimeline = ({
  currentUser,
  queue,
  history,
}: SubmissionTimelineProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const INITIAL_DISPLAY_COUNT = 12;

  const submittedUserIds = new Set(
    history.map((entry) => entry.updatedBy?._id)
  );
  const submittedUserEmails = new Set(
    history.map((entry) => entry.updatedBy?.email)
  );

  const nextWaitingIndex = queue?.findIndex(
    (q) => !submittedUserIds.has(q._id) && !submittedUserEmails.has(q.email)
  );

  const getStatus = (index: number) => {
    const user = queue[index];
    const hasSubmitted =
      submittedUserIds.has(user._id) || submittedUserEmails.has(user.email);

    if (hasSubmitted) return "submitted";
    if (index === nextWaitingIndex) return "waiting";
    return "pending";
  };

  const displayedQueue = isExpanded
    ? queue
    : queue?.slice(0, INITIAL_DISPLAY_COUNT);
  const hasMore = queue?.length > INITIAL_DISPLAY_COUNT;

  const getStatusStyles = (status: string) => {
    switch (status) {
      case "submitted":
        return {
          container:
            "bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700 shadow-green-100/50",
          icon: "text-green-700 dark:text-green-400",
          badge:
            "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-300 dark:border-green-700",
          iconBg: "bg-green-200 dark:bg-green-800/40",
          legendDot: "bg-green-500",
        };
      case "waiting":
        return {
          container:
            "bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 shadow-blue-100/50",
          icon: "text-blue-700 dark:text-blue-400",
          badge:
            "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-300 dark:border-blue-700",
          iconBg: "bg-blue-200 dark:bg-blue-800/40",
          legendDot: "bg-blue-500",
        };
      default:
        return {
          container: "bg-muted/50 border-muted shadow-muted/5",
          icon: "text-muted-foreground",
          badge: "bg-muted/50 text-muted-foreground border border-muted",
          iconBg: "bg-muted",
          legendDot: "bg-muted-foreground/40",
        };
    }
  };

  // for (let i = 0; i < 20; i++) {
  //   queue?.push(queue[i % queue?.length]);
  // }

  return (
    <div className="w-full space-y-6 my-6 px-2 sm:px-4 md:px-6 overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-foreground">
              Allocation Queue
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {queue?.length} {queue?.length === 1 ? "expert" : "experts"} in
              queue
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
            <span className="text-muted-foreground font-medium">Submitted</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            <span className="text-muted-foreground font-medium">Waiting</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/40" />
            <span className="text-muted-foreground font-medium">Pending</span>
          </div>
        </div>
      </div>

      <div  
      className="grid gap-6 place-content-center ml-13 "
      style={{
        gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
        WebkitOverflowScrolling: "touch",
      }}
      >
    {displayedQueue?.map((user, index) => {
      const status = getStatus(index);
      const styles = getStatusStyles(status);
      const isLast = index === displayedQueue?.length - 1;
      const isCurrentUserWaiting =
        status === "waiting" && currentUser.email === user.email;

      return (
        <div
          key={`${user._id}-${index}`}
          className="relative flex flex-col "
        >
          {/* Circular Card */}
          <div
            className={`flex flex-col items-center justify-center gap-2 p-4 rounded-full w-60 h-60 border-2 transition-all duration-300 hover:shadow-lg hover:scale-105 ${styles.container}
              ${isExpanded && index >= INITIAL_DISPLAY_COUNT ? "animate-fade-in" : ""}
              ${isCurrentUserWaiting ? "ring-4 ring-blue-400 ring-offset-2 dark:ring-blue-600 dark:ring-offset-gray-900 scale-105" : ""}
            `}
          >
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 ${styles.iconBg}`}
            >
              {status === "submitted" ? (
                <CheckCircle2 className={`w-6 h-6 ${styles.icon}`} />
              ) : status === "waiting" ? (
                <Clock
                  className={`w-6 h-6 ${styles.icon} ${
                    isCurrentUserWaiting ? "animate-bounce-subtle" : ""
                  }`}
                />
              ) : (
                <AlertCircle className={`w-6 h-6 ${styles.icon}`} />
              )}
            </div>

            <div className="text-center w-full px-2 break-words">
              <p className="text-xs font-semibold  text-foreground">
                {user.name}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {user.email}
              </p>
            </div>

            <span
              className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap ${styles.badge}`}
            >
              {status === "submitted"
                ? "Submitted"
                : status === "waiting"
                ? isCurrentUserWaiting
                  ? "Your Turn"
                  : "Waiting"
                : "Pending"}
            </span>
          </div>

          {/* Arrow */}
          {!isLast && (
  <div
    className={`
      flex justify-center mt-3 
      sm:mt-0 sm:absolute sm:top-1/2 sm:right-0 
      sm:translate-x-full sm:-translate-y-1/2
    `}
  >
    {/* Down arrow for small screens */}
    <svg
      className={`block sm:hidden w-5 h-5 text-gray-400 dark:text-gray-500 ${
        isCurrentUserWaiting ? "animate-bounce" : ""
      }`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 5v14m0 0l4-4m-4 4l-4-4"
      />
    </svg>

    {/* Right arrow for medium+ screens */}
    <svg
      className={`hidden sm:block w-5 h-5 text-gray-400 dark:text-gray-500 ${
        isCurrentUserWaiting ? "animate-bounce" : ""
      }`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 12h14m0 0l-4-4m4 4l-4 4"
      />
    </svg>
  </div>
)}


        </div>
      );
    })}
  </div>





      {hasMore && (
        <div className="flex justify-center pt-4">
          <Button
            variant="outline"
            onClick={() => setIsExpanded(!isExpanded)}
            className="gap-2 min-w-[160px] transition-all duration-300"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="w-4 h-4" />
                View Less
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" />
                View More ({queue?.length - INITIAL_DISPLAY_COUNT})
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
};

interface IAnswerTimelineProps {
  answers: IAnswer[];
  currentUserId: string;
  question: IQuestionFullData;
  answerVisibleCount: number;
  commentRef: React.RefObject<HTMLDivElement>;
  userRole: UserRole;
}

export const AnswerTimeline = ({
  answers,
  currentUserId,
  question,
  answerVisibleCount,
  commentRef,
  userRole,
}: IAnswerTimelineProps) => {
  // map answers to timeline events
  const events = answers.slice(0, answerVisibleCount).map((ans) => {
    const submission = question.submission.history.find(
      (h) => h.answer?._id === ans._id
    );

    return {
      answer: ans,
      submission,
      createdAt: new Date(ans.createdAt || "").toLocaleString(),
    };
  });

  return (
    <div className="w-full   ">
       <div className="w-full flex items-start">
      <Timeline
        value={events}
        align="left"
  pt={{
    event: { className: "justify-start items-start ml-5" },
    content: { className: "w-full" },
    opposite: { className: "hidden md:block" },
  }}
        opposite={(item) => (
          <div className=" hidden sm:flex ml-5 flex flex-col gap-1 ">
            {item.submission?.updatedBy && (
              <div className="text-xs text-foreground px-2 py-1 rounded-md">
                <span className="font-medium">By:</span>{" "}
                {item.submission.updatedBy.name} (
                {item.submission.updatedBy.email})
              </div>
            )}

            {/* {item.answer.threshold > 0 && (
              <div className="flex justify-end w-full">
                <Badge
                  variant="outline"
                  className="inline-flex text-[10px] text-foreground border border-muted-foreground items-center gap-1 px-1 py-0.5 w-fit"
                >
                  <span className="font-medium">Correctness:</span>
                  <span>{Math.round(item.answer.threshold * 100)}%</span>
                </Badge>
              </div>
            )} */}

            <small className="text-xs text-muted-foreground mt-1">
              {item.createdAt}
            </small>
          </div>
        )}
        content={(item) => (
          <div className="flex-1 mb-5 ">
            <AnswerItem
              answer={item.answer}
              submissionData={item.submission}
              currentUserId={currentUserId}
              questionId={question._id}
              ref={commentRef}
              userRole={userRole}
            />
          </div>
        )}
      />
      </div>
    </div>
  );
};

interface AnswerItemProps {
  answer: IAnswer;
  currentUserId: string;
  submissionData?: ISubmissionHistory;
  questionId: string;
  userRole: UserRole;
}

export const AnswerItem = forwardRef((props: AnswerItemProps, ref) => {
  const isMine = props.answer.authorId === props.currentUserId;
  const [comment, setComment] = useState("");
  const observer = useRef<IntersectionObserver>(null);
  const LIMIT = 1;
  const {
    data: commentsData,
    refetch: refetchComments,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isLoadingComments,
  } = useGetComments(LIMIT, props.questionId, props.answer._id);

  const comments =
    commentsData?.pages.flatMap((comment) => comment ?? []) ?? [];
  const [editableAnswer, setEditableAnswer] = useState(props.answer.answer);
  const [editOpen, setEditOpen] = useState(false);
  const { mutateAsync: addComment, isPending: isAddingComment } =
    useAddComment();
  const { mutateAsync: updateAnswer } = useUpdateAnswer();

  useImperativeHandle(ref, () => {
    refetchComments;
  });

  const submitComment = async () => {
    if (!comment.trim()) return;

    try {
      await addComment({
        questionId: props.questionId,
        answerId: props.answer._id!,
        text: comment.trim(),
      });
      setComment("");
      toast.success("Comment submitted! Thank you for your input.");
    } catch (err) {
      console.error("Failed to submit comment:", err);
    }
  };

  const handleUpdateAnswer = async () => {
    try {
      if (!editableAnswer || editableAnswer.trim().length <= 3) {
        toast.error("Updated answer should be at least more than 3 characters");
        return;
      }

      const answerId = props.answer._id;

      if (!answerId) {
        toast.error("Answer ID not found. Cannot update.");
        return;
      }

      await updateAnswer({
        updatedAnswer: editableAnswer,
        answerId,
      });

      toast.success("Answer updated successfully!");
      setEditOpen(false);
    } catch (error) {
      console.error("Failed to edit answer:", error);
      toast.error("Failed to update answer. Please try again.");
      setEditOpen(false);
    }
  };

  const lastCommentRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (isFetchingNextPage) return;
      if (observer.current) observer.current.disconnect();

      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasNextPage) {
          fetchNextPage();
        }
      });

      if (node) observer.current.observe(node);
    },
    [isFetchingNextPage, fetchNextPage, hasNextPage]
  );

  return (
    <Card className="p-6 grid gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">
            Iteration {props.answer.answerIteration}
          </span>
          {props.answer.isFinalAnswer && (
            <Badge
              variant="outline"
              className="text-green-600 border-green-600"
            >
              Final
            </Badge>
          )}
          {isMine && <UserCheck className="w-4 h-4 text-blue-600 ml-1" />}
        </div>
        <div className="flex items-center justify-center gap-2">
          {props.userRole !== "expert" && props.answer.isFinalAnswer && (
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogTrigger asChild>
                <Button className="bg-primary text-primary-foreground flex items-center gap-2 px-4 py-2">
                  <Edit className="w-4 h-4" />
                  Edit Answer
                </Button>
              </DialogTrigger>

              <DialogContent
                className="w-[90vw] max-w-6xl max-h-[85vh] flex flex-col"
                style={{ maxWidth: "70vw" }}
              >
                <DialogHeader>
                  <DialogTitle className="text-lg font-semibold">
                    Edit Answer
                  </DialogTitle>
                </DialogHeader>

                <div className="mt-4">
                  <Textarea
                    value={editableAnswer}
                    placeholder="Update answer here..."
                    onChange={(e) => setEditableAnswer(e.target.value)}
                    className="min-h-[150px] resize-none border border-border bg-background"
                  />
                </div>
                <div
                  className="mt-4 p-4 rounded-md border bg-yellow-50 border-yellow-300 text-yellow-900 text-sm
                dark:bg-yellow-900/20 dark:border-yellow-700/60 dark:text-yellow-200"
                >
                  ⚠️ You are about to update a <strong>finalized answer</strong>
                  . Please review your changes carefully before saving to avoid
                  mistakes.
                </div>

                <div className="mt-6 flex justify-end gap-3">
                  <Button variant="outline" onClick={() => setEditOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleUpdateAnswer}
                    className="bg-primary text-primary-foreground"
                  >
                    Save
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="w-full sm:w-auto ">
                <Eye className="w-4 h-4 mr-2" />
                View More
              </Button>
            </DialogTrigger>
            <DialogContent
              className="w-[90vw] max-w-6xl h-[85vh] flex flex-col"
              style={{ maxWidth: "90vw" }}
            >
              <DialogHeader className="pb-4 border-b">
                <DialogTitle className="text-xl font-semibold">
                  Answer Details
                </DialogTitle>
              </DialogHeader>

              <ScrollArea className="flex-1 h-[85vh] ">
                <div className="space-y-6 p-4">
                  <div className="grid gap-4 text-sm ">
                    <div className="flex flex-col sm:flex-row justify-between gap-3">
                      <div className="flex items-center gap-4">
                        <span className="font-medium">
                          Iteration:{" "}
                          <span className="text-foreground font-normal">
                            {props.answer.answerIteration}
                          </span>
                        </span>

                        <Badge
                          variant={
                            props.answer.isFinalAnswer ? "default" : "secondary"
                          }
                          className={
                            props.answer.isFinalAnswer
                              ? "bg-green-100 text-green-800 hover:bg-green-100"
                              : ""
                          }
                        >
                          {props.answer.isFinalAnswer
                            ? "Final Answer"
                            : "Draft"}
                        </Badge>
                      </div>

                      <div className="flex flex-col text-muted-foreground text-xs">
                        <span>
                          Submitted At:{" "}
                          {new Date(
                            props.answer.createdAt || ""
                          ).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {/* {props.submissionData?.updatedBy && (
                      <div className="rounded-lg border bg-muted/50 p-4">
                        <p className="text-sm font-medium text-foreground mb-1">
                          Submitted By
                        </p>
                        
                        <p className="text-sm text-muted-foreground">
                          {props.submissionData.updatedBy.name} (
                          {props.submissionData.updatedBy.email})
                        </p>

                         {props.answer.threshold > 0 && (
                          <Badge
                            variant="outline"
                            className="text-foreground border border-muted-foreground"
                          >
                            Threshold: {props.answer.threshold}
                          </Badge>
                        )}
                      </div>
                    )} */}
                    {props.submissionData?.updatedBy && (
                      <div className="rounded-lg border bg-muted/50 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground">
                            Submitted By:{" "}
                            <span className="text-sm text-muted-foreground">
                              {props.submissionData.updatedBy.name} (
                              {props.submissionData.updatedBy.email})
                            </span>
                          </p>

                          {props.answer.threshold > 0 && (
                            <Badge
                              variant="outline"
                              className="text-foreground border border-muted-foreground w-fit flex items-center gap-1"
                            >
                              <span className="font-medium">Correctness:</span>
                              <span>
                                {Math.round(props.answer.threshold * 100)}%
                              </span>
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="text-sm font-medium text-foreground mb-3">
                      Answer Content
                    </p>
                    <div className="rounded-lg border bg-muted/30 h-[40vh]  ">
                      <ScrollArea className="h-full">
                        <div className="p-4">
                          <p className="whitespace-pre-wrap leading-relaxed text-foreground">
                            {props.answer.answer}
                          </p>
                        </div>
                      </ScrollArea>
                    </div>
                  </div>

                  {props.answer.sources?.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-foreground mb-3">
                        Source URLs
                      </p>
                      <div className="space-y-2">
                        {props.answer.sources.map((url, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between rounded-lg border bg-muted/30 p-2"
                          >
                            <span className="text-sm truncate text-foreground">
                              {url}
                            </span>
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 rounded hover:bg-muted/20 dark:hover:bg-muted/50 transition-colors"
                            >
                              <ArrowUpRight className="w-4 h-4 text-foreground" />
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <p className="whitespace-pre-wrap leading-relaxed line-clamp-4 text-card-foreground px-5">
          {props.answer.answer}
        </p>
      </div>

      <div className="w-full sm:w-auto">
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="comments" className="border-none">
            <AccordionTrigger className="flex items-center gap-2 text-sm font-medium p-3 hover:no-underline hover:bg-muted/50 rounded-lg w-full sm:w-auto justify-between shadow-md shadow-gray-400/30 dark:shadow-gray-900/50">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <span>Comments</span>
                {comments?.length > 0 && (
                  <Badge
                    variant="secondary"
                    className="h-5 w-5 p-0 flex items-center justify-center text-xs"
                  >
                    {comments?.length}
                  </Badge>
                )}
              </div>
            </AccordionTrigger>

            <AccordionContent className="p-4">
              <div className="space-y-4">
                {isLoadingComments ? (
                  <div className="flex justify-center items-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : comments?.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {isMine
                      ? "You haven't received any comments on your answer yet."
                      : "No comments yet. Be the first to add one!"}
                  </p>
                ) : (
                  <ScrollArea className="h-[40vh]">
                    <div className="space-y-3 p-2">
                      {comments?.map((c, idx) => {
                        const isLast = idx === comments.length - 1;
                        return (
                          <div
                            key={c._id}
                            ref={isLast ? lastCommentRef : null}
                            className={`rounded-lg border bg-muted/30 p-3 ${
                              idx % 2 === 0 ? "bg-secondary/80" : ""
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm  text-muted-foreground">
                                {c.userName || "Unknown User"}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {new Date(c.createdAt).toLocaleString()}
                              </span>
                            </div>
                            <p className="text-sm ms-2 text-foreground leading-relaxed">
                              {c.text}
                            </p>
                          </div>
                        );
                      })}
                      {isFetchingNextPage && (
                        <div className="text-center text-sm text-muted-foreground py-2">
                          Loading more...
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                )}
                {!isMine && (
                  <div className="space-y-3 border-t-2 pt-3">
                    <Textarea
                      placeholder="Add your comment here..."
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      rows={3}
                      className="resize-none h-[8vh] md:h-[20vh]"
                    />
                    <div className="flex justify-end">
                      <Button
                        onClick={submitComment}
                        size="sm"
                        className="md:p-2 flex items-center justify-center gap-1"
                        disabled={!comment.trim() || isAddingComment}
                      >
                        {isAddingComment ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Submitting...
                          </>
                        ) : (
                          "Submit"
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </Card>
  );
});

interface SubmitAnswerDialogProps {
  questionId: string;
  isAlreadySubmitted: boolean;
  currentUserId: string;
  onSubmitted?: () => void;
}

export const SubmitAnswerDialog = ({
  questionId,
  isAlreadySubmitted,
  onSubmitted,
}: SubmitAnswerDialogProps) => {
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<string[]>([]);
  const { mutateAsync: submitAnswer, isPending: isSubmittingAnswer } =
    useSubmitAnswer();

  const triggerLabel = isAlreadySubmitted
    ? "Already submitted"
    : "Submit answer";

  async function handleSubmit() {
    if (!answer.trim()) {
      toast.error("Please write your answer before submitting.");
      return;
    }
    if (!sources.length) {
      toast.error("Atleast one source is required!");
      return;
    }
    try {
      const result = await submitAnswer({
        questionId: questionId,
        answer,
        sources,
      });
      if (result) {
        toast.success(
          result.isFinalAnswer
            ? "Response submitted successfully! ✅ This is the final answer."
            : "Response submitted successfully!"
        );
      }
      onSubmitted?.();
      setOpen(false);
      setAnswer("");
    } catch (e: any) {
      toast.error("Failed to submit");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default" disabled={isAlreadySubmitted}>
          <Send className="w-3 h-3" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isAlreadySubmitted ? "Submit a new answer" : "Submit your answer"}
          </DialogTitle>
          <DialogDescription>
            {isAlreadySubmitted
              ? "You have already submitted an answer. Submitting again will create a new iteration."
              : "Provide your answer below to submit."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* Answer textarea */}
          <div className="grid gap-2">
            <label className="text-sm text-muted-foreground" htmlFor="answer">
              Your answer
            </label>
            <Textarea
              id="answer"
              placeholder="Write your answer..."
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              className="w-full border rounded p-2 text-sm resize-none overflow-y-auto h-24 not-first:max-h-36"
              rows={6}
            />
          </div>

          <div className="bg-card border border-border rounded-xl p-6 shadow-sm mt-3 md:mt-6">
            <SourceUrlManager sources={sources} onSourcesChange={setSources} />

            {sources.length > 0 && (
              <div className="mt-6 pt-6 border-t border-border">
                <p className="text-sm text-muted-foreground">
                  {sources.length} {sources.length === 1 ? "source" : "sources"}{" "}
                  added
                </p>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="secondary"
            onClick={() => setOpen(false)}
            disabled={isSubmittingAnswer}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmittingAnswer}>
            {isSubmittingAnswer ? "Submitting..." : triggerLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
