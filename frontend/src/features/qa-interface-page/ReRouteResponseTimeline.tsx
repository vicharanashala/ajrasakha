import type {
  HistoryItem,
  IQuestion,
  IReviewParmeters,
  SourceItem,
  QuestionRerouteRepo
} from "@/types";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  
  MessageCircle,
  
 
  XCircle,
  User,
  Pencil,
 
  History,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/atoms/card";
import { Label } from "../../components/atoms/label";
import { ScrollArea } from "../../components/atoms/scroll-area";
import { QuestionDetailsDialog } from "./QuestionDetailsDialog";
import { ReviewHistoryTimeline } from "./ReviewHistoryTimeline";
import { ReviewResponseDialog } from "./ReviewResponseDialog";


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
  selectedQuestion:string|null,
  setSelectedQuestion:(value: string|null) => void;
  refetchQuestions?: () => void;
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
  setSelectedQuestion,
  refetchQuestions
}: // SourceUrlManager,
ReRouteResponseTimelineProps) => {
  
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

            <h3 className="text-lg font-semibold">Reroute Response</h3>
          </div>

          <QuestionDetailsDialog question={selectedQuestionData} />
        </CardHeader>

        <CardContent className="p-6 py-4 flex-1 flex flex-col overflow-hidden">
          <ScrollArea className="flex-1 pe-4">
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
                          {selectedQuestionData?.history[0]?.moderator?.firstName}{`(${selectedQuestionData.history[0].moderator?.email})`}
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
                          {selectedQuestionData.history[0].reroute?.comment}
                        </p>
                      </div>
                      
                    
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
              selectedQuestionData={selectedQuestionData}
              setSelectedQuestion={setSelectedQuestion}
              refetchQuestions={refetchQuestions}
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