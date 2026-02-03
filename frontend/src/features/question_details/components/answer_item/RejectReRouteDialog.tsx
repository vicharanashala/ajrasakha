// components/RejectReRouteDialog.tsx
import { Button } from "@/components/atoms/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/atoms/dialog";
import { Textarea } from "@/components/atoms/textarea";
import { Loader2, XCircle } from "lucide-react";

interface RejectReRouteDialogProps {
  isRejectDialogOpen: boolean;
  setIsRejectDialogOpen: (open: boolean) => void;
  rejectionReason: string;
  setRejectionReason: (reason: string) => void;
  handleRejectReRouteAnswer: (reason: string) => void;
  lastReroutedTo: any;
  isRejecting?: boolean;
}

export const RejectReRouteDialog = ({
  isRejectDialogOpen,
  setIsRejectDialogOpen,
  rejectionReason,
  setRejectionReason,
  handleRejectReRouteAnswer,
  lastReroutedTo,
  isRejecting,
}: RejectReRouteDialogProps) => {
  return (
    <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
      <DialogTrigger asChild>
        <button
          disabled={lastReroutedTo?.status !== "pending"}
          className={`
            bg-red-400 text-primary-foreground 
                      flex items-center gap-1.5 sm:gap-2 
                      px-2 py-1 sm:px-3 sm:py-1 
                      rounded-md
                      text-xs sm:text-sm
                      dark:bg-red-900/30 
                      border border-red-300 dark:border-red-700 
                      shadow-sm shadow-red-100/50
                      whitespace-nowrap
                      transition-all duration-200
            ${
              lastReroutedTo?.status !== "pending"
                ? "opacity-50 cursor-not-allowed"
                : "hover:bg-red-500 dark:hover:bg-red-900/50 hover:shadow-md active:scale-95"
            }
          `}
        >
          <XCircle className="w-4 h-4" />
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
          <Button
            variant="outline"
            onClick={() => setIsRejectDialogOpen(false)}
            disabled={isRejecting}
          >
            Cancel
          </Button>
          <Button
            disabled={rejectionReason.length < 8 || isRejecting}
            onClick={() => {
              handleRejectReRouteAnswer(rejectionReason);
            }}
          > 
          {
            isRejecting?
            <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin"/>
            Submitting...
            </>
            :
            "Submit"
          }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
