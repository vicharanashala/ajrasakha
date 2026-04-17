import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import { Button } from "@/components/atoms/button";
import { Badge } from "@/components/atoms/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select";
import { Textarea } from "@/components/atoms/textarea";
import { ConfirmationModal } from "./confirmation-modal";
import {
  Trash2,
  MessageSquare,
  Edit2,
  CheckCircle,
  FileText,
  User,
  Shield,
  CheckCircle2,
  XCircle,
  Clock,
  History,
  GitCompare,
  Calendar,
} from "lucide-react";
import { useSoftDeleteRequest } from "@/hooks/api/request/useDeleteRequest";
import { useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback } from "@/components/atoms/avatar";
import type { IRequest, RequestStatus } from "@/types";
import { useGetRequestDiff } from "@/hooks/api/request/useGetRequestDiff";
import { ScrollArea } from "./atoms/scroll-area";
import { useUpdateRequestStatus } from "@/hooks/api/request/useUpdateRequestStatus";
import { toast } from "sonner";
import { Separator } from "./atoms/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./atoms/dialog";
import { ReqDetailsDiff } from "./ReqDetailsDiff";

const initials = (name: string) => {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
};

const getRoleIcon = (role: "admin" | "moderator") => {
  return role === "admin" ? (
    <Shield className="h-4 w-4" />
  ) : (
    <User className="h-4 w-4" />
  );
};

const getStatusIcon = (status: RequestStatus) => {
  switch (status) {
    case "approved":
      return <CheckCircle2 className="h-5 w-5 text-green-600" />;
    case "rejected":
      return <XCircle className="h-5 w-5 text-red-600" />;
    case "in-review":
      return <Clock className="h-5 w-5 text-blue-600" />;
    default:
      return <Clock className="h-5 w-5 text-gray-600" />;
  }
};

const getStatusBadge = (status: RequestStatus) => {
  const variants: Record<RequestStatus, string> = {
    approved:
      "bg-green-500/10 text-green-600 border-green-500/30 dark:bg-green-600/20 dark:text-green-300 dark:border-green-500/50",
    rejected:
      "bg-red-500/10 text-red-600 border-red-500/30 dark:bg-red-600/20 dark:text-red-300 dark:border-red-500/50",
    "in-review":
      "bg-yellow-500/10 text-yellow-600 border-yellow-500/30 dark:bg-yellow-600/20 dark:text-yellow-300 dark:border-yellow-500/50",
    pending:
      "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-700/50",
  };
  const defaultVariant =
    "bg-gray-200/10 text-gray-700 border-gray-200/30 dark:bg-gray-700/20 dark:text-gray-300 dark:border-gray-600/50";
  return (
    <Badge variant="outline" className={variants[status] || defaultVariant}>
      {status.replace("_", " ")}
    </Badge>
  );
};

const statusClass = (status: string) => {
  if (status === "approved")
    return "bg-green-500/10 text-green-600 border-green-500/30 dark:bg-green-600/20 dark:text-green-300 dark:border-green-500/50";
  if (status === "rejected")
    return "bg-red-500/10 text-red-600 border-red-500/30 dark:bg-red-600/20 dark:text-red-300 dark:border-red-500/50";
  if (status === "in-review")
    return "bg-yellow-500/10 text-yellow-600 border-yellow-500/30 dark:bg-yellow-600/20 dark:text-yellow-300 dark:border-yellow-500/50";
  if (status === "pending")
    return "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-700/50";
  return "bg-gray-200/10 text-gray-700 border-gray-200/30 dark:bg-gray-700/20 dark:text-gray-300 dark:border-gray-600/50";
};

interface RequestCardProps {
  req: IRequest;
  isHighlighted?: boolean;
  id?: string;
}

