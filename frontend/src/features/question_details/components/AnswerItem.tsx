// components/AnswerItem.tsx
import { Card } from "@/components/atoms/card";
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
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { toast } from "sonner";
import { AnswerItemHeader } from "./answer_item/AnswerItemHeader";
import { AnswerContent } from "./answer_item/AnswerContent";
import { AnswerActions } from "./answer_item/AnswerActions";
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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedExperts, setSelectedExperts] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Reset to page 1 when search term changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const { mutateAsync: updateAnswer, isPending: isUpdatingAnswer } =
    useUpdateAnswer();
  const { data: usersData, isLoading: isUsersLoading } = useGetAllUsers();
  const { mutateAsync: allocateExpert, isPending: allocatingExperts } =
    useGetReRouteAllocation();
  const { rejectReRoute, isRejecting } = useReRouteRejectQuestion();

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

    const lastReroutedTo = rerouteQuestion?.[0]?.reroutes?.length
      ? rerouteQuestion[0].reroutes[rerouteQuestion[0].reroutes.length - 1]
      : null;

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
      console.error("Failed to reject reroute question:", error);
      const message =
        error?.response?.data?.message ||
        error?.message ||
        "Something went wrong";
      toast.error(message);
    }
  };

  const handleCancel = () => {
    setSelectedExperts([]);
    setIsModalOpen(false);
    setCurrentPage(1);
  };

  const isRejected =
    props.submissionData && props.submissionData.status === "rejected";

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
    usersData?.users.filter(
      (user) => user.role === "expert"
    ) || [];

  const filteredExperts = experts.filter(
    (expert) =>
      expert.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      expert.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const reviews = props.answer.reviews ?? [];

  let firstTrueIndex: number | undefined;
  let firstFalseOrMissingIndex: number | undefined;

  reviews.forEach((review, index) => {
    if (review.reRoutedReview === true) {
      if (firstTrueIndex === undefined) {
        firstTrueIndex = index;
      }
    } else {
      if (firstFalseOrMissingIndex === undefined) {
        firstFalseOrMissingIndex = index;
      }
    }
  });

  return (
    <Card className="p-6 grid gap-4">
      <AnswerItemHeader
        answer={props.answer}
        isMine={isMine}
        isRejected={isRejected}
        submissionData={props.submissionData}
        questionStatus={props.questionStatus}
        lastAnswerId={props.lastAnswerId}
      />

      <AnswerActions
        answer={props.answer}
        userRole={props.userRole}
        questionStatus={props.questionStatus}
        lastAnswerId={props.lastAnswerId}
        lastReroutedTo={lastReroutedTo}
        editOpen={editOpen}
        setEditOpen={setEditOpen}
        editableAnswer={editableAnswer}
        setEditableAnswer={setEditableAnswer}
        sources={sources}
        setSources={setSources}
        isUpdatingAnswer={isUpdatingAnswer}
        handleUpdateAnswer={handleUpdateAnswer}
        isModalOpen={isModalOpen}
        setIsModalOpen={setIsModalOpen}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        comment={comment}
        setComment={setComment}
        isUsersLoading={isUsersLoading}
        filteredExperts={filteredExperts}
        selectedExperts={selectedExperts}
        handleSelectExpert={handleSelectExpert}
        handleSubmit={handleSubmit}
        handleCancel={handleCancel}
        isRejectDialogOpen={isRejectDialogOpen}
        setIsRejectDialogOpen={setIsRejectDialogOpen}
        rejectionReason={rejectionReason}
        setRejectionReason={setRejectionReason}
        handleRejectReRouteAnswer={handleRejectReRouteAnswer}
        isRejected={isRejected}
        submissionData={props.submissionData}
        questionId={props.questionId}
        reviews={reviews}
        firstTrueIndex={firstTrueIndex}
        firstFalseOrMissingIndex={firstFalseOrMissingIndex}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        itemsPerPage={itemsPerPage}
      />

      <AnswerContent answer={props.answer} />

      <CommentsSection
        questionId={props.questionId}
        answerId={props.answer._id!}
        isMine={props.answer.authorId === props.currentUserId}
      />
    </Card>
  );
});
