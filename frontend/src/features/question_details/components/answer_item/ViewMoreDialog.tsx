// components/ViewMoreDialog.tsx
import { Button } from "@/components/atoms/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/atoms/dialog";
import { ScrollArea } from "@/components/atoms/scroll-area";
import type { IAnswer, ISubmissionHistory, QuestionStatus } from "@/types";
import { Eye } from "lucide-react";
import { ViewMoreContent } from "./ViewMoreContent";

interface ViewMoreDialogProps {
  answer: IAnswer;
  submissionData?: ISubmissionHistory;
  isRejected: boolean;
  questionStatus: QuestionStatus;
  lastAnswerId: string;
  reviews: any[];
  firstTrueIndex?: number;
  firstFalseOrMissingIndex?: number;
}

export const ViewMoreDialog = ({
  answer,
  submissionData,
  isRejected,
  questionStatus,
  lastAnswerId,
  reviews,
  firstTrueIndex,
  firstFalseOrMissingIndex,
}: ViewMoreDialogProps) => {
  return (
    <Dialog>
      <div className="flex items-center gap-2 ml-auto text-right">
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="w-full sm:w-auto">
            <Eye className="w-4 h-4 mr-2" />
            View More
          </Button>
        </DialogTrigger>
      </div>

      <DialogContent
        className="w-[90vw] max-w-6xl h-[85vh] flex flex-col"
        style={{ maxWidth: "70vw" }}
      >
        <DialogHeader className="pb-4 border-b">
          <DialogTitle className="text-xl font-semibold">
            Answer Details
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 h-[85vh]">
          <ViewMoreContent
            answer={answer}
            submissionData={submissionData}
            isRejected={isRejected}
            questionStatus={questionStatus}
            lastAnswerId={lastAnswerId}
            reviews={reviews}
            firstTrueIndex={firstTrueIndex}
            firstFalseOrMissingIndex={firstFalseOrMissingIndex}
          />
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
