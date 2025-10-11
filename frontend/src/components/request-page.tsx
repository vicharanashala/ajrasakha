import { useMemo, useState } from "react";
import {
  Card,
  CardContent,
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/atoms/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/atoms/avatar";
import { cn } from "@/lib/utils";
import type { IRequest, RequestStatus } from "@/types";
import { useGetAllRequests } from "@/hooks/api/request/useGetAllRequest";
import { Pagination } from "./pagination";
import { Sliders, Circle, Layers, Calendar, Search } from "lucide-react";
import { QuestionDetailsDialog } from "./QA-interface";
import { useGetQuestionById } from "@/hooks/api/question/useGetQuestionById";

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

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function StatusBadge({ status }: { status: RequestStatus }) {
  return (
    <Badge className="bg-secondary text-secondary-foreground border border-border">
      {status === "in-review"
        ? "In Review"
        : status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

const RequestCard = ({
  req,
  onUpdate,
}: {
  req: IRequest;
  onUpdate: (
    id: string,
    newStatus: RequestStatus,
    response?: string
  ) => Promise<void>;
}) => {
  const [open, setOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<RequestStatus>(req.status);
  const [response, setResponse] = useState<string>("");
  const [selectedQuestionId, setSelectedQuestionId] = useState("");

  const { data: selectedQuestionData, isLoading: isSelectedQuestionLoading } =
    useGetQuestionById(selectedQuestionId);

  return (
    <Card className="bg-card">
      {selectedQuestionId && (
        <QuestionDetailsDialog question={selectedQuestionData!} />
      )}

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
        <StatusBadge status={req.status} />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-sm">
          <div className="font-medium">Reason</div>
          <p className="text-muted-foreground">{req.reason}</p>
        </div>
        <div className="text-xs text-muted-foreground">
          Created: {new Date(req.createdAt).toLocaleString()}
        </div>
        <div className="flex gap-2 justify-end">
          {/* <Button
            variant="secondary"
            className="bg-secondary text-secondary-foreground"
          >
            View more
          </Button> */}

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="flex items-center justify-center gap-2">
                <Search className="w-4 h-4" aria-hidden="true" />
                <span>View Diff</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card">
              <DialogHeader>
                <DialogTitle>Update Request</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="grid gap-2">
                  <label className="text-sm font-medium">New Status</label>
                  <Select
                    value={newStatus}
                    onValueChange={(v) => setNewStatus(v as RequestStatus)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="in-review">In Review</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Response</label>
                  <Textarea
                    placeholder="Add a moderator response"
                    value={response}
                    onChange={(e) => setResponse(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={async () => {
                    await onUpdate(
                      String(req._id),
                      newStatus,
                      response.trim() || undefined
                    );
                    setOpen(false);
                  }}
                >
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
};

export const RequestsPage = () => {
  // const requests: IRequest[] = [
  //   {
  //     _id: "1",
  //     requestType: "question_flag",
  //     details: {
  //       id: "q1",
  //       text: "What is crop rotation?",
  //       createdAt: new Date().toISOString(),
  //       updatedAt: new Date().toISOString(),
  //       totalAnswersCount: 5,
  //       priority: "medium",
  //       status: "open",
  //       source: "AJRASAKHA",
  //       details: {
  //         state: "Karnataka",
  //         district: "Bangalore",
  //         crop: "Wheat",
  //         season: "Rabi",
  //         domain: "Soil Management",
  //       },
  //     },
  //     entityId: "e1",
  //     reason: "Inappropriate content",
  //     responses: [
  //       { reviewedBy: "mod_01", role: "moderator", status: "pending" },
  //     ],
  //     status: "pending",
  //     createdAt: new Date().toISOString(),
  //     updatedAt: new Date().toISOString(),
  //   },
  //   {
  //     _id: "2",
  //     requestType: "others",
  //     details: { description: "Request for additional data" },
  //     reason: "Need more context",
  //     responses: [
  //       {
  //         reviewedBy: "admin_01",
  //         role: "admin",
  //         status: "approved",
  //         response: "Added additional context",
  //         reviewedAt: new Date().toISOString(),
  //       },
  //     ],
  //     status: "approved",
  //     entityId: "e1",

  //     createdAt: new Date().toISOString(),
  //     updatedAt: new Date().toISOString(),
  //   },
  //   {
  //     _id: "3",
  //     requestType: "question_flag",
  //     entityId: "e1",

  //     details: {
  //       id: "q2",
  //       text: "Explain soil erosion",
  //       createdAt: new Date().toISOString(),
  //       updatedAt: new Date().toISOString(),
  //       totalAnswersCount: 2,
  //       priority: "high",
  //       status: "open",
  //       source: "AGRI_EXPERT",
  //       details: {
  //         state: "Maharashtra",
  //         district: "Pune",
  //         crop: "Sugarcane",
  //         season: "Kharif",
  //         domain: "Soil Management",
  //       },
  //     },
  //     reason: "Duplicate question",
  //     responses: [],
  //     status: "rejected",
  //     createdAt: new Date().toISOString(),
  //     updatedAt: new Date().toISOString(),
  //   },
  //   {
  //     _id: "4",
  //     requestType: "others",
  //     entityId: "e1",

  //     details: { description: "Update cropping season info" },
  //     reason: "Incorrect season",
  //     responses: [
  //       { reviewedBy: "mod_02", role: "moderator", status: "in-review" },
  //     ],
  //     status: "in-review",
  //     createdAt: new Date().toISOString(),
  //     updatedAt: new Date().toISOString(),
  //   },
  //   {
  //     _id: "5",
  //     requestType: "question_flag",
  //     entityId: "e1",

  //     details: {
  //       id: "q3",
  //       text: "What are fertilizers?",
  //       createdAt: new Date().toISOString(),
  //       updatedAt: new Date().toISOString(),
  //       totalAnswersCount: 3,
  //       priority: "low",
  //       status: "open",
  //       source: "AJRASAKHA",
  //       details: {
  //         state: "Punjab",
  //         district: "Ludhiana",
  //         crop: "Rice",
  //         season: "Rabi",
  //         domain: "Crop Nutrition",
  //       },
  //     },
  //     reason: "Spam",
  //     responses: [],
  //     status: "pending",
  //     createdAt: new Date().toISOString(),
  //     updatedAt: new Date().toISOString(),
  //   },
  //   {
  //     _id: "6",
  //     requestType: "others",
  //     entityId: "e1",

  //     details: { description: "Request for expert review" },
  //     reason: "Expert verification required",
  //     responses: [
  //       {
  //         reviewedBy: "admin_02",
  //         role: "admin",
  //         status: "approved",
  //         response: "Verified successfully",
  //         reviewedAt: new Date().toISOString(),
  //       },
  //     ],
  //     status: "approved",
  //     createdAt: new Date().toISOString(),
  //     updatedAt: new Date().toISOString(),
  //   },
  //   {
  //     _id: "7",
  //     requestType: "question_flag",
  //     entityId: "e1",

  //     details: {
  //       id: "q4",
  //       text: "Define irrigation",
  //       createdAt: new Date().toISOString(),
  //       updatedAt: new Date().toISOString(),
  //       totalAnswersCount: 1,
  //       priority: "medium",
  //       status: "open",
  //       source: "AGRI_EXPERT",
  //       details: {
  //         state: "Rajasthan",
  //         district: "Jaipur",
  //         crop: "Millet",
  //         season: "Kharif",
  //         domain: "Water Management",
  //       },
  //     },
  //     reason: "Duplicate",
  //     responses: [
  //       {
  //         reviewedBy: "mod_03",
  //         role: "moderator",
  //         status: "rejected",
  //         response: "Already exists",
  //         reviewedAt: new Date().toISOString(),
  //       },
  //     ],
  //     status: "rejected",
  //     createdAt: new Date().toISOString(),
  //     updatedAt: new Date().toISOString(),
  //   },
  //   {
  //     _id: "8",
  //     requestType: "others",
  //     entityId: "e1",

  //     details: { description: "Add new crop type" },
  //     reason: "Missing crop",
  //     responses: [],
  //     status: "pending",
  //     createdAt: new Date().toISOString(),
  //     updatedAt: new Date().toISOString(),
  //   },
  //   {
  //     _id: "9",
  //     requestType: "question_flag",
  //     entityId: "e1",

  //     details: {
  //       id: "q5",
  //       text: "Explain pest control",
  //       createdAt: new Date().toISOString(),
  //       updatedAt: new Date().toISOString(),
  //       totalAnswersCount: 4,
  //       priority: "high",
  //       status: "open",
  //       source: "AJRASAKHA",
  //       details: {
  //         state: "Tamil Nadu",
  //         district: "Coimbatore",
  //         crop: "Cotton",
  //         season: "Rabi",
  //         domain: "Plant Protection",
  //       },
  //     },
  //     reason: "Off-topic",
  //     responses: [
  //       { reviewedBy: "mod_04", role: "moderator", status: "in-review" },
  //     ],
  //     status: "in-review",
  //     createdAt: new Date().toISOString(),
  //     updatedAt: new Date().toISOString(),
  //   },
  //   {
  //     _id: "10",
  //     requestType: "others",
  //     entityId: "e1",
  //     details: { description: "Correct domain info" },
  //     reason: "Incorrect domain assigned",
  //     responses: [
  //       {
  //         reviewedBy: "admin_03",
  //         role: "admin",
  //         status: "approved",
  //         response: "Domain updated",
  //         reviewedAt: new Date().toISOString(),
  //       },
  //     ],
  //     status: "approved",
  //     createdAt: new Date().toISOString(),
  //     updatedAt: new Date().toISOString(),
  //   },
  // ];

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

  // const filteredSorted = useMemo(() => {
  //   const list = (requests ?? []).filter((r) => {
  //     const byStatus = status === "all" ? true : r.status === status;
  //     const byType = reqType === "all" ? true : r.requestType === reqType;
  //     return byStatus && byType;
  //   });
  //   list.sort((a, b) => {
  //     const aTime = new Date(a.createdAt).getTime();
  //     const bTime = new Date(b.createdAt).getTime();
  //     return sortOrder === "newest" ? bTime - aTime : aTime - bTime;
  //   });
  //   return list;
  // }, [requests, status, reqType, sortOrder]);

  return (
    <main className="mx-auto w-full p-4 pt-2 md:p-6 md:pt-0">
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
                <Select
                  value={status}
                  onValueChange={(v) => setStatus(v as any)}
                >
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

      <section className={cn("grid gap-4", "md:grid-cols-2")}>
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
            <RequestCard
              key={String(req._id)}
              req={req}
              onUpdate={async (
                id: string,
                newStatus: RequestStatus,
                response?: string
              ) => {
                console.log(
                  `Request ${id} would be updated to ${newStatus}`,
                  response
                );
                return Promise.resolve();
              }}
            />
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
