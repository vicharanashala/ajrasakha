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
import { XCircle } from "lucide-react";

interface RejectReRouteDialogProps {
  isRejectDialogOpen: boolean;
  setIsRejectDialogOpen: (open: boolean) => void;
  rejectionReason: string;
  setRejectionReason: (reason: string) => void;
  handleRejectReRouteAnswer: (reason: string) => void;
  lastReroutedTo: any;
}

export const RejectReRouteDialog = ({
  isRejectDialogOpen,
  setIsRejectDialogOpen,
  rejectionReason,
  setRejectionReason,
  handleRejectReRouteAnswer,
  lastReroutedTo,
}: RejectReRouteDialogProps) => {
  return (
    <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
      <DialogTrigger asChild>
        <button
          disabled={lastReroutedTo?.status !== "pending"}
          className={`bg-red-400 text-primary-foreground flex items-center gap-2 px-2 py-2 rounded bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700 shadow-red-100/50
            ${
              lastReroutedTo?.status !== "pending"
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
          <Button
            variant="outline"
            onClick={() => setIsRejectDialogOpen(false)}
          >
            Cancel
          </Button>
          <Button
            disabled={rejectionReason.length < 8}
            onClick={() => {
              handleRejectReRouteAnswer(rejectionReason);
              setIsRejectDialogOpen(false);
            }}
          >
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
