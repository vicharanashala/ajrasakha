import AvatarComponent from "./avatar-component";
import type { ReRouteStatus, SourceItem } from "@/types";
import { useState } from "react";
import { useUpdateAnswer } from "@/hooks/api/answer/useUpdateAnswer";
import { toast } from "sonner";
import {
  ApproveAnswerDialog,
  clearApproveAnswerDraft,
} from "@/features/question_details/components/answer_item/ApproveAnswerDialog";
import { useGetAllUsers } from "@/hooks/api/user/useGetAllUsers";
import { useGetReRouteAllocation } from "@/hooks/api/question/useGetReRouteAllocation";
import { useGetReRoutedQuestionFullData } from "@/hooks/api/question/useGetReRoutedQuestionFullData";
import { ReRouteDialog } from "@/features/question_details/components/answer_item/ReRouteDialog";
import { useReRouteRejectQuestion } from "@/hooks/api/question/useReRouteRejectQuestion";
import { RejectReRouteDialog } from "@/features/question_details/components/answer_item/RejectReRouteDialog";
import { CommentsSection } from "./comments-section";

export default function SelectedAnswerPanel({
  answer,
  question,
  rerouteQuestion,
  currentUser,
  lastAnswerId,
  userRole,
}) {
  console.log("question ->", question);
  console.log("Answer ->", answer);
  const [editOpen, setEditOpen] = useState(false);
  const [editableAnswer, setEditableAnswer] = useState(answer.answer);
  const [sources, setSources] = useState<SourceItem[]>(answer.sources);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [comment, setComment] = useState("");
  const [selectedExperts, setSelectedExperts] = useState<string[]>([]);

  const [rejectionReason, setRejectionReason] = useState("");
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);

  const { mutateAsync: updateAnswer, isPending: isUpdatingAnswer } =
    useUpdateAnswer();
  const { data: usersData, isLoading: isUsersLoading } = useGetAllUsers();
  const { mutateAsync: allocateExpert, isPending: allocatingExperts } =
    useGetReRouteAllocation();

  const experts =
    (usersData?.users ?? []).filter((user) => user.role === "expert");

  const filteredExperts = experts.filter(
    (expert) =>
      expert.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      expert.email?.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const { refetch: refechrerouteSelectedQuestion } =
    useGetReRoutedQuestionFullData(question._id);

  const { rejectReRoute, isRejecting } = useReRouteRejectQuestion();

  const expert = question.submission.history.find(
    (item) => item.updatedBy?._id === answer.authorId,
  )?.updatedBy;

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

      const answerId = answer._id;

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
        "Answer approved successfully! The question is now closed. Thank you!",
      );
      clearApproveAnswerDraft(question._id);
      setEditOpen(false);
    } catch (error: any) {
      console.error("Failed to edit answer:", error);
      let errorMessage = error?.message || error?.msg || "Unknown error";
      errorMessage = errorMessage.replace(/this answer:.+?,/, "this answer,");
      toast.error(`Failed to Approve answer. ${errorMessage}`);
      setEditOpen(false);
    }
  };

  const lastReroutedTo = rerouteQuestion?.[0]?.reroutes?.length
    ? rerouteQuestion[0].reroutes[rerouteQuestion[0].reroutes.length - 1]
    : null;

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
        questionId: question._id,
        experts: selectedExperts[0],
        moderatorId: currentUser,
        answerId: answer?._id,
        comment: comment.trim(),
        status: "pending" as ReRouteStatus,
      });
      setSelectedExperts([]);
      refechrerouteSelectedQuestion();
      toast.success("You have successfully Re Routed the question");
    } catch (error: any) {
      console.error("Error allocating experts:", error);
      toast.error(
        error?.message || "Failed to allocate experts. Please try again.",
      );
    } finally {
      setIsModalOpen(false);
    }
  };

  const handleSelectExpert = (expertId: string) => {
    setSelectedExperts((prev) =>
      prev.includes(expertId)
        ? prev.filter((id) => id !== expertId)
        : [...prev, expertId],
    );
  };

  const handleCancel = () => {
    setSelectedExperts([]);
    setIsModalOpen(false);
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
      await rejectReRoute({
        reason,
        rerouteId: rerouteId,
        questionId: questionId,
        moderatorId: moderatorId,
        expertId: userId,
        role: "moderator",
      });
      refechrerouteSelectedQuestion();
      toast.success("You have successfully rejected the Re Route Question");
    } catch (error: any) {
      console.error("Failed to reject reroute question:", error);
      const message =
        error?.response?.data?.message ||
        error?.message ||
        "Something went wrong";
      toast.error(message);
    } finally {
      setIsRejectDialogOpen(false);
    }
  };

  const showActions =
    userRole !== "expert" &&
    (question.status === "in-review" || question.status === "re-routed") &&
    lastAnswerId === answer?._id;

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-lg border bg-card flex justify-between">
        <h3 className="font-semibold mb-2">
          <AvatarComponent name={expert.name} image={expert.avatar} />
          {expert.name}({expert.email})
        </h3>
        <p>Allocated time: {new Date(answer.createdAt).toLocaleString()}</p>
        <p>Updated time: {new Date(answer.updatedAt).toLocaleString()}</p>
      </div>
      {/* ANSWER */}
      <div className="p-4 rounded-lg border bg-card">
        <h3 className="font-semibold mb-2">Answer</h3>
        <p className="text-sm whitespace-pre-wrap">{answer.answer}</p>
      </div>

      <div className="p-4 rounded-lg border bg-card">
        <h3 className="font-semibold mb-2">Remarks</h3>
        <p className="text-sm whitespace-pre-wrap">{answer.remarks}</p>
      </div>

      {/* SOURCES */}
      {answer.sources?.length > 0 && (
        <div className="p-4 rounded-lg border bg-card">
          <h3 className="font-semibold mb-2">Sources</h3>
          <ul className="text-sm list-disc ml-5">
            {answer.sources.map((s, i) => {
              const capatalize =
                s.sourceType.charAt(0).toUpperCase() + s.sourceType.slice(1);
              return (
                <li key={i}>
                  <span className="border-gray-400 border-2 rounded-lg bg-gray-400 p-2 mr-5">
                    {capatalize}:&nbsp;{s.sourceName}
                  </span>
                  <a href={s.source} className="text-blue-500">
                    {s.source}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="space-y-4">
        <h3>Review Timeline</h3>
        {answer.reviews?.map((review, index) => {
          const actionClass =
            review.action === "accepted"
              ? "border-green-500 text-green-400 bg-green-500/10"
              : review.action === "rejcted"
                ? "border-red-500 text-red-400 bg-red-500/10"
                : "border-orange-500 text-orange-400 bg-orange-500/10";

          return (
            <div
              key={index}
              className="rounded-2xl border border-border bg-card p-5"
            >
              {/* Top Row */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold">
                    Reviewer:{" "}
                    <span className="font-normal text-muted-foreground">
                      {review.reviewer?.firstName}{" "}
                      {review.reviewer?.lastName || ""}
                      {" ("}
                      {review.reviewer?.email}
                      {")"}
                    </span>
                  </p>
                </div>

                <p className="text-sm text-muted-foreground">
                  Allocated Time:{" "}
                  {new Date(review.createdAt).toLocaleString("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
                {/* <p className="text-sm text-muted-foreground">
                  Updated Time: {new Date(review.updatedAt).toLocaleString("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p> */}
              </div>

              {/* Action Badge */}
              <div className="mt-4">
                <span
                  className={`inline-flex items-center rounded-full border px-4 py-1 text-sm font-medium ${actionClass}`}
                >
                  {review.action === "accepted"
                    ? "✓ Accepted"
                    : review.action === "rejected"
                      ? "✕ Rejected"
                      : "⚡ Modified"}
                </span>
              </div>

              {/* Parameters */}
              <div className="mt-6">
                <p className="mb-3 text-sm font-semibold">Parameters</p>

                <div className="flex flex-wrap gap-3">
                  {Object.entries(review.parameters || {}).map(
                    ([key, value]) => {
                      const formattedKey = key
                        .replace(/([A-Z])/g, " $1")
                        .replace(/^./, (str) => str.toUpperCase());
                      console.log("formattedKey ->", formattedKey);

                      return (
                        <span
                          key={key}
                          className={`inline-flex items-center rounded-full border px-4 py-1 text-sm font-medium ${
                            value
                              ? "border-green-500 text-green-400 bg-green-500/10"
                              : "border-red-500 text-red-400 bg-red-500/10"
                          }`}
                        >
                          {value ? "✓" : "✕"} {formattedKey}
                        </span>
                      );
                    },
                  )}
                </div>
              </div>
              {review.action === "rejected" && review.reason && (
                <div className="mt-5">
                  <p className="mb-2 text-sm font-semibold">Rejection Reason</p>

                  <div className="rounded-xl p-4">
                    <p className="text-sm whitespace-pre-wrap">
                      {review.reason}
                    </p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <CommentsSection
        questionId={question._id}
        answerId={answer._id}
        isMine={answer.authorId === currentUser}
      />
      {/* ACTIONS */}
      <div className="flex gap-3">
        {answer.approvalCount >= 3 && question.status === "in-review" && (
          <ApproveAnswerDialog
            questionId={question._id}
            editOpen={editOpen}
            setEditOpen={setEditOpen}
            editableAnswer={editableAnswer}
            setEditableAnswer={setEditableAnswer}
            sources={sources}
            setSources={setSources}
            isUpdatingAnswer={isUpdatingAnswer}
            handleUpdateAnswer={handleUpdateAnswer}
            lastReroutedTo={lastReroutedTo}
            approvalCount={answer.approvalCount}
          />
        )}
        {(answer.approvalCount >= 3 || showActions) &&
          answer.isFinalAnswer === false && (
            <ReRouteDialog
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
              lastReroutedTo={lastReroutedTo}
              isAllocatingExperts={allocatingExperts}
            />
          )}
      </div>

      {lastReroutedTo?.status === "pending" && (
        <RejectReRouteDialog
          isRejectDialogOpen={isRejectDialogOpen}
          setIsRejectDialogOpen={setIsRejectDialogOpen}
          rejectionReason={rejectionReason}
          setRejectionReason={setRejectionReason}
          handleRejectReRouteAnswer={handleRejectReRouteAnswer}
          isRejecting={isRejecting}
          lastReroutedTo={lastReroutedTo}
        />
      )}
    </div>
  );
}
