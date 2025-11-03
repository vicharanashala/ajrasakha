import { useState } from "react";
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

import { Avatar, AvatarFallback } from "@/components/atoms/avatar";
import { cn } from "@/lib/utils";
import type { IDetailedQuestion, IRequest, RequestStatus } from "@/types";
import { useGetAllRequests } from "@/hooks/api/request/useGetAllRequest";
import { Pagination } from "./pagination";
import {
  Sliders,
  Circle,
  Layers,
  Calendar,
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
} from "lucide-react";
import { useGetRequestDiff } from "@/hooks/api/request/useGetRequestDiff";
import { Skeleton } from "./atoms/skeleton";
import { ScrollArea } from "./atoms/scroll-area";
import { useUpdateRequestStatus } from "@/hooks/api/request/useUpdateRequestStatus";
import {toast} from "sonner";
import { Separator } from "./atoms/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./atoms/dialog";

type SortOrder = "newest" | "oldest";

const statusOptions: Array<{ label: string; value: "all" | RequestStatus }> = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "In Review", value: "in-review" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
];

const typeOptions = [
  { label: "All", value: "all" },
  { label: "Question Flag", value: "question_flag" },
  { label: "Others", value: "others" },
] as const;

const initials = (name: string) => {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
};

const RequestCard = ({ req }: { req: IRequest }) => {
  const [diffOpen, setDiffOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<RequestStatus>("pending");
  const [response, setResponse] = useState<string>("");
  const [responseOpen, setResponseOpen] = useState(false);

  const { data: requestDiff, isLoading: reqDiffLoading } = useGetRequestDiff(
    req._id
  );

  const { mutateAsync: updateStatus, isPending: updatingStatus } =
    useUpdateRequestStatus();

  const request = {
    requestType: req.requestType,
    diff: requestDiff!,
  };

  const handleSubmit = async () => {
    try {
      if (!newStatus || newStatus === req.status) {
        toast.error(
          "Please select a new status different from the current one."
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

  return (
    <Card className="bg-card">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Avatar className="size-10">
            <AvatarFallback className="bg-secondary text-secondary-foreground">
              {initials(req?.userName || "")}
            </AvatarFallback>
          </Avatar>
          <div className="space-y-1">
            <CardTitle className="text-base">{req.userName}</CardTitle>
            <div className="text-sm text-muted-foreground">
              {req.requestType === "question_flag" ? "Question Flag" : "Others"}
            </div>
          </div>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-xs font-medium border ${
            req?.status === "approved"
              ? "bg-green-500/10 text-green-600 border-green-500/30 dark:bg-green-600/20 dark:text-green-300 dark:border-green-500/50"
              : req?.status === "rejected"
              ? "bg-red-500/10 text-red-600 border-red-500/30 dark:bg-red-600/20 dark:text-red-300 dark:border-red-500/50"
              : req?.status === "in-review"
              ? "bg-yellow-500/10 text-yellow-600 border-yellow-500/30 dark:bg-yellow-600/20 dark:text-yellow-300 dark:border-yellow-500/50"
              : req?.status === "pending"
              ? "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-700/50"
              : "bg-gray-200/10 text-gray-700 border-gray-200/30 dark:bg-gray-700/20 dark:text-gray-300 dark:border-gray-600/50"
          }`}
        >
          {req?.status?.toUpperCase() || "N/A"}
        </span>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-sm">
          <div className="font-medium">Reason</div>
          <p className="text-muted-foreground line-clamp-2">{req.reason}</p>
        </div>
        <div className="text-xs text-muted-foreground">
          Created: {new Date(req.createdAt).toLocaleString()}
        </div>
        <div className="flex gap-2 justify-end">
          <div className="fixed inset-0 flex items-start justify-center z-50 p-6 pointer-events-none">
            {diffOpen && (
              <Card className="bg-card w-[90vw] max-w-[95vw] h-[90vh] flex flex-col shadow-xl border border-border pointer-events-auto overflow-hidden">
                <CardHeader className="p-6 border-b border-border flex flex-col gap-2">
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-4">
                      <FileText className="w-5 h-5 text-primary" />
                      <div className="flex flex-col">
                        <CardTitle className="text-base font-semibold">
                          Request Diff & Review
                        </CardTitle>
                        <div className="text-sm text-muted-foreground flex gap-2">
                          <span>EntityId: {req?.entityId}</span>
                          <span>RequestId: {req?._id}</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium border ${
                          req?.status === "approved"
                            ? "bg-green-500/10 text-green-600 border-green-500/30 dark:bg-green-600/20 dark:text-green-300 dark:border-green-500/50"
                            : req?.status === "rejected"
                            ? "bg-red-500/10 text-red-600 border-red-500/30 dark:bg-red-600/20 dark:text-red-300 dark:border-red-500/50"
                            : req?.status === "in-review"
                            ? "bg-yellow-500/10 text-yellow-600 border-yellow-500/30 dark:bg-yellow-600/20 dark:text-yellow-300 dark:border-yellow-500/50"
                            : req?.status === "pending"
                            ? "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-700/50"
                            : "bg-gray-200/10 text-gray-700 border-gray-200/30 dark:bg-gray-700/20 dark:text-gray-300 dark:border-gray-600/50"
                        }`}
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

                <ScrollArea className="flex-1 p-4 px-8 bg-muted/30 overflow-y-auto">
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
                      <SelectTrigger className="w-[220px]">
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

                <CardFooter className="flex justify-end gap-3 border-t border-border p-6">
                  <Button variant="outline" onClick={() => setDiffOpen(false)}>
                    Cancel
                  </Button>
                  {(req.status == "pending" || req.status == "in-review") && (
                    <Button
                      onClick={handleSubmit}
                      disabled={reqDiffLoading || updatingStatus}
                      className="bg-primary text-primary-foreground"
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
                          {/* Timeline connector */}
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
                                      response.reviewedAt || ""
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
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              className="flex items-center justify-center gap-2"
              onClick={() => setResponseOpen(true)}
            >
              <History className="w-4 h-4" aria-hidden="true" />
              <span>View History</span>
            </Button>

            <Button
              variant="default"
              className="flex items-center justify-center gap-2"
              onClick={() => setDiffOpen(true)}
            >
              <GitCompare className="w-4 h-4" aria-hidden="true" />
              <span>View Diff</span>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export const RequestsPage = () => {
  const [status, setStatus] = useState<"all" | RequestStatus>("all");
  const [reqType, setReqType] = useState<"all" | "question_flag" | "others">(
    "all"
  );
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [currentPage, setCurrentPage] = useState(1);
  const LIMIT = 10;

  const { data: requestData, isLoading } = useGetAllRequests(
    currentPage,
    LIMIT,
    status,
    reqType,
    sortOrder
  );
  return (
    <main className="mx-auto w-full  pt-2 md:p-6 md:pt-0">
      <section className="mx-auto w-full p-4 pt-2 md:p-6 md:pt-0">
        <section className="mb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-semibold text-pretty">Request Queue</h1>
          </div>

          <div className="flex gap-2 flex-wrap md:flex-nowrap w-full md:w-auto">
            <div className="flex-1 min-w-[180px]">
              <label className="text-sm font-medium mb-1 flex items-center gap-1">
                <Circle className="w-4 h-4 text-primary" />
                <span className="">Status</span>
              </label>
              <Select value={status} onValueChange={(v) => setStatus(v as any)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 min-w-[180px]">
              <label className="text-sm font-medium mb-1 flex items-center gap-1">
                <Layers className="w-4 h-4 text-primary" />
                <span className="">Request Type</span>
              </label>
              <Select
                value={reqType}
                onValueChange={(v) => setReqType(v as any)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  {typeOptions.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 min-w-[180px]">
              <label className="text-sm font-medium mb-1 flex items-center gap-1">
                <Calendar className="w-4 h-4 text-primary" />
                <span className="">Sort By</span>
              </label>
              <Select
                value={sortOrder}
                onValueChange={(v) => setSortOrder(v as SortOrder)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Newest" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Created (Newest)</SelectItem>
                  <SelectItem value="oldest">Created (Oldest)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>
      </section>

      <section 
      className="grid gap-6 place-content-center  p-4"
      style={{
        gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))",
       // overflowWrap: "break-word",
        WebkitOverflowScrolling: "touch",
      }}
      >
        {isLoading ? (
          <div className="col-span-full flex justify-center py-10">
            <span className="text-muted-foreground">Loading requests...</span>
          </div>
        ) : !requestData?.requests || requestData.requests.length === 0 ? (
          <div className="col-span-full flex justify-center py-10">
            <span className="text-muted-foreground">No requests found.</span>
          </div>
        ) : (
          requestData.requests.map((req) => (
            <RequestCard key={String(req._id)} req={req} />
          ))
        )}
      </section>

      {(requestData?.totalCount || 0) > LIMIT && (
        <Pagination
          currentPage={currentPage}
          totalPages={requestData?.totalPages || 0}
          onPageChange={(page) => setCurrentPage(page)}
        />
      )}
    </main>
  );
};

type QuestionFlagDiff = {
  currentDoc: IDetailedQuestion | null;
  existingDoc: IDetailedQuestion | null;
};

type RequestLike = {
  requestType: string;
  diff?: QuestionFlagDiff;
};

export const ReqDetailsDiff = ({
  request,
  requestDiffLoading,
  className,
  title = "Request Diff",
}: {
  request: RequestLike;
  requestDiffLoading: boolean;
  className?: string;
  title?: string;
}) => {
  if (requestDiffLoading) {
    return (
      <section
        aria-busy="true"
        aria-live="polite"
        className={["w-full rounded border bg-card p-4", className]
          .filter(Boolean)
          .join(" ")}
      >
        <header className="mb-3">
          <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
        </header>
        <div className="flex flex-col gap-2">
          <Skeleton />
          <Skeleton />
          <Skeleton />
          <Skeleton className="w-2/3" />
        </div>
      </section>
    );
  }

  if (request?.requestType !== "question_flag" || !request?.diff) {
    return null;
  }
  const { existingDoc, currentDoc } = request.diff;
  if (!existingDoc || !currentDoc) return null;
  const changes = diffQuestion(existingDoc, currentDoc);
  const allFields = changes.sort((a, b) => {
    if (a.path === "question") return -1;
    if (b.path === "question") return 1;

    const aIsDetails = a.path.startsWith("details");
    const bIsDetails = b.path.startsWith("details");
    if (aIsDetails && !bIsDetails) return 1;
    if (!aIsDetails && bIsDetails) return -1;

    return a.path.localeCompare(b.path);
  });
  return (
    <section
      className={`w-full rounded border bg-card p-4`}
      role="region"
      aria-label="Request Diff Viewer"
    >
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
        <Legend />
      </header>

      <ScrollArea className="h-[400px] w-full rounded-md ">
        {allFields.length === 0 ? (
          <div
            className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            No changes detected.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 min-w-[700px]">
            <div className="border-r border-border pr-4">
              <h3 className="text-xs font-semibold text-muted-foreground mb-2">
                Existing
              </h3>
              <ol
                className="space-y-3"
                role="list"
                aria-label="Existing document"
              >
                {allFields.map((f) => (
                  <li
                    key={f.path + "-old"}
                    className={cn(
                      "rounded-md border border-border p-3",
                      f.changed ? "bg-destructive/10" : "bg-muted/20"
                    )}
                  >
                    <div className="text-xs text-muted-foreground mb-1 font-mono">
                      {f.path}
                    </div>
                    <ValueView value={f.oldValue} />
                  </li>
                ))}
              </ol>
            </div>

            <div className="pl-4">
              <h3 className="text-xs font-semibold text-muted-foreground mb-2">
                Current
              </h3>
              <ol
                className="space-y-3"
                role="list"
                aria-label="Current document"
              >
                {allFields.map((f) => (
                  <li
                    key={f.path + "-new"}
                    className={cn(
                      "rounded-md border border-border p-3",
                      f.changed ? "bg-primary/10" : "bg-muted/20"
                    )}
                  >
                    <div className="text-xs text-muted-foreground mb-1 font-mono">
                      {f.path}
                    </div>
                    <ValueView value={f.newValue} />
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </ScrollArea>
    </section>
  );
};

const Legend = () => {
  return (
    <div
      className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex"
      aria-hidden="true"
    >
      <span className="inline-flex items-center gap-1">
        <span className="inline-block h-3 w-3 rounded bg-destructive/30" />
        removed
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="inline-block h-3 w-3 rounded bg-primary/30" />
        added
      </span>
    </div>
  );
};

export const diffQuestion = (
  oldDoc: Record<string, any>,
  newDoc: Record<string, any>
): Array<{
  path: string;
  oldValue: unknown;
  newValue: unknown;
  changed: boolean;
}> => {
  const results: Array<{
    path: string;
    oldValue: unknown;
    newValue: unknown;
    changed: boolean;
  }> = [];

  const visit = (prefix: string, a: any, b: any) => {
    // Handle primitive values
    if (isPrimitive(a) && isPrimitive(b)) {
      results.push({
        path: prefix,
        oldValue: a,
        newValue: b,
        changed: a !== b,
      });
      return;
    }

    // Handle null/undefined mismatch
    if ((a == null) !== (b == null)) {
      results.push({
        path: prefix,
        oldValue: a,
        newValue: b,
        changed: true,
      });
      return;
    }

    // Handle nested objects
    if (a && b && typeof a === "object" && typeof b === "object") {
      const keys = Array.from(
        new Set([...Object.keys(a), ...Object.keys(b)])
      ).sort();
      for (const key of keys) {
        const path = prefix ? `${prefix}.${key}` : key;
        visit(path, a?.[key], b?.[key]);
      }
      return;
    }

    // Fallback for mismatched types
    results.push({
      path: prefix,
      oldValue: a,
      newValue: b,
      changed: a !== b,
    });
  };

  visit("", oldDoc, newDoc);

  return results.map((r) => ({
    ...r,
    path: r.path.startsWith(".") ? r.path.slice(1) : r.path,
  }));
};

// const diffQuestion = (
//   oldDoc: IDetailedQuestion,
//   newDoc: IDetailedQuestion
// ): Array<{ path: string; oldValue: unknown; newValue: unknown }> => {
//   const changes: Array<{ path: string; oldValue: unknown; newValue: unknown }> =
//     [];
//   const visit = (prefix: string, a: any, b: any) => {
//     // If primitives differ, record change
//     if (isPrimitive(a) && isPrimitive(b)) {
//       if (a !== b) {
//         changes.push({ path: prefix, oldValue: a, newValue: b });
//       }
//       return;
//     }

//     // If either is null/undefined and not equal, record
//     if ((a == null) !== (b == null)) {
//       changes.push({ path: prefix, oldValue: a, newValue: b });
//       return;
//     }

//     // For objects, traverse keys
//     if (a && b && typeof a === "object" && typeof b === "object") {
//       const keys = Array.from(
//         new Set([...Object.keys(a), ...Object.keys(b)])
//       ).sort();
//       for (const k of keys) {
//         const p = prefix ? `${prefix}.${k}` : k;
//         visit(p, a?.[k], b?.[k]);
//       }
//       return;
//     }

//     // Fallback inequality
//     if (a !== b) {
//       changes.push({ path: prefix, oldValue: a, newValue: b });
//     }
//   };

//   visit("", oldDoc, newDoc);
//   // Only keep first-level path without leading dot
//   return changes.map((c) => ({
//     ...c,
//     path: c.path.startsWith(".") ? c.path.slice(1) : c.path,
//   }));
// };

const isPrimitive = (v: unknown) => {
  return v == null || ["string", "number", "boolean"].includes(typeof v);
};

const ValueView = ({ value }: { value: unknown }) => {
  if (value == null) return <span className="text-muted-foreground">null</span>;
  if (typeof value === "object") {
    return (
      <pre className="overflow-x-auto rounded bg-muted p-2 text-xs leading-relaxed">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }
  return (
    <code className="rounded bg-muted px-1 py-0.5 text-[13px]">
      {String(value)}
    </code>
  );
};
