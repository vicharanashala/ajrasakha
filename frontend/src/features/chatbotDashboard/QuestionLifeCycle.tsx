import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/atoms/table";

import { History } from "lucide-react";
import { useQuestionLifeCycle } from "./hooks/useActiveUsersAnalytics";

const formatDuration = (ms?: number | null) => {
  if (ms == null) return "-";

  const totalSeconds = Math.floor(ms / 1000);

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${mins}m`;
  }

  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }

  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }

  return `${secs}s`;
};

export function QuestionLifecycleTable({
  open,
  onClose,
  questionId,
}: {
  open: boolean;
  onClose: () => void;
  questionId: string;
}) {
  const {
    data: lifeCycle = [],
    isLoading,
  } = useQuestionLifeCycle(
    questionId,
    open,
  );

  const maxDuration = Math.max(
    ...lifeCycle.map((x) => x.duration || 0),
    1,
  );

  return (
    <Dialog
      open={open}
      onOpenChange={onClose}
    >
      <DialogContent className="!max-w-[80vw] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Question Lifecycle
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="p-6">
              Loading...
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {lifeCycle.map((row, index) => {
                  const percent = row.duration
                    ? (row.duration / maxDuration) * 100
                    : 0;

                  const isSystem =
                    row.user === "System";

                  return (
                    <TableRow key={index}>
                      <TableCell>
                        {row.timestamp
                          ? new Date(
                              row.timestamp,
                            ).toLocaleString("en-IN")
                          : "-"}
                      </TableCell>

                      <TableCell>
                        {row.user}
                      </TableCell>

                      <TableCell>
                        {row.duration ? (
                          <div className="flex items-center gap-3">
                            <div className="h-2 w-40 rounded bg-muted">
                              <div
                                className={`h-2 rounded ${
                                  isSystem
                                    ? "bg-yellow-500"
                                    : "bg-primary"
                                }`}
                                style={{
                                  width: `${percent}%`,
                                }}
                              />
                            </div>

                            {formatDuration(
                              row.duration,
                            )}
                          </div>
                        ) : (
                          "-"
                        )}
                      </TableCell>

                      <TableCell>
                        {row.action}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
