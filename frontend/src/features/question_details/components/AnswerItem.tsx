import { Button } from "@/components/atoms/button";
import { Card } from "@/components/atoms/card";
import { DialogFooter, DialogHeader } from "@/components/atoms/dialog";
import { Input } from "@/components/atoms/input";
import { ScrollArea } from "@/components/atoms/scroll-area";
import { Textarea } from "@/components/atoms/textarea";
import { SourceUrlManager } from "@/components/source-url-manager";
import { useUpdateAnswer } from "@/hooks/api/answer/useUpdateAnswer";
import { useGetComments } from "@/hooks/api/comment/useGetComments";
import { useGetReRouteAllocation } from "@/hooks/api/question/useGetReRouteAllocation";
import { useReRouteRejectQuestion } from "@/hooks/api/question/useReRouteRejectQuestion";
import { useGetAllUsers } from "@/hooks/api/user/useGetAllUsers";
import type {
  IAnswer,
  IRerouteHistoryResponse,
  ISubmission,
  ISubmissionHistory,
  QuestionStatus,
  ReRouteStatus,
  SourceItem,
  UserRole,
} from "@/types";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/atoms/dialog";
import {
  AlertCircle,
  ArrowUpRight,
  Badge,
  Check,
  CheckCircle,
  CheckCircle2,
  Clock,
  Eye,
  Loader2,
  Pencil,
  Send,
  User,
  UserCheck,
  UserPlus,
  X,
  XCircle,
} from "lucide-react";
import { forwardRef, useImperativeHandle, useState } from "react";
import { Label } from "@/components/atoms/label";
import { toast } from "sonner";
import { Checkbox } from "@/components/atoms/checkbox";
import { formatDate } from "@/utils/formatDate";
import { ExpandableText } from "@/components/expandable-text";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/atoms/tooltip";
import { parameterLabels } from "@/components/QA-interface";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/atoms/accordion";
import { renderModificationDiff } from "./renderModificationDiff";
import { CommentsSection } from "@/components/comments-section";

