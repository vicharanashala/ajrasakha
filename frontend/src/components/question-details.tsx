import type {
  IAnswer,
  IQuestionFullData,
  ISubmission,
  ISubmissionHistory,
  IUser,
  QuestionStatus,
  SourceItem,
  UserRole,
} from "@/types";
import {
  forwardRef,
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
import { toast } from "sonner";
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
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  Calendar,
  Check,
  CheckCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Eye,
  FileText,
  Gauge,
  Info,
  Landmark,
  Layers,
  Link2,
  Loader2,
  MapPin,
  Pencil,
  PlusCircle,
  RefreshCcw,
  RefreshCw,
  Send,
  Sprout,
  Trash2,
  User,
  UserCheck,
  UserPlus,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { useSubmitAnswer } from "@/hooks/api/answer/useSubmitAnswer";
import { useGetComments } from "@/hooks/api/comment/useGetComments";
import { SourceUrlManager } from "./source-url-manager";
import { Timeline } from "primereact/timeline";
import { useUpdateAnswer } from "@/hooks/api/answer/useUpdateAnswer";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./atoms/tooltip";
import { Checkbox } from "./atoms/checkbox";
import { Label } from "./atoms/label";
import { Switch } from "./atoms/switch";
import { useGetAllUsers } from "@/hooks/api/user/useGetAllUsers";
import { useAllocateExpert } from "@/hooks/api/question/useAllocateExperts";
import { useToggleAutoAllocateQuestion } from "@/hooks/api/question/useToggleAutoAllocateQuestion";
import { useRemoveAllocation } from "@/hooks/api/question/useRemoveAllocation";
import { ConfirmationModal } from "./confirmation-modal";
import { Input } from "./atoms/input";
import { formatDate } from "@/utils/formatDate";
import { useCountdown } from "@/hooks/ui/useCountdown";
import { TimerDisplay } from "./timer-display";
import { CommentsSection } from "./comments-section";
import { parameterLabels } from "./QA-interface";

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
  console.log("here ", question);
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

  const timer = useCountdown(question.createdAt!, 4, () => {});

  const commentRef = useRef<any>(null);

  return (
    <main className="mx-auto p-6 pt-0 grid gap-6">
      {/* <header className="grid gap-2">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-pretty">
            {question.question}
          </h1>
          <div className="flex gap-8 items-center justify-center">
            <TimerDisplay timer={timer} status={question.status} size="lg" />
            <div className="flex justify-center gap-2 items-center">
              <Button
                size="sm"
                variant="outline"
                className="inline-flex items-center justify-center gap-1 whitespace-nowrap p-2"
                onClick={() => goBack()}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="w-4 h-4"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M17 8l4 4m0 0l-4 4m4-4H3"
                  />
                </svg>
                <span className="leading-none">Exit</span>
              </Button>
            </div>
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

        <div className="text-xs text-muted-foreground">
          Created: {formatDate(new Date(question.createdAt))} • Updated:{" "}
          {formatDate(new Date(question.updatedAt))}
        </div>
      </header> */}

      <header className="grid gap-3 w-full">
        {/* Title + Timer + Exit */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          {/* Question Title */}
          <h1 className="text-xl sm:text-2xl font-semibold text-pretty break-words flex-1">
            {question.question}
          </h1>

          {/* Right Side */}
          <div className="flex sm:flex-row flex-col sm:items-center items-end gap-3 sm:gap-6">
            <TimerDisplay timer={timer} status={question.status} size="lg" />

            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                className="inline-flex items-center justify-center gap-1 whitespace-nowrap p-2"
                onClick={() => goBack()}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="w-4 h-4"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M17 8l4 4m0 0l-4 4m4-4H3"
                  />
                </svg>
                <span className="leading-none">Exit</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Status + Priority + Total answers */}
        <div className="flex flex-wrap items-center gap-2">
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

          <span className="text-sm text-muted-foreground whitespace-nowrap">
            Total answers: {question.totalAnswersCount}
          </span>
        </div>

        {/* Created / Updated */}
        <div className="text-xs text-muted-foreground flex flex-wrap gap-1">
          <span>Created: {formatDate(new Date(question.createdAt))}</span>
          <span>•</span>
          <span>Updated: {formatDate(new Date(question.updatedAt))}</span>
        </div>
      </header>

      {/* <Card className="p-4 grid gap-3">
        <p className="text-sm font-medium">Details</p>

        <div className="grid grid-cols-2 gap-2 text-sm">
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

          <div className="flex items-center gap-2 col-span-2">
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

        {currentUser.role !== "expert" && (context || metrics) && (
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
      </Card> */}

      <Card className="p-4 grid gap-4">
        <p className="text-sm font-medium">Details</p>

        {/* Basic Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="flex items-start gap-2">
            <MapPin className="w-4 h-4 text-primary shrink-0" />
            <div className="flex flex-col">
              <span className="text-muted-foreground">State</span>
              <span className="truncate">{question.details?.state || "-"}</span>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <Landmark className="w-4 h-4 text-primary shrink-0" />
            <div className="flex flex-col">
              <span className="text-muted-foreground">District</span>
              <span className="truncate">
                {question.details?.district || "-"}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <Sprout className="w-4 h-4 text-primary shrink-0" />
            <div className="flex flex-col">
              <span className="text-muted-foreground">Crop</span>
              <span className="truncate">{question.details?.crop || "-"}</span>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <Calendar className="w-4 h-4 text-primary shrink-0" />
            <div className="flex flex-col">
              <span className="text-muted-foreground">Season</span>
              <span className="truncate">
                {question.details?.season || "-"}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-2 sm:col-span-2">
            <Layers className="w-4 h-4 text-primary shrink-0" />
            <div className="flex flex-col">
              <span className="text-muted-foreground">Domain</span>
              <span className="truncate">
                {question.details?.domain || "-"}
              </span>
            </div>
          </div>
        </div>

        <Separator />

        <div className="flex items-start gap-2 text-sm">
          <Link2 className="w-4 h-4 text-primary shrink-0" />
          <div className="flex flex-col">
            <span className="text-muted-foreground">Source</span>
            <span className="truncate">{question.source || "-"}</span>
          </div>
        </div>

        {showMoreDetails && (
          <>
            <Separator className="my-2" />

            {context && (
              <div className="grid gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  <span className="text-muted-foreground">Context</span>
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

            {metrics && (
              <div className="grid gap-2 text-sm">
                <div className="flex items-center gap-2 mt-1">
                  <Gauge className="w-4 h-4 text-primary" />
                  <span className="text-muted-foreground font-medium">
                    Metrics
                  </span>
                </div>

                <div className="ml-6 grid grid-cols-1 sm:grid-cols-2 gap-1 text-muted-foreground">
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

        {currentUser.role !== "expert" && (context || metrics) && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 flex items-center gap-1 text-primary"
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

      {/* {currentUser.role !== "expert" && ( */}
      <AllocationTimeline
        history={question.submission.history}
        queue={question.submission.queue}
        currentUser={currentUser}
        question={question}
      />
      {/* )} */}
      <div className="md:flex items-center justify-between md:mt-12 hidden ">
        <h2 className="text-lg font-semibold flex justify-center gap-2 items-center ">
          <div className="p-2 rounded-lg bg-primary/10">
            <FileText className="w-5 h-5 text-primary" />
          </div>
          Submission History
        </h2>
        <div className="flex items-center gap-2">
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
      <p
        className="
    text-sm md:hidden p-3 rounded w-full 
    flex items-center justify-center gap-3 text-center flex-wrap
    bg-yellow-50 border border-yellow-300 text-yellow-700
    dark:bg-yellow-900/30 dark:border-yellow-800 dark:text-yellow-300
  "
      >
        <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />

        <span className="font-medium">
          Allocation timeline is only accessible on laptop/desktop
        </span>

        <span className="opacity-80">(or switch to desktop view)</span>
      </p>

      {answers.length === 0 ? (
        <p className="text-sm text-muted-foreground  hidden md:block">
          No answers yet.
        </p>
      ) : (
        <div className="hidden md:block">
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

interface AllocationQueueHeaderProps {
  question: IQuestionFullData;
  queue?: ISubmission["queue"];
  currentUser: IUser;
}

const AllocationQueueHeader = ({
  question,
  queue = [],
  currentUser,
}: AllocationQueueHeaderProps) => {
  const [autoAllocate, setAutoAllocate] = useState(question.isAutoAllocate);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedExperts, setSelectedExperts] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  const { data: usersData, isLoading: isUsersLoading } = useGetAllUsers();
  const { mutateAsync: allocateExpert, isPending: allocatingExperts } =
    useAllocateExpert();
  const { mutateAsync: toggleAutoAllocateStatus, isPending: changingStatus } =
    useToggleAutoAllocateQuestion();

  const expertsIdsInQueue = new Set(queue.map((expert) => expert._id));

  const experts =
    usersData?.users.filter(
      (user) => user.role === "expert" && !expertsIdsInQueue.has(user._id)
    ) || [];

  const filteredExperts = experts.filter(
    (expert) =>
      expert.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      expert.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleToggle = async (checked: boolean) => {
    try {
      await toggleAutoAllocateStatus(question._id);
      setAutoAllocate(checked);
    } catch (error) {
      console.error("Error toggling auto-allocate:", error);
      toast.error("Error toggling auto-allocate. Please try again.");
    }
  };

  const handleSelectExpert = (expertId: string) => {
    setSelectedExperts((prev) =>
      prev.includes(expertId)
        ? prev.filter((id) => id !== expertId)
        : [...prev, expertId]
    );
  };

  const handleSubmit = async () => {
    try {
      if (question.status !== "open" && question.status !== "delayed") {
        toast.error(
          "This question is currently being reviewed or has been closed. Please check back later!"
        );
        return;
      }
      await allocateExpert({
        questionId: question._id,
        experts: selectedExperts,
      });
      setSelectedExperts([]);
      setIsModalOpen(false);
    } catch (error: any) {
      console.error("Error allocating experts:", error);
      toast.error(
        error?.message || "Failed to allocate experts. Please try again."
      );
    }
  };

  const handleCancel = () => {
    setSelectedExperts([]);
    setIsModalOpen(false);
  };

  return (
    <div className="flex flex-col gap-4 pb-6 border-b border-border">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        {/* LEFT SECTION */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <Users className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-foreground">
              Allocation Queue
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {queue?.length} {queue?.length === 1 ? "expert" : "experts"} in
              queue
            </p>
          </div>
        </div>

        {/* RIGHT SECTION */}
        {currentUser.role !== "expert" && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full md:w-auto">
            {/* Auto-Allocate Block */}
            <div className="flex items-center gap-3 bg-card p-3 rounded-lg border border-border shadow-sm w-full sm:w-auto">
              <Switch
                id="auto-allocate"
                checked={autoAllocate}
                onCheckedChange={handleToggle}
              />
              <Label
                htmlFor="auto-allocate"
                className="cursor-pointer font-medium text-sm flex items-center gap-2"
              >
                {changingStatus && (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
                Auto-allocate Experts
              </Label>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <div className="space-y-1.5 text-sm">
                      <p>
                        <strong>ON:</strong> Questions are automatically
                        assigned to available experts…
                      </p>
                      <p>
                        <strong>OFF:</strong> You must manually add experts…
                      </p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            {/* Select Experts Button */}
            {!autoAllocate && (
              <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogTrigger asChild>
                  <Button variant="default" className="gap-2 w-full sm:w-auto">
                    <UserPlus className="w-4 h-4" />
                    Select Experts
                  </Button>
                </DialogTrigger>

                <DialogContent
                  className="
                          w-[95vw]                 
                          sm:max-w-xl              
                          md:max-w-4xl             
                          lg:max-w-6xl             
                          max-h-[85vh]             
                          min-h-[60vh]             
                          overflow-hidden           
                          p-4                       
                        "
                >
                  <DialogHeader className="space-y-4">
                    <DialogTitle className="flex items-center gap-3 text-lg font-semibold">
                      <div className="p-2 rounded-lg bg-primary/10 flex items-center justify-center">
                        <UserPlus className="w-5 h-5 text-primary" />
                      </div>
                      Select Experts Manually
                    </DialogTitle>

                    <div className="mt-1 relative">
                      <Input
                        type="text"
                        placeholder="Search experts by name, email..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full px-3 py-2 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary border"
                      />
                      {searchTerm && (
                        <button
                          type="button"
                          onClick={() => setSearchTerm("")}
                          className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </DialogHeader>

                  <ScrollArea
                    className="
                              max-h-[50vh]      
                              md:max-h-[60vh]
                              pr-2
                            "
                  >
                    <div className="space-y-3">
                      {isUsersLoading && (
                        <div className="flex justify-center items-center py-10 text-muted-foreground">
                          <div className="flex flex-col items-center space-y-2">
                            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                            <span className="text-sm">Loading experts...</span>
                          </div>
                        </div>
                      )}

                      {!isUsersLoading && filteredExperts.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                          <UserPlus className="w-8 h-8 mb-2 text-muted-foreground/80" />
                          <p className="text-sm font-medium">
                            No experts available
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Try refreshing or check back later.
                          </p>
                        </div>
                      )}

                      {!isUsersLoading &&
                        filteredExperts.map((expert) => (
                          <div
                            key={expert._id}
                            className={`flex items-start space-x-3 p-3 rounded-lg hover:bg-muted/50 transition-colors ${
                              expert.isBlocked
                                ? "blur-[0px] cursor-not-allowed"
                                : "hover:bg-muted/50"
                            }
  `}
                          >
                            <div className="p-2 rounded-lg bg-primary/10 flex items-center justify-center">
                              <User className="w-5 h-5 text-primary" />
                            </div>

                            <Checkbox
                              id={`expert-${expert._id}`}
                              checked={selectedExperts.includes(expert._id)}
                              onCheckedChange={() =>
                                handleSelectExpert(expert._id)
                              }
                              disabled={expert.isBlocked}
                              className="mt-1"
                            />
                            {/* {expert.isBlocked ? 'Blocked' : ''} */}

                            <Label
                              htmlFor={`expert-${expert._id}`}
                              className="font-normal cursor-pointer flex-1 w-full"
                            >
                              <div className="flex justify-between items-center w-full">
                                <div className="flex flex-col">
                                  <div
                                    className="font-medium truncate"
                                    title={expert.userName}
                                  >
                                    {expert?.userName?.slice(0, 48)}
                                    {expert?.userName?.length > 48 ? "..." : ""}
                                  </div>
                                  <div
                                    className="text-xs text-muted-foreground truncate"
                                    title={expert.email}
                                  >
                                    {expert?.email?.slice(0, 48)}
                                    {expert?.email?.length > 48 ? "..." : ""}
                                  </div>
                                  {expert.isBlocked && (
                                    <span className="mt-1 text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full w-fit">
                                      Blocked
                                    </span>
                                  )}
                                </div>

                                <div className="text-sm text-muted-foreground flex-shrink-0 ml-2 hidden md:block">
                                  {expert.preference?.domain &&
                                  expert.preference.domain !== "all"
                                    ? expert.preference.domain
                                    : "Agriculture Expert"}
                                </div>
                              </div>
                            </Label>
                          </div>
                        ))}
                    </div>
                  </ScrollArea>

                  <DialogFooter className="flex gap-2 justify-end pt-4">
                    <Button
                      variant="outline"
                      onClick={handleCancel}
                      className="hidden md:block"
                    >
                      Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={allocatingExperts}>
                      {allocatingExperts && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      {allocatingExperts
                        ? "Allocating..."
                        : `Submit (${selectedExperts.length} selected)`}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

interface AllocationTimelineProps {
  queue: ISubmission["queue"];
  history: ISubmission["history"];
  currentUser: IUser;
  question: IQuestionFullData;
}

const AllocationTimeline = ({
  currentUser,
  queue,
  history,
  question,
}: AllocationTimelineProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const INITIAL_DISPLAY_COUNT = 12;
  const [isFlipped, setIsFlipped] = useState(false);
  const [flippedId, setIsFlippedId] = useState("");
  const [hoverTimeout, setHoverTimeout] = useState<NodeJS.Timeout | null>(null);

  const [selectedAllocationIndex, setSelectedAllocationIndex] = useState<
    number | null
  >(null);
  // Remove Allocation Hook
  const { mutateAsync: removeAllocation, isPending: removingAllocation } =
    useRemoveAllocation();

  // let timer: NodeJS.Timeout;

  const handleMouseEnter = (id: string) => {
    const timeout = setTimeout(() => {
      setIsFlippedId(id);
      setIsFlipped(true);
    }, 1000); // 1 second delay
    setHoverTimeout(timeout);
  };

  const handleMouseLeave = () => {
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      setHoverTimeout(null);
    }
    setIsFlippedId("");
    setIsFlipped(false);
  };

  const getUserSubmission = (
    userId: string
  ): ISubmissionHistory | undefined => {
    return history.find((h) => h.updatedBy?._id === userId);
  };

  const getUserActivityText = (userId: string): string => {
    const submission = getUserSubmission(userId);
    if (!submission) return "No activity yet.";

    const userName = submission?.updatedBy?.name || "User";

    if (
      submission.answer &&
      !submission.rejectedAnswer &&
      !submission.approvedAnswer
    ) {
      return `${userName} created an answer.`;
    }

    if (submission?.approvedAnswer) {
      const approvedEntry = history.find(
        (h) => h.answer?._id === submission.approvedAnswer
      );
      const approvedUserName = approvedEntry?.updatedBy?.name || "someone";
      return `${userName} approved ${approvedUserName}'s answer.`;
    }

    if (submission?.modifiedAnswer) {
      const approvedEntry = history.find(
        (h) => h.answer?._id === submission.approvedAnswer
      );
      const approvedUserName = approvedEntry?.updatedBy?.name || "someone";
      return `${userName} modified ${approvedUserName}'s answer.`;
    }

    if (submission.rejectedAnswer) {
      const rejectedEntry = history.find(
        (h) => h.answer?._id === submission.rejectedAnswer
      );
      const rejectedUserName = rejectedEntry?.updatedBy?.name || "someone";
      return `${userName} rejected ${rejectedUserName}'s answer and created a new answer.`;
    }

    if (
      submission.status === "in-review" &&
      !submission.answer &&
      !submission.approvedAnswer &&
      !submission.rejectedAnswer
    ) {
      const reviewingEntry = history.find(
        (h) => h.answer && h.status !== "rejected" && h.status !== "approved"
      );
      const reviewingUserName = reviewingEntry?.updatedBy?.name || "someone";
      return `${userName} is currently reviewing ${reviewingUserName}'s answer.`;
    }

    return `${userName} has no recent activity.`;
  };

  useEffect(() => {
    return () => {
      if (hoverTimeout) clearTimeout(hoverTimeout);
    };
  }, [hoverTimeout]);

  const handleRemoveAllocation = useCallback(
    async (index: number) => {
      try {
        setSelectedAllocationIndex(index);
        await removeAllocation({ questionId: question._id, index });
        toast.success("Allocation removed successfully.");
      } catch (error) {
        console.error("Error removing allocation:", error);
        toast.error("Error removing allocation. Please try again.");
      } finally {
        setSelectedAllocationIndex(null);
      }
    },
    [question._id, removeAllocation]
  );

  const submittedUserIds = new Set(
    history
      .filter((entry) => entry.answer || entry.status == "reviewed")
      .map((entry) => entry.updatedBy?._id)
  );

  const submittedUserEmails = new Set(
    history
      .filter((entry) => entry.answer || entry.status == "reviewed")
      .map((entry) => entry.updatedBy?.email)
  );

  // const unSubmittedExpertsCount = queue?.filter(
  //   (q) => !submittedUserIds.has(q._id) && !submittedUserEmails.has(q.email)
  // ).length;

  const nextWaitingIndex = queue?.findIndex(
    (q) => !submittedUserIds.has(q._id) && !submittedUserEmails.has(q.email)
  );
  const getStatus = (index: number) => {
    const user = queue[index];
    const activityText = getUserActivityText(user._id);
    const hasSubmitted =
      submittedUserIds.has(user._id) || submittedUserEmails.has(user.email);

    if (hasSubmitted) {
      if (activityText.includes("created an answer")) {
        return "answerCreated";
      }
      if (activityText.includes("approved")) {
        return "approved";
      }
      if (activityText.includes("rejected")) {
        return "rejected";
      }
      if (activityText.includes("modified")) {
        return "modified";
      }
      return "submitted";
    }

    if (index === nextWaitingIndex) return "waiting";
    return "pending";
  };

  // const getStatus = (index: number) => {
  //   const user = queue[index];
  //   const userActivity = getUserActivityText(user._id);
  //   const hasSubmitted =
  //     submittedUserIds.has(user._id) || submittedUserEmails.has(user.email);

  //   if (hasSubmitted) return "submitted";
  //   if (index === nextWaitingIndex) return "waiting";
  //   return "pending";
  // };

  const displayedQueue = isExpanded
    ? queue
    : queue?.slice(0, INITIAL_DISPLAY_COUNT);
  const hasMore = queue?.length > INITIAL_DISPLAY_COUNT;

  const getStatusStyles = (status: string) => {
    switch (status) {
      case "answerCreated":
        return {
          container:
            "bg-yellow-100 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-700 shadow-yellow-100/50",
          icon: "text-yellow-700 dark:text-yellow-400",
          badge:
            "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border border-yellow-300 dark:border-yellow-700",
          iconBg: "bg-yellow-200 dark:bg-yellow-800/40",
          legendDot: "bg-yellow-500",
        };
      case "approved":
        return {
          container:
            "bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700 shadow-green-100/50",
          icon: "text-green-700 dark:text-green-400",
          badge:
            "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-300 dark:border-green-700",
          iconBg: "bg-green-200 dark:bg-green-800/40",
          legendDot: "bg-green-500",
        };
      case "rejected":
        return {
          container:
            "bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700 shadow-red-100/50",
          icon: "text-red-700 dark:text-red-400",
          badge:
            "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-300 dark:border-red-700",
          iconBg: "bg-red-200 dark:bg-red-800/40",
          legendDot: "bg-red-500",
        };
      case "modified":
        return {
          container:
            "bg-orange-100 dark:bg-orange-900/30 border-orange-300 dark:border-orange-700 shadow-orange-100/50",
          icon: "text-orange-700 dark:text-orange-400",
          badge:
            "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border border-orange-300 dark:border-orange-700",
          iconBg: "bg-orange-200 dark:bg-orange-800/40",
          legendDot: "bg-orange-500",
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
      case "pending":
        return {
          container: "bg-muted/50 border-muted shadow-muted/5",
          icon: "text-muted-foreground",
          badge: "bg-muted/50 text-muted-foreground border border-muted",
          iconBg: "bg-muted",
          legendDot: "bg-muted-foreground/40",
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

  // const getStatusStyles = (status: string) => {
  //   switch (status) {
  //     case "submitted":
  //       return {
  //         container:
  //           "bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700 shadow-green-100/50",
  //         icon: "text-green-700 dark:text-green-400",
  //         badge:
  //           "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-300 dark:border-green-700",
  //         iconBg: "bg-green-200 dark:bg-green-800/40",
  //         legendDot: "bg-green-500",
  //       };
  //     case "waiting":
  //       return {
  //         container:
  //           "bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 shadow-blue-100/50",
  //         icon: "text-blue-700 dark:text-blue-400",
  //         badge:
  //           "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-300 dark:border-blue-700",
  //         iconBg: "bg-blue-200 dark:bg-blue-800/40",
  //         legendDot: "bg-blue-500",
  //       };
  //     default:
  //       return {
  //         container: "bg-muted/50 border-muted shadow-muted/5",
  //         icon: "text-muted-foreground",
  //         badge: "bg-muted/50 text-muted-foreground border border-muted",
  //         iconBg: "bg-muted",
  //         legendDot: "bg-muted-foreground/40",
  //       };
  //   }
  // };

  return (
    <div className="w-full space-y-6 my-6">
      <AllocationQueueHeader
        queue={queue}
        question={question}
        currentUser={currentUser}
      />
      {!displayedQueue || displayedQueue.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed rounded-lg bg-muted/30 dark:bg-muted/10">
          <div className="flex flex-col items-center gap-3 max-w-sm">
            <AlertCircle className="w-10 h-10 text-muted-foreground" />
            <h3 className="text-base font-semibold text-foreground">
              No Experts Allocated
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              This question is currently in a state where no experts are
              assigned to review or answer it. Please allocate experts to allow
              responses and reviews to proceed.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6   transition-all duration-500 ease-in-out">
          {displayedQueue?.map((user, index) => {
            const status = getStatus(index);
            const styles = getStatusStyles(status);
            const isLast = index === displayedQueue?.length - 1;
            const isCurrentUserWaiting =
              status === "waiting" && currentUser.email === user.email;

            return (
              <div
                key={`${user._id}-${index}`}
                className="relative flex flex-col items-center justify-center my-4 group"
              >
                {!isLast && (
                  <div className="absolute top-50 right-36 md:top-1/2 md:right-0 flex items-center transform translate-x-full -translate-y-1/2">
                    <svg
                      className={`w-5 h-5 ml-1 text-gray-300 dark:text-gray-600 hidden md:block ${
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

                    <svg
                      className={`w-5 h-5 ml-1 text-gray-300 dark:text-gray-600 block md:hidden ${
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
                  </div>
                )}

                {/* Overlay for delete */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="absolute w-58 h-48 rounded-md bg-card/80 border opacity-0 group-hover:opacity-30 transition-opacity duration-300"></div>

                  {!(
                    submittedUserIds.has(user._id) ||
                    submittedUserEmails.has(user.email)
                  ) &&
                    !question.isAutoAllocate && (
                      <div className="absolute -top-1 right-3 w-6 h-6 flex items-center justify-center cursor-pointer pointer-events-auto hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10">
                        <ConfirmationModal
                          title="Remove Expert Allocation?"
                          description={`${
                            question.isAutoAllocate
                              ? " Since auto-allocation is enabled , the system will automatically allocate the next available expert immediately after removal. "
                              : ""
                          }${
                            submittedUserIds.has(user._id)
                              ? "The selected expert has already submitted an answer. "
                              : ""
                          }Are you sure you want to remove ${
                            user?.name
                          }'s allocation? This action cannot be undone. `}
                          confirmText="Remove"
                          cancelText="Cancel"
                          type="delete"
                          isLoading={removingAllocation}
                          onConfirm={() => handleRemoveAllocation(index)}
                          trigger={
                            <div className="w-6 h-6 bg-black/10 dark:bg-white/10 backdrop-blur-sm rounded-md flex items-center justify-center cursor-pointer hover:text-red-500">
                              <Trash2 className="w-4 h-4 transition-colors duration-300" />
                            </div>
                          }
                        />
                      </div>
                    )}
                </div>

                <div
                  className="relative w-42 h-42 sm:w-32 sm:h-32 md:w-36 md:h-36 lg:w-44 lg:h-44"
                  style={{ perspective: "1000px" }}
                  onMouseEnter={() => handleMouseEnter(user._id)}
                  onMouseLeave={handleMouseLeave}
                >
                  <div
                    className={`relative w-full h-full transition-transform duration-700 ${
                      isFlipped && flippedId == user._id
                        ? "[transform:rotateY(180deg)]"
                        : ""
                    }`}
                    style={{ transformStyle: "preserve-3d" }}
                  >
                    <div
                      className={`absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 
            rounded-full border-2 transition-all duration-300 hover:shadow-lg hover:scale-105 
            ${styles.container} 
            ${
              isExpanded && index >= INITIAL_DISPLAY_COUNT
                ? "animate-fade-in"
                : ""
            } 
            ${
              isCurrentUserWaiting
                ? "ring-4 ring-blue-400 ring-offset-2 dark:ring-blue-600 dark:ring-offset-gray-900 scale-105"
                : ""
            }`}
                      style={{ backfaceVisibility: "hidden" }}
                    >
                      {removingAllocation &&
                        selectedAllocationIndex === index && (
                          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm rounded-full flex items-center justify-center">
                            <Loader2 className="w-6 h-6 animate-spin text-white/80" />
                          </div>
                        )}
                      <div
                        className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 ${styles.iconBg}`}
                      >
                        {status === "answerCreated" ? (
                          <PlusCircle className={`w-6 h-6 ${styles.icon}`} />
                        ) : status === "approved" ? (
                          <CheckCircle2 className={`w-6 h-6 ${styles.icon}`} />
                        ) : status === "rejected" ? (
                          <RefreshCcw className={`w-6 h-6 ${styles.icon}`} />
                        ) : status === "waiting" ? (
                          <Clock
                            className={`w-6 h-6 ${styles.icon} ${
                              isCurrentUserWaiting
                                ? "animate-bounce-subtle"
                                : ""
                            }`}
                          />
                        ) : (
                          <AlertCircle className={`w-6 h-6 ${styles.icon}`} />
                        )}
                      </div>

                      <div className="text-center w-full px-2">
                        <p
                          className="text-xs font-semibold text-foreground truncate"
                          title={user.name}
                        >
                          {user.name?.slice(0, 15)}
                          {user.name?.length > 15 ? "..." : ""}
                        </p>
                        <p
                          className="text-[10px] text-muted-foreground truncate mt-0.5"
                          title={user.email}
                        >
                          {user.email?.slice(0, 23)}
                          {user.email?.length > 23 ? "..." : ""}
                        </p>
                      </div>

                      <span
                        className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap ${styles.badge}`}
                      >
                        {status === "answerCreated"
                          ? "Answer Created"
                          : status === "approved"
                          ? "Approved"
                          : status === "modified"
                          ? "Modified"
                          : status === "rejected"
                          ? "Rejected"
                          : status === "waiting"
                          ? isCurrentUserWaiting
                            ? "Your Turn"
                            : "Waiting"
                          : "Pending"}
                      </span>
                    </div>

                    <div
                      className="absolute inset-0 flex items-center justify-center rounded-lg border border-border/50 bg-gradient-to-br from-card to-card/95 shadow-lg transition-all duration-300"
                      style={{
                        backfaceVisibility: "hidden",
                        transform: "rotateY(180deg)",
                        boxShadow:
                          "0 20px 25px -5px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
                      }}
                    >
                      <div className="flex flex-col items-center justify-center gap-2 px-4 text-center">
                        <div className="h-1 w-8 rounded-full bg-gradient-to-r from-primary/60 to-primary/20" />
                        <p
                          className="text-sm font-semibold leading-relaxed text-foreground"
                          title={getUserActivityText(user._id)}
                        >
                          {getUserActivityText(user._id)}
                        </p>
                        <div className="h-0.5 w-6 rounded-full bg-gradient-to-r from-primary/20 to-primary/60" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

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
      (h) => h.answer?._id === ans?._id
    );

    return {
      lastAnswerId: answers[0]?._id, // first one will be the last one
      firstAnswerId: answers[answers?.length - 1]?._id, // last one will be the first one
      answer: ans,
      submission,
      createdAt: new Date(ans.createdAt || "").toLocaleString(),
    };
  });

  return (
    <div className="w-full">
      <Timeline
        value={events}
        align="alternate"
        opposite={(item) => (
          <div className="ml-5 flex flex-col gap-1 ">
            {item.submission?.updatedBy && (
              <div className="text-xs text-foreground px-2 py-1 rounded-md">
                <span className="font-medium">By:</span>{" "}
                {item.submission.updatedBy.name} (
                {item.submission.updatedBy.email})
                {item.firstAnswerId === item.submission.answer._id && (
                  <span className="ml-2 px-2 py-0.5 text-[10px] rounded-full bg-blue-100 text-blue-700 font-semibold">
                    Author
                  </span>
                )}
              </div>
            )}

            <small className="text-xs text-muted-foreground mt-1">
              {item.createdAt}
            </small>
          </div>
        )}
        content={(item) => (
          <div className="flex-1 mb-5">
            <AnswerItem
              answer={item.answer}
              lastAnswerId={item.lastAnswerId}
              firstAnswerId={item.firstAnswerId}
              submissionData={item.submission}
              currentUserId={currentUserId}
              questionStatus={question.status}
              questionId={question._id}
              ref={commentRef}
              userRole={userRole}
            />
          </div>
        )}
      />
    </div>
  );
};

interface AnswerItemProps {
  answer: IAnswer;
  currentUserId: string;
  submissionData?: ISubmissionHistory;
  questionId: string;
  lastAnswerId: string;
  firstAnswerId: string;
  userRole: UserRole;
  questionStatus: QuestionStatus;
}

export const AnswerItem = forwardRef((props: AnswerItemProps, ref) => {
  const isMine = props.answer.authorId === props.currentUserId;
  // const [comment, setComment] = useState("");
  // const observer = useRef<IntersectionObserver>(null);
  const LIMIT = 1;
  const {
    // data: commentsData,
    refetch: refetchComments,
    // fetchNextPage,
    // hasNextPage,
    // isFetchingNextPage,
    // isLoading: isLoadingComments,
  } = useGetComments(LIMIT, props.questionId, props.answer._id);

  // const comments =
  //   commentsData?.pages.flatMap((comment) => comment ?? []) ?? [];
  const [editableAnswer, setEditableAnswer] = useState(props.answer.answer);
  const [editOpen, setEditOpen] = useState(false);
  // const { mutateAsync: addComment, isPending: isAddingComment } =
  //   useAddComment();
  const { mutateAsync: updateAnswer, isPending: isUpdatingAnswer } =
    useUpdateAnswer();

  useImperativeHandle(ref, () => {
    refetchComments;
  });

  // const submitComment = async () => {
  //   if (!comment.trim()) return;

  //   try {
  //     await addComment({
  //       questionId: props.questionId,
  //       answerId: props.answer._id!,
  //       text: comment.trim(),
  //     });
  //     setComment("");
  //     toast.success("Comment submitted! Thank you for your input.");
  //   } catch (err) {
  //     console.error("Failed to submit comment:", err);
  //   }
  // };

  // const lastCommentRef = useCallback(
  //   (node: HTMLDivElement | null) => {
  //     if (isFetchingNextPage) return;
  //     if (observer.current) observer.current.disconnect();

  //     observer.current = new IntersectionObserver((entries) => {
  //       if (entries[0].isIntersecting && hasNextPage) {
  //         fetchNextPage();
  //       }
  //     });

  //     if (node) observer.current.observe(node);
  //   },
  //   [isFetchingNextPage, fetchNextPage, hasNextPage]
  // );

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

      toast.success(
        "Answer approved successfully! The question is now closed. Thank you!"
      );
      setEditOpen(false);
    } catch (error) {
      console.error("Failed to edit answer:", error);
      toast.error("Failed to update answer. Please try again.");
      setEditOpen(false);
    }
  };

  const isRejected =
    props.submissionData && props.submissionData.status === "rejected";

  return (
    // <Card className="p-6 grid gap-4">
    //   <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm">
    //     <div className="flex items-center gap-2">
    //       <span className="font-medium text-foreground">
    //         Iteration {props.answer.answerIteration}
    //       </span>
    //       {props.answer.isFinalAnswer && (
    //         <Badge
    //           variant="outline"
    //           className="text-green-600 border-green-600"
    //         >
    //           Final
    //         </Badge>
    //       )}
    //       {isMine && <UserCheck className="w-4 h-4 text-blue-600 ml-1" />}
    //     </div>
    //     <div className="flex items-center justify-center gap-2">
    //       {props.userRole !== "expert" &&
    //         props.questionStatus === "in-review" &&
    //         props.lastAnswerId === props.answer?._id && (
    //           <Dialog open={editOpen} onOpenChange={setEditOpen}>
    //             <DialogTrigger asChild>
    //               <button className="bg-primary text-primary-foreground flex items-center gap-2 px-4 py-2 rounded">
    //                 <CheckCircle2 className="h-4 w-4" />
    //                 Approve Answer
    //               </button>
    //             </DialogTrigger>

    //             <DialogContent
    //               className="w-[90vw] max-w-6xl max-h-[85vh] flex flex-col"
    //               style={{ maxWidth: "70vw" }}
    //             >
    //               <DialogHeader>
    //                 <DialogTitle className="text-lg font-semibold">
    //                   Approve Answer
    //                 </DialogTitle>
    //               </DialogHeader>

    //               <div className="mt-4">
    //                 <Textarea
    //                   value={editableAnswer}
    //                   placeholder="Update answer here..."
    //                   onChange={(e) => setEditableAnswer(e.target.value)}
    //                   className="min-h-[150px] resize-none border border-border bg-background"
    //                 />
    //               </div>
    //               <div
    //                 className="mt-4 p-4 rounded-md border bg-yellow-50 border-yellow-300 text-yellow-900 text-sm
    //             dark:bg-yellow-900/20 dark:border-yellow-700/60 dark:text-yellow-200"
    //               >
    //                 ⚠️ You are about to approve a <strong> answer</strong>.
    //                 Please review your changes carefully before saving to avoid
    //                 mistakes.
    //               </div>

    //               <div className="mt-6 flex justify-end gap-3">
    //                 <Button
    //                   variant="outline"
    //                   onClick={() => setEditOpen(false)}
    //                 >
    //                   Cancel
    //                 </Button>
    //                 <Button
    //                   onClick={handleUpdateAnswer}
    //                   className="bg-primary text-primary-foreground flex items-center gap-2"
    //                   disabled={isUpdatingAnswer}
    //                 >
    //                   {isUpdatingAnswer ? (
    //                     <>
    //                       <Loader2 className="w-4 h-4 animate-spin" />
    //                       Saving...
    //                     </>
    //                   ) : (
    //                     "Save & finalize"
    //                   )}
    //                 </Button>
    //               </div>
    //             </DialogContent>
    //           </Dialog>
    //         )}
    //       {props.answer?.approvalCount !== undefined &&
    //         props.answer?.approvalCount > 0 && (
    //           <p>Approval count: {props.answer.approvalCount}</p>
    //         )}
    //       <Dialog>
    //         <DialogTrigger asChild>
    //           <Button variant="outline" size="sm" className="w-full sm:w-auto ">
    //             <Eye className="w-4 h-4 mr-2" />
    //             View More
    //           </Button>
    //         </DialogTrigger>
    //         <DialogContent
    //           className="w-[90vw] max-w-6xl h-[85vh] flex flex-col"
    //           style={{ maxWidth: "70vw" }}
    //         >
    //           <DialogHeader className="pb-4 border-b">
    //             <DialogTitle className="text-xl font-semibold">
    //               Answer Details
    //             </DialogTitle>
    //           </DialogHeader>

    //           <ScrollArea className="flex-1 h-[85vh] ">
    //             <div className="space-y-6 p-4">
    //               <div className="grid gap-4 text-sm ">
    //                 <div className="flex flex-col sm:flex-row justify-between gap-3">
    //                   <div className="flex items-center gap-4">
    //                     <span className="font-medium">
    //                       Iteration:{" "}
    //                       <span className="text-foreground font-normal">
    //                         {props.answer.answerIteration}
    //                       </span>
    //                     </span>

    //                     <Badge
    //                       variant={
    //                         props.answer.isFinalAnswer ? "default" : "secondary"
    //                       }
    //                       className={
    //                         props.answer.isFinalAnswer
    //                           ? "bg-green-100 text-green-800 hover:bg-green-100"
    //                           : ""
    //                       }
    //                     >
    //                       {props.answer.isFinalAnswer
    //                         ? "Final Answer"
    //                         : "Draft"}
    //                     </Badge>
    //                   </div>

    //                   <div className="flex flex-col text-muted-foreground text-xs">
    //                     <span>
    //                       Submitted At:{" "}
    //                       {new Date(
    //                         props.answer.createdAt || ""
    //                       ).toLocaleString()}
    //                     </span>
    //                   </div>
    //                 </div>

    //                 {props.submissionData?.updatedBy && (
    //                   <div className="rounded-lg border bg-muted/50 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
    //                     <div className="flex items-center gap-2">
    //                       <p className="text-sm font-medium text-foreground">
    //                         Submitted By:{" "}
    //                         <span className="text-sm text-muted-foreground">
    //                           {props.submissionData.updatedBy.name} (
    //                           {props.submissionData.updatedBy.email})
    //                         </span>
    //                       </p>

    //                       {props.answer.threshold > 0 && (
    //                         <Badge
    //                           variant="outline"
    //                           className="text-foreground border border-muted-foreground w-fit flex items-center gap-1"
    //                         >
    //                           <span className="font-medium">Correctness:</span>
    //                           <span>
    //                             {Math.round(props.answer.threshold * 100)}%
    //                           </span>
    //                         </Badge>
    //                       )}
    //                     </div>
    //                   </div>
    //                 )}
    //               </div>

    //               <div>
    //                 <p className="text-sm font-medium text-foreground mb-3">
    //                   Answer Content
    //                 </p>
    //                 <div className="rounded-lg border bg-muted/30 h-[40vh]  ">
    //                   <ScrollArea className="h-full">
    //                     <div className="p-4">
    //                       <p className="whitespace-pre-wrap leading-relaxed text-foreground">
    //                         {props.answer.answer}
    //                       </p>
    //                     </div>
    //                   </ScrollArea>
    //                 </div>
    //               </div>

    //               {props.answer.sources?.length > 0 && (
    //                 <div>
    //                   <p className="text-sm font-medium text-foreground mb-3">
    //                     Source URLs
    //                   </p>

    //                   <div className="space-y-2">
    //                     {props.answer.sources.map((source, idx) => (
    //                       <div
    //                         key={idx}
    //                         className="flex items-center justify-between rounded-lg border bg-muted/30 p-2 pr-3"
    //                       >
    //                         <div className="flex items-center gap-2 min-w-0">
    //                           <Tooltip>
    //                             <TooltipTrigger asChild>
    //                               <span
    //                                 className="text-sm truncate max-w-[260px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
    //                                 onClick={() =>
    //                                   window.open(source.source, "_blank")
    //                                 }
    //                               >
    //                                 {source.source}
    //                               </span>
    //                             </TooltipTrigger>
    //                             <TooltipContent>{source.source}</TooltipContent>
    //                           </Tooltip>

    //                           {source.page && (
    //                             <>
    //                               <span className="text-muted-foreground">
    //                                 •
    //                               </span>
    //                               <span className="text-xs text-muted-foreground">
    //                                 page {source.page}
    //                               </span>
    //                             </>
    //                           )}
    //                         </div>
    //                         <a
    //                           href={source.source}
    //                           target="_blank"
    //                           rel="noopener noreferrer"
    //                           className="p-1 rounded hover:bg-muted/20 dark:hover:bg-muted/50 transition-colors"
    //                         >
    //                           <ArrowUpRight className="w-4 h-4 text-foreground/80" />
    //                         </a>
    //                       </div>
    //                     ))}
    //                   </div>
    //                 </div>
    //               )}
    //             </div>
    //           </ScrollArea>
    //         </DialogContent>
    //       </Dialog>
    //     </div>
    //   </div>
    //   {isRejected &&
    //     props.submissionData &&
    //     props.submissionData.reasonForRejection && (
    //       <div className="rounded-lg border border-rejected bg-rejected-bg p-4">
    //         <div className="flex items-start gap-3">
    //           <AlertCircle className="w-5 h-5 text-red-500 dark:text-red-700 mt-0.5 flex-shrink-0" />
    //           <div className="flex-1 space-y-1">
    //             <p className="text-sm font-semibold text-red-500 dark:text-red-700">
    //               This answer was rejected
    //             </p>
    //             <p className="text-sm text-muted-foreground leading-relaxed">
    //               {props.submissionData &&
    //                 props.submissionData.reasonForRejection}
    //             </p>
    //           </div>
    //         </div>
    //       </div>
    //     )}
    //   <div className="rounded-lg border bg-card p-4">
    //     <p className="whitespace-pre-wrap leading-relaxed line-clamp-4 text-card-foreground px-5">
    //       {props.answer.answer}
    //     </p>
    //   </div>

    //   <div className="w-full sm:w-auto">
    //     <Accordion type="single" collapsible className="w-full">
    //       <AccordionItem value="comments" className="border-none">
    //         <AccordionTrigger className="flex items-center gap-2 text-sm font-medium p-3 hover:no-underline hover:bg-muted/50 rounded-lg w-full sm:w-auto justify-between shadow-md shadow-gray-400/30 dark:shadow-gray-900/50">
    //           <div className="flex items-center gap-2">
    //             <MessageSquare className="h-4 w-4 text-muted-foreground" />
    //             <span>Comments</span>
    //             {comments?.length > 0 && (
    //               <Badge
    //                 variant="secondary"
    //                 className="h-5 w-5 p-0 flex items-center justify-center text-xs"
    //               >
    //                 {comments?.length}
    //               </Badge>
    //             )}
    //           </div>
    //         </AccordionTrigger>

    //         <AccordionContent className="p-4">
    //           <div className="space-y-4">
    //             {isLoadingComments ? (
    //               <div className="flex justify-center items-center py-4">
    //                 <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    //               </div>
    //             ) : comments?.length === 0 ? (
    //               <p className="text-sm text-muted-foreground text-center py-4">
    //                 {isMine
    //                   ? "You haven't received any comments on your answer yet."
    //                   : "No comments yet. Be the first to add one!"}
    //               </p>
    //             ) : (
    //               <ScrollArea className="h-[40vh]">
    //                 <div className="space-y-3 p-2">
    //                   {comments?.map((c, idx) => {
    //                     const isLast = idx === comments.length - 1;
    //                     return (
    //                       <div
    //                         key={c._id}
    //                         ref={isLast ? lastCommentRef : null}
    //                         className={`rounded-lg border bg-muted/30 p-3 ${
    //                           idx % 2 === 0 ? "bg-secondary/80" : ""
    //                         }`}
    //                       >
    //                         <div className="flex items-center justify-between mb-1">
    //                           <span className="text-sm  text-muted-foreground">
    //                             {c.userName || "Unknown User"}
    //                           </span>
    //                           <span className="text-xs text-muted-foreground">
    //                             {formatDate(new Date(c.createdAt))}
    //                           </span>
    //                         </div>
    //                         <p className="text-sm ms-2 text-foreground leading-relaxed">
    //                           {c.text}
    //                         </p>
    //                       </div>
    //                     );
    //                   })}
    //                   {isFetchingNextPage && (
    //                     <div className="text-center text-sm text-muted-foreground py-2">
    //                       Loading more...
    //                     </div>
    //                   )}
    //                 </div>
    //               </ScrollArea>
    //             )}
    //             {!isMine && (
    //               <div className="space-y-3 border-t-2 pt-3">
    //                 <Textarea
    //                   placeholder="Add your comment here..."
    //                   value={comment}
    //                   onChange={(e) => setComment(e.target.value)}
    //                   rows={3}
    //                   className="resize-none h-[8vh] md:h-[20vh]"
    //                 />
    //                 <div className="flex justify-end">
    //                   <Button
    //                     onClick={submitComment}
    //                     size="sm"
    //                     className="md:p-2 flex items-center justify-center gap-1"
    //                     disabled={!comment.trim() || isAddingComment}
    //                   >
    //                     {isAddingComment ? (
    //                       <>
    //                         <Loader2 className="w-4 h-4 animate-spin" />
    //                         Submitting...
    //                       </>
    //                     ) : (
    //                       "Submit"
    //                     )}
    //                   </Button>
    //                 </div>
    //               </div>
    //             )}
    //           </div>
    //         </AccordionContent>
    //       </AccordionItem>
    //     </Accordion>
    //   </div>
    // </Card>
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
          {isRejected && (
            <Badge className="bg-rejected text-red-500 dark:text-red-700 border-rejected hover:bg-rejected/90">
              <XCircle className="w-3 h-3 mr-1" />
              Rejected
            </Badge>
          )}
          {!isRejected &&
            props.questionStatus !== "in-review" &&
            props.questionStatus !== "closed" && (
              <Badge
                className="
      bg-amber-50 text-amber-700 border border-amber-100 hover:bg-amber-100
      dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900 dark:hover:bg-amber-900
    "
              >
                <Clock className="w-3 h-3 mr-1 opacity-80" />
                In Review
              </Badge>
            )}

          {isMine && <UserCheck className="w-4 h-4 text-blue-600 ml-1" />}
        </div>
        <div className="flex items-center justify-center gap-2">
          {props.userRole !== "expert" &&
            props.questionStatus === "in-review" &&
            props.lastAnswerId === props.answer?._id && (
              <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogTrigger asChild>
                  <button className="bg-primary text-primary-foreground flex items-center gap-2 px-2 py-2 rounded">
                    <CheckCircle2 className="h-4 w-4" />
                    Approve Answer
                  </button>
                </DialogTrigger>

                <DialogContent
                  className="w-[90vw] max-w-6xl max-h-[85vh] flex flex-col"
                  style={{ maxWidth: "70vw" }}
                >
                  <DialogHeader>
                    <DialogTitle className="text-lg font-semibold">
                      Approve Answer
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
                    ⚠️ You are about to approve a <strong> answer</strong>.
                    Please review your changes carefully before saving to avoid
                    mistakes.
                  </div>

                  <div className="mt-6 flex justify-end gap-3">
                    <Button
                      variant="outline"
                      onClick={() => setEditOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleUpdateAnswer}
                      className="bg-primary text-primary-foreground flex items-center gap-2"
                      disabled={isUpdatingAnswer}
                    >
                      {isUpdatingAnswer ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        "Save & finalize"
                      )}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          {props.answer?.approvalCount !== undefined &&
            props.answer?.approvalCount > 0 && (
              <p>Approval count: {props.answer.approvalCount}</p>
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
              style={{ maxWidth: "70vw" }}
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

                        {/* <Badge
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
                        </Badge> */}

                        {isRejected && (
                          <Badge className="bg-rejected text-red-500 dark:text-red-700">
                            <XCircle className="w-3 h-3 mr-1" />
                            Rejected
                          </Badge>
                        )}
                        {!isRejected &&
                          props.questionStatus !== "in-review" && (
                            <Badge
                              className="
      bg-amber-50 text-amber-700 border border-amber-100 hover:bg-amber-100
      dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900 dark:hover:bg-amber-900
    "
                            >
                              <Clock className="w-3 h-3 mr-1 opacity-80" />
                              In Review
                            </Badge>
                          )}
                      </div>

                      <div className="flex flex-col text-muted-foreground text-xs">
                        <span>
                          Submitted At: {formatDate(props.answer.createdAt!)}
                        </span>
                      </div>
                    </div>

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

                  {isRejected &&
                    props.submissionData &&
                    props.submissionData.reasonForRejection && (
                      <div className="rounded-lg border border-rejected bg-rejected-bg p-4">
                        <div className="flex items-start gap-3">
                          <AlertCircle className="w-5 h-5 text-red-500 dark:text-red-700 mt-0.5 flex-shrink-0" />
                          <div className="flex-1 space-y-2">
                            <p className="text-sm font-semibold text-red-500 dark:text-red-700">
                              Rejection Reason
                            </p>
                            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                              {props.submissionData &&
                                props.submissionData.reasonForRejection}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                  <div>
                    <p className="text-sm font-medium text-foreground mb-3">
                      Answer Content
                    </p>
                    <div className="rounded-lg border bg-muted/30 h-[30vh]  ">
                      <ScrollArea className="h-full">
                        <div className="p-4">
                          <p className=" text-foreground">
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
                        {props.answer.sources.map((source, idx) => (
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

                  {/* Review Timeline */}

                  {props.answer.reviews && props.answer.reviews.length > 0 && (
                    <div className="mt-6">
                      <p className="text-sm font-medium text-foreground mb-3">
                        Review Timeline
                      </p>

                      <div className="space-y-4">
                        {props.answer.reviews.map((review) => (
                          <div
                            key={review._id}
                            className="rounded-lg border bg-muted/30 p-4 space-y-3"
                          >
                            {/* Header */}
                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">
                                  Reviewer:
                                </span>
                                <span className="text-sm text-muted-foreground">
                                  {review.reviewer?.firstName} (
                                  {review.reviewer?.email})
                                </span>
                              </div>

                              <div className="text-xs text-muted-foreground">
                                {formatDate(review.createdAt!)}
                              </div>
                            </div>

                            {/* Action */}
                            <div className="flex items-center gap-2">
                              <Badge
                                variant="outline"
                                className={`
    ${
      review.action === "accepted"
        ? "border-green-600 text-green-600"
        : review.action === "rejected"
        ? "border-red-600 text-red-600"
        : "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border border-orange-300 dark:border-orange-700"
    }
  `}
                              >
                                <span className="flex items-center gap-1">
                                  {review.action === "accepted" && (
                                    <>
                                      <CheckCircle className="w-3 h-3 text-green-600 dark:text-green-400" />
                                      <span>Accepted</span>
                                    </>
                                  )}

                                  {review.action === "rejected" && (
                                    <>
                                      <XCircle className="w-3 h-3 text-red-600 dark:text-red-400" />
                                      <span>Rejected</span>
                                    </>
                                  )}

                                  {review.action === "modified" && (
                                    <>
                                      <Pencil className="w-3 h-3 text-orange-700 dark:text-orange-400" />
                                      <span>Modified</span>
                                    </>
                                  )}
                                </span>
                              </Badge>
                            </div>

                            {/* Parameters */}
                            <div className="space-y-1">
                              <p className="text-xs mb-2 font-medium text-foreground">
                                Parameters
                              </p>
                              <div className="flex flex-wrap gap-2">
                                <div className="flex flex-wrap gap-2">
                                  {Object.entries(review.parameters ?? {}).map(
                                    ([key, value]) => (
                                      <Badge
                                        key={key}
                                        variant="outline"
                                        className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-full border 
                                                    ${
                                                      value
                                                        ? "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700"
                                                        : "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700"
                                                    }
                                                  `}
                                      >
                                        {value ? (
                                          <Check className="w-3 h-3" />
                                        ) : (
                                          <X className="w-3 h-3" />
                                        )}

                                        {
                                          parameterLabels[
                                            key as keyof typeof parameterLabels
                                          ]
                                        }
                                      </Badge>
                                    )
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Reason */}
                            {review.reason && review.reason.trim() !== "" && (
                              <div className="space-y-1">
                                <p className="text-xs font-medium text-foreground">
                                  Reason
                                </p>
                                <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                                  {review.reason}
                                </p>
                              </div>
                            )}
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

      {/* {isRejected &&
        props.submissionData &&
        props.submissionData.reasonForRejection && (
          <div className="rounded-lg border border-rejected bg-rejected-bg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 dark:text-red-700 mt-0.5 flex-shrink-0" />
              <div className="flex-1 space-y-1">
                <p className="text-sm font-semibold text-red-500 dark:text-red-700">
                  This answer was rejected
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {props.submissionData &&
                    props.submissionData.reasonForRejection}
                </p>
              </div>
            </div>
          </div>
        )} */}

      <div className="rounded-lg border bg-card p-4">
        <p className="whitespace-pre-wrap leading-relaxed line-clamp-4 text-card-foreground px-5">
          {props.answer.answer}
        </p>
      </div>
      <CommentsSection
        questionId={props.questionId}
        answerId={props.answer._id!}
        isMine={props.answer.authorId === props.currentUserId}
      />
      {/* <div className="w-full sm:w-auto">
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
                        const isLast = idx === comments!.length - 1;
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
                                {formatDate(new Date(c.createdAt))}
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
      </div> */}
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
  const [sources, setSources] = useState<SourceItem[]>([]);
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