export const RequestCard = ({
  req,
  isHighlighted = false,
  id,
}: RequestCardProps) => {
  const [diffOpen, setDiffOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<RequestStatus>("pending");
  const [response, setResponse] = useState<string>("");
  const [responseOpen, setResponseOpen] = useState(false);

  const { data: requestDiff, isLoading: reqDiffLoading } = useGetRequestDiff(
    diffOpen || responseOpen ? req._id : "",
  );
  const { mutateAsync: updateStatus, isPending: updatingStatus } =
    useUpdateRequestStatus();
  const request = { requestType: req.requestType, diff: requestDiff! };
  const queryClient = useQueryClient();
  const { mutateAsync: softDelete, isPending: deleting } =
    useSoftDeleteRequest();
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  useEffect(() => {}, [isHighlighted, req._id]);

  const handleSubmit = async () => {
    try {
      if (!newStatus || newStatus === req.status) {
        toast.error(
          "Please select a new status different from the current one.",
        );
        return;
      }
      if (!response || response.trim().length < 8) {
        toast.error("Response must be at least 8 characters long.");
        return;
      }
      await updateStatus({ status: newStatus, requestId: req._id, response });
      toast.success("Request updated successfully.");
      setDiffOpen(false);
    } catch (error) {
      console.error("Error updating request:", error);
      toast.error("Failed to update the request. Please try again.");
    }
  };

  return (
    <Card
      className={`group bg-card relative transition-all duration-200 overflow-hidden${
        isHighlighted
          ? "border-primary bg-primary/5 shadow-md ring-2 ring-primary/20"
          : "border-border hover:border-primary/40 hover:shadow-sm"
      }`}
      id={id}
    >
      {isHighlighted && (
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-l-lg"></div>
      )}
      {isHighlighted && (
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent pointer-events-none rounded-lg"></div>
      )}

      <CardHeader className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 pb-2">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar className="size-10 flex-shrink-0">
            <AvatarFallback className="bg-secondary text-secondary-foreground">
              {initials(
                req?.requestedUser?.firstName +
                  " " +
                  req?.requestedUser?.lastName || "",
              )}
            </AvatarFallback>
          </Avatar>
          <div className="space-y-1 min-w-0">
            <CardTitle className="text-sm sm:text-base truncate">
              {req?.requestedUser?.firstName +
                " " +
                req?.requestedUser?.lastName || ""}
            </CardTitle>
            <div className="text-xs sm:text-sm text-muted-foreground">
              {req?.requestType === "question_flag"
                ? "Question Flag"
                : "Others"}
            </div>
          </div>
        </div>

        <span
          className={`px-2 sm:px-3 py-1 rounded-full text-xs font-medium border flex-shrink-0 whitespace-nowrap ${statusClass(req?.status)}`}
        >
          {req?.status?.toUpperCase() || "N/A"}
        </span>

        <ConfirmationModal
          title="Confirm Delete"
          description="Are you sure you want to delete this request? This action cannot be undone."
          confirmText="Delete"
          type="delete"
          open={deleteModalOpen}
          onOpenChange={setDeleteModalOpen}
          isLoading={deleting}
          onConfirm={async () => {
            try {
              await softDelete(req._id);
              queryClient.removeQueries({
                queryKey: ["request_diff", req._id],
              });
              queryClient.invalidateQueries({ queryKey: ["requests"] });
              toast.success("Request deleted successfully.");
              setDeleteModalOpen(false);
            } catch {
              toast.error("Failed to delete request.");
            }
          }}
          trigger={
            <Button
              variant="ghost"
              className="absolute top-0 right-0 h-10 w-10 p-0 flex items-center justify-center rounded-full bg-muted/70 dark:bg-white/10 text-black dark:text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:text-red-500 dark:hover:text-white cursor-pointer !shadow-none border-none z-20"
              disabled={deleting}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          }
        />
      </CardHeader>

      <CardContent className="space-y-2 pt-1 px-4 sm:px-6">
        <div className="text-xs sm:text-sm">
          <div className="font-medium text-xs sm:text-sm">Reason</div>
          <p className="text-muted-foreground line-clamp-2 text-xs sm:text-sm">
            {req.reason}
          </p>
        </div>
        <div className="text-xs text-muted-foreground">
          Created: {new Date(req.createdAt).toLocaleString()}
        </div>

        <div className="flex gap-1 sm:gap-2 justify-end mt-2 flex-wrap sm:flex-nowrap">
          <div className="fixed inset-0 flex items-start justify-center z-50 p-6 pointer-events-none">
            {diffOpen && (
              <Card className="group bg-card w-[90vw] max-w-[95vw] h-[90vh] flex flex-col shadow-xl border border-border pointer-events-auto overflow-hidden">
                <CardHeader className="p-3 sm:p-6 border-b border-border flex flex-col gap-2">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between w-full gap-2 sm:gap-4">
                    <div className="flex items-start gap-2 sm:gap-4 min-w-0">
                      <FileText className="w-4 sm:w-5 h-4 sm:h-5 text-primary flex-shrink-0 mt-1" />
                      <div className="flex flex-col min-w-0">
                        <CardTitle className="text-sm sm:text-base font-semibold break-words">
                          Request Diff & Review
                        </CardTitle>
                        <div className="text-xs sm:text-sm text-muted-foreground flex gap-2 flex-col sm:flex-row mt-1">
                          <span>QuestionId: {req?.entityId}</span>
                          <span>RequestId: {req?._id}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium border ${statusClass(req?.status)}`}
                      >
                        {req?.status?.toUpperCase() || "N/A"}
                      </span>
                    </div>
                  </div>
                  <CardDescription className="text-sm text-muted-foreground">
                    Review the differences and take necessary action on this
                    request.
                  </CardDescription>
                </CardHeader>

                <ScrollArea className="flex-1 p-2 sm:p-4 sm:px-8 bg-muted/30 overflow-y-auto">
                  <ReqDetailsDiff
                    request={request}
                    requestDiffLoading={reqDiffLoading}
                  />
                  <div className="mt-6 px-2">
                    <label className="text-sm font-medium mb-2 flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-muted-foreground" />
                      Query
                    </label>
                    <div className="rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground break-words">
                      {req.reason || "-"}
                    </div>
                  </div>
                  <div className="mt-4 px-2">
                    <label className="text-sm font-medium mb-2 flex items-center gap-2">
                      <Edit2 className="w-4 h-4 text-muted-foreground" />
                      Response
                    </label>
                    <Textarea
                      value={response}
                      onChange={(e) => setResponse(e.target.value)}
                      placeholder="Enter your response here..."
                      className="min-h-[120px] resize-none border border-border bg-background"
                    />
                  </div>
                  <div className="mt-4 px-2">
                    <label className="text-sm font-medium mb-2 flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-muted-foreground" />
                      Change Status
                    </label>
                    <Select
                      onValueChange={(value: RequestStatus) =>
                        setNewStatus(value)
                      }
                    >
                      <SelectTrigger className="w-full sm:w-[220px]">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="in-review">In Review</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </ScrollArea>

                <CardFooter className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 border-t border-border p-3 sm:p-6">
                  <Button
                    variant="outline"
                    className="text-xs sm:text-sm"
                    onClick={() => setDiffOpen(false)}
                  >
                    Cancel
                  </Button>
                  {(req.status == "pending" || req.status == "in-review") && (
                    <Button
                      onClick={handleSubmit}
                      disabled={reqDiffLoading || updatingStatus}
                      className="bg-primary text-primary-foreground text-xs sm:text-sm"
                    >
                      {updatingStatus ? "Submitting..." : "Submit Response"}
                    </Button>
                  )}
                </CardFooter>
              </Card>
            )}

            <Dialog
              open={responseOpen}
              onOpenChange={() => setResponseOpen(false)}
            >
              <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    Review Timeline
                  </DialogTitle>
                  <p className="text-sm text-muted-foreground">
                    Track all review activities and responses for this request
                  </p>
                </DialogHeader>
                <ScrollArea className="h-[500px] pr-4">
                  {requestDiff?.responses.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-[400px] text-center">
                      <MessageSquare className="h-12 w-12 text-muted-foreground opacity-50 mb-3" />
                      <p className="text-sm font-medium text-foreground">
                        No responses yet
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Reviews and responses will appear here
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {requestDiff?.responses.map((response, index) => (
                        <div key={index} className="relative">
                          {index !== requestDiff?.responses.length - 1 && (
                            <div className="absolute left-[18px] top-[40px] bottom-[-24px] w-[2px] border-l-2 border-dashed border-border" />
                          )}
                          <div className="flex gap-4">
                            <div className="flex-shrink-0 w-10 h-10 rounded-full border-2 border-border flex items-center justify-center">
                              {getStatusIcon(response.status)}
                            </div>
                            <div className="flex-1 pb-6">
                              <div className="flex items-start justify-between mb-2">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-foreground">
                                      {response.reviewerName ||
                                        "Unknown Reviewer"}
                                    </span>
                                    <Badge
                                      variant="outline"
                                      className="text-xs capitalize"
                                    >
                                      {getRoleIcon(response.role)}
                                      <span className="ml-1">
                                        {response.role}
                                      </span>
                                    </Badge>
                                  </div>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <Calendar className="h-3 w-3" />
                                    {new Date(
                                      response.reviewedAt || "",
                                    ).toLocaleString()}
                                  </div>
                                </div>
                                {getStatusBadge(response.status)}
                              </div>
                              {response.response && (
                                <>
                                  <Separator className="my-3" />
                                  <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                                      <MessageSquare className="h-3 w-3" />
                                      Response
                                    </div>
                                    <p className="text-sm text-foreground leading-relaxed pl-5 border-l-2 border-primary/20 py-1">
                                      {response.response}
                                    </p>
                                  </div>
                                </>
                              )}
                              <div className="mt-3 text-xs text-muted-foreground flex items-center gap-1">
                                <User className="h-3 w-3" />
                                <span>Reviewer ID: {response.reviewedBy}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </DialogContent>
            </Dialog>
          </div>

          <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-end">
            {req.responses && req.responses.length > 0 && (
              <Button
                variant="outline"
                className="flex items-center justify-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 sm:py-2 text-xs sm:text-sm h-auto sm:h-10"
                onClick={() => setResponseOpen(true)}
              >
                <History className="w-3 sm:w-4 h-3 sm:h-4" />
                <span>View History</span>
              </Button>
            )}
            <Button
              variant="default"
              className="flex items-center justify-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 sm:py-2 text-xs sm:text-sm h-auto sm:h-10"
              onClick={() => setDiffOpen(true)}
            >
              <GitCompare
                className="w-3 sm:w-4 h-3 sm:h-4"
                aria-hidden="true"
              />
              <span>View Diff</span>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