interface AnswerItemProps {
  answer: IAnswer;
  currentUserId: string | undefined;
  submissionData?: ISubmissionHistory;
  questionId: string;
  lastAnswerId: string;
  firstAnswerId: string;
  userRole: UserRole;
  questionStatus: QuestionStatus;
  queue: ISubmission["queue"];
  rerouteQuestion?: IRerouteHistoryResponse[];
}
export const AnswerItem = forwardRef((props: AnswerItemProps, ref) => {
  const [sources, setSources] = useState<SourceItem[]>(props.answer.sources);
  const isMine = props.answer.authorId === props.currentUserId;

  const LIMIT = 1;
  const { refetch: refetchComments } = useGetComments(
    LIMIT,
    props.questionId,
    props.answer._id
  );

  const [editableAnswer, setEditableAnswer] = useState(props.answer.answer);
  const [editOpen, setEditOpen] = useState(false);

  const { mutateAsync: updateAnswer, isPending: isUpdatingAnswer } =
    useUpdateAnswer();

  useImperativeHandle(ref, () => {
    refetchComments;
  });

  const handleUpdateAnswer = async () => {
    try {
      if (!editableAnswer || editableAnswer.trim().length <= 3) {
        toast.error("Updated answer should be at least more than 3 characters");
        return;
      }

      if (sources.length <= 0) {
        toast.error("Updated answer should contain atleast 1 source");
        return;
      }

      const answerId = props.answer._id;

      if (!answerId) {
        toast.error("Answer ID not found. Cannot update.");
        return;
      }

      await updateAnswer({
        updatedAnswer: editableAnswer,
        sources,
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

  const { data: usersData, isLoading: isUsersLoading } = useGetAllUsers();
  const { mutateAsync: allocateExpert, isPending: allocatingExperts } =
    useGetReRouteAllocation();

  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  //  const expertsIdsInQueue = new Set(props.queue?.map((expert) => expert._id));
  const [selectedExperts, setSelectedExperts] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const reroutedExpertIds =
    props.rerouteQuestion?.flatMap((item) =>
      item.reroutes.map((r) => r.reroutedTo._id)
    ) ?? [];

  const expertsIdsInQueue = new Set<string>([...reroutedExpertIds]);
  const lastReroutedTo = props.rerouteQuestion?.[0]?.reroutes?.length
    ? props.rerouteQuestion[0].reroutes[
        props.rerouteQuestion[0].reroutes.length - 1
      ]
    : null;

  const experts =
    usersData?.users.filter((user) => user.role === "expert") || [];

  const filteredExperts = experts.filter(
    (expert) =>
      expert.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      expert.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelectExpert = (expertId: string) => {
    setSelectedExperts((prev) =>
      prev.includes(expertId)
        ? prev.filter((id) => id !== expertId)
        : [...prev, expertId]
    );
  };

  const handleSubmit = async () => {
    if (selectedExperts.length === 0) {
      toast.error("Please select an expert.");
      return;
    }

    if (!comment.trim()) {
      toast.error("Comments are required.");
      return;
    }

    try {
      await allocateExpert({
        questionId: props.questionId,
        experts: selectedExperts[0],
        moderatorId: props.currentUserId,
        answerId: props.answer?._id,
        comment: comment.trim(),
        status: "pending" as ReRouteStatus,
      });
      toast.success("You have successfully Re Routed the question");
      setSelectedExperts([]);
      setIsModalOpen(false);
    } catch (error: any) {
      console.error("Error allocating experts:", error);
      toast.error(
        error?.message || "Failed to allocate experts. Please try again."
      );
    }
  };
  const [rejectionReason, setRejectionReason] = useState("");
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const { rejectReRoute, isRejecting } = useReRouteRejectQuestion();
  const handleRejectReRouteAnswer = async (reason: string) => {
    if (reason.trim() === "") {
      toast.error("No reason provided for rejection");
      return;
    }
    if (reason.length < 8) {
      toast.error("Rejection reason must be atleast 8 letters");
      return;
    }
    const rerouteQuestion = props.rerouteQuestion;

    if (!rerouteQuestion || rerouteQuestion.length === 0) {
      console.warn("No reroute question available");
      return;
    }
    if (!lastReroutedTo) {
      console.warn("No reroute info found");
      return;
    }

    const questionId = rerouteQuestion[0].questionId;
    const rerouteId = rerouteQuestion[0]._id;
    const moderatorId = lastReroutedTo.reroutedTo._id;
    const userId = lastReroutedTo.reroutedTo._id;

    try {
      let result = await rejectReRoute({
        reason,
        rerouteId: rerouteId,
        questionId: questionId,
        moderatorId: moderatorId,
        expertId: userId,
        role: "moderator",
      });
      console.log("the result coming====", result);
      toast.success("You have successfully rejected the Re Route Question");
    } catch (error: any) {
      // ✅ NOW you will see backend error
      console.error("Failed to reject reroute question:", error);

      const message =
        error?.response?.data?.message ||
        error?.message ||
        "Something went wrong";

      toast.error(message);
    }

    // 🔥 call mutation / API here
    // rejectReRouteMutation.mutate(payload);
  };

  const handleCancel = () => {
    setSelectedExperts([]);
    setIsModalOpen(false);
  };
  const reviews = props.answer.reviews ?? [];

  let firstTrueIndex: number | undefined;
  let firstFalseOrMissingIndex: number | undefined;

  reviews.forEach((review, index) => {
    if (review.reRoutedReview === true) {
      if (firstTrueIndex === undefined) {
        firstTrueIndex = index;
      }
    } else {
      // false OR undefined OR null
      if (firstFalseOrMissingIndex === undefined) {
        firstFalseOrMissingIndex = index;
      }
    }
  });

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

          {isRejected && !props.submissionData?.isReroute && (
            <Badge className="bg-rejected text-red-500 dark:text-red-700 border-rejected hover:bg-rejected/90">
              <XCircle className="w-3 h-3 mr-1" />
              Rejected
            </Badge>
          )}
          {props.submissionData?.isReroute &&
            props.submissionData?.status == "rejected" &&
            props.lastAnswerId != props.answer?._id && (
              <Badge className="bg-rejected text-red-500 dark:text-red-700 border-rejected hover:bg-rejected/90">
                <XCircle className="w-3 h-3 mr-1" />
                Rejected
              </Badge>
            )}
          {(props.questionStatus === "in-review" ||
            props.questionStatus === "re-routed") &&
            props.lastAnswerId === props.answer?._id && (
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

          {!isRejected &&
            !props?.submissionData?.rejectedAnswer &&
            props.questionStatus !== "in-review" &&
            props.questionStatus !== "re-routed" &&
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
            (props.questionStatus === "in-review" ||
              props.questionStatus === "re-routed") &&
            props.lastAnswerId === props.answer?._id && (
              <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogTrigger asChild>
                  <button
                    disabled={
                      lastReroutedTo?.status === "pending" ||
                      props.answer.approvalCount < 3
                    }
                    className={`bg-primary text-primary-foreground flex items-center gap-2 px-2 py-2 rounded
                    ${
                      lastReroutedTo?.status === "pending" ||
                      props.answer.approvalCount < 3
                        ? "opacity-50 cursor-not-allowed"
                        : "hover:bg-primary/90"
                    }
                  `}
                  >
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
                    <SourceUrlManager
                      sources={sources}
                      onSourcesChange={setSources}
                      className="py-3"
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
          {props.userRole !== "expert" &&
            (props.questionStatus === "in-review" ||
              props.questionStatus === "re-routed") &&
            props.lastAnswerId === props.answer?._id && (
              <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogTrigger asChild>
                  <button
                    disabled={lastReroutedTo?.status === "pending"}
                    className={`bg-primary text-primary-foreground flex items-center gap-2 px-2 py-2 rounded
                    ${
                      lastReroutedTo?.status === "pending"
                        ? "opacity-50 cursor-not-allowed"
                        : "hover:bg-primary/90"
                    }
                  `}
                  >
                    <Send className="h-4 w-4" />
                    Re Route
                  </button>
                </DialogTrigger>

                <DialogContent
                  className="
                        w-[95vw]                 
                        sm:max-w-xl              
                        md:max-w-4xl             
                        lg:max-w-6xl             
                        max-h-[85vh]             
                        min-h-[60vh]             
                        h-[85vh]              /* 🔑 fixed height */
                        flex flex-col        
                        p-4                       
                      "
                >
                  <div className="mt-4 space-y-2">
                    <Label htmlFor="reject-comment">
                      Comments <span className="text-red-500">*</span>
                    </Label>
                    <Textarea
                      id="reject-comment"
                      placeholder="Enter reason for rejection..."
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      className="min-h-[100px]"
                      required
                    />
                  </div>
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
                              disabled={
                                expert.isBlocked ||
                                (selectedExperts.length > 0 &&
                                  !selectedExperts.includes(expert._id))
                              }
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
                    <Button
                      onClick={handleSubmit}
                      disabled={selectedExperts.length === 0 || !comment.trim()}
                    >
                      {`Submit (${selectedExperts.length} selected)`}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}

          {props.userRole !== "expert" &&
            (props.questionStatus === "in-review" ||
              props.questionStatus === "re-routed") &&
            props.lastAnswerId === props.answer?._id &&
            lastReroutedTo?.status == "pending" && (
              <Dialog
                open={isRejectDialogOpen}
                onOpenChange={setIsRejectDialogOpen}
              >
                <DialogTrigger asChild>
                  <button
                    disabled={lastReroutedTo?.status != "pending"}
                    className={`bg-red-400 text-primary-foreground flex items-center gap-2 px-2 py-2 rounded bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700 shadow-red-100/50
                    ${
                      lastReroutedTo?.status != "pending"
                        ? "opacity-50 cursor-not-allowed"
                        : "hover:bg-red/90"
                    }
                  `}
                  >
                    <XCircle className="w-3 h-3" />
                    Reject ReRoute
                  </button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Rejection Reason *</DialogTitle>
                  </DialogHeader>
                  <Textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    rows={10}
                    className="mt-2 h-[30vh]"
                    placeholder="Write your reason..."
                  />

                  <DialogFooter className="mt-4 gap-2">
                    {/* Cancel */}
                    <Button
                      variant="outline"
                      onClick={() => setIsRejectDialogOpen(false)}
                    >
                      Cancel
                    </Button>

                    {/* Submit */}
                    <Button
                      disabled={rejectionReason.length < 8}
                      onClick={() => {
                        handleRejectReRouteAnswer(rejectionReason);
                        setIsRejectDialogOpen(false);
                      }}
                    >
                      {"Submit"}
                    </Button>
                  </DialogFooter>
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

                        {props?.submissionData?.rejectedAnswer && (
                          <Badge className="bg-rejected text-red-500 dark:text-red-700 border-rejected hover:bg-rejected/90">
                            <XCircle className="w-3 h-3 mr-1" />
                            Rejected
                          </Badge>
                        )}
                        {isRejected && !props.submissionData?.isReroute && (
                          <Badge className="bg-rejected text-red-500 dark:text-red-700 border-rejected hover:bg-rejected/90">
                            <XCircle className="w-3 h-3 mr-1" />
                            Rejected
                          </Badge>
                        )}
                        {props.submissionData?.isReroute &&
                          props.submissionData?.status == "rejected" &&
                          props.lastAnswerId != props.answer?._id && (
                            <Badge className="bg-rejected text-red-500 dark:text-red-700 border-rejected hover:bg-rejected/90">
                              <XCircle className="w-3 h-3 mr-1" />
                              Rejected
                            </Badge>
                          )}
                        {(props.questionStatus === "in-review" ||
                          props.questionStatus === "re-routed") &&
                          props.lastAnswerId === props.answer?._id && (
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

                        {!isRejected &&
                          !props?.submissionData?.rejectedAnswer &&
                          props.questionStatus !== "in-review" &&
                          props.questionStatus !== "re-routed" &&
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
                              {props.submissionData.updatedBy?.name}
                              {props.submissionData.updatedBy?.email && (
                                <> ({props.submissionData.updatedBy.email})</>
                              )}
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

                  <div>
                    {props.answer.remarks && (
                      <div className="p-3 rounded-md bg-muted/20 border text-sm">
                        <p className="text-sm font-semibold text-muted-foreground mb-1">
                          Remarks:
                        </p>

                        <div className="text-foreground text-sm">
                          <ExpandableText
                            text={props.answer.remarks}
                            maxLength={120}
                          />
                        </div>
                      </div>
                    )}
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
                      <div className="space-y-4">
                        {props.answer.reviews.map((review, index) => {
                          const modification =
                            review?.answer?.modifications?.find(
                              (mod) => mod.modifiedBy === review.reviewerId
                            );

                          return (
                            <div>
                              {index === firstTrueIndex && (
                                <p className="text-sm font-medium text-purple-600 mb-2">
                                  ReRoute Timeline
                                </p>
                              )}

                              {index === firstFalseOrMissingIndex && (
                                <p className="text-sm font-medium text-blue-600 mb-2">
                                  Review Timeline
                                </p>
                              )}
                              <div
                                key={review._id}
                                className="rounded-lg border bg-muted/30 p-4 space-y-3"
                              >
                                {/* Reviewer + Date */}
                                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium">
                                      Reviewer:
                                    </span>
                                    <span className="text-sm text-muted-foreground">
                                      {review.reviewer?.firstName}
                                      {review.reviewer?.email && (
                                        <> ({review.reviewer.email})</>
                                      )}
                                    </span>
                                  </div>

                                  <div className="text-xs text-muted-foreground">
                                    {formatDate(review.createdAt!)}
                                  </div>
                                </div>

                                {/* Action Badge */}
                                <div className="flex items-center gap-2">
                                  <Badge
                                    variant="outline"
                                    className={
                                      review.action === "accepted"
                                        ? "border-green-600 text-green-600"
                                        : review.action === "rejected"
                                          ? "border-red-600 text-red-600"
                                          : "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border border-orange-300 dark:border-orange-700"
                                    }
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
                                    {Object.entries(
                                      review.parameters ?? {}
                                    ).map(([key, value]) => (
                                      <Badge
                                        key={key}
                                        variant="outline"
                                        className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-full border ${
                                          value
                                            ? "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700"
                                            : "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700"
                                        }`}
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
                                    ))}
                                  </div>
                                </div>

                                {/* Reason */}
                                {review.reason &&
                                  review.reason.trim() !== "" && (
                                    <div className="space-y-1">
                                      <p className="text-xs font-medium text-foreground">
                                        Reason
                                      </p>
                                      <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                                        {review.reason}
                                      </p>
                                    </div>
                                  )}

                                {/* Modification Accordion */}
                                {review.action === "modified" &&
                                  modification && (
                                    <div className="mt-3">
                                      <Accordion
                                        type="single"
                                        collapsible
                                        className="w-full"
                                      >
                                        <AccordionItem
                                          value={`mod-details-${review._id}`}
                                        >
                                          <AccordionTrigger className="text-sm font-medium">
                                            View Modification Details
                                          </AccordionTrigger>

                                          <AccordionContent>
                                            {renderModificationDiff(
                                              modification
                                            )}
                                          </AccordionContent>
                                        </AccordionItem>
                                      </Accordion>
                                    </div>
                                  )}
                              </div>
                            </div>
                          );
                        })}
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
      <CommentsSection
        questionId={props.questionId}
        answerId={props.answer._id!}
        isMine={props.answer.authorId === props.currentUserId}
      />
    </Card>
  );
});
