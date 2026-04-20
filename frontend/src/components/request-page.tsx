import { useEffect, useState } from "react";
import { Badge } from "@/components/atoms/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select";
import type { RequestStatus } from "@/types";
import { useGetAllRequests } from "@/hooks/api/request/useGetAllRequest";
import { Pagination } from "./pagination";
import { Sliders, Circle, Layers, Calendar } from "lucide-react";
import { RequestCard } from "./RequestCard";

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

export const RequestsPage = ({
  autoSelectId,
}: {
  autoSelectId: string | null;
}) => {
  const [status, setStatus] = useState<"all" | RequestStatus>("all");
  const [reqType, setReqType] = useState<"all" | "question_flag" | "others">(
    "all",
  );
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    null,
  );
  const LIMIT = 10;

  const { data: requestData, isLoading } = useGetAllRequests(
    currentPage,
    LIMIT,
    status,
    reqType,
    sortOrder,
  );

  useEffect(() => {
    if (!autoSelectId || !requestData?.requests) return;

    const matchingRequest = requestData.requests.find(
      (req) => req.entityId === autoSelectId,
    );

    if (matchingRequest) {
      setSelectedRequestId(String(matchingRequest._id));
      setTimeout(() => {
        const element = document.getElementById(
          `request-${matchingRequest._id}`,
        );
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 100);
    } else {
      setSelectedRequestId(null);
    }
  }, [autoSelectId, requestData?.requests]);

  useEffect(() => {
    if (
      status !== "all" ||
      reqType !== "all" ||
      sortOrder !== "newest" ||
      currentPage !== 1
    ) {
      setSelectedRequestId(null);
    }
  }, [status, reqType, sortOrder, currentPage]);

  return (
    <main className="mx-auto w-full p-4 pt-2 md:p-6 md:pt-0">
      <section className="mx-auto w-full p-4 pt-2 md:p-6 md:pt-0">
        <section className="mb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-semibold text-pretty">Request Queue</h1>
            {selectedRequestId && (
              <Badge variant="secondary" className="ml-2">
                Highlighted
              </Badge>
            )}
          </div>

          <div className="flex gap-2 flex-wrap md:flex-nowrap w-full md:w-auto">
            <div className="flex-1 min-w-[180px]">
              <label className="text-sm font-medium mb-1 flex items-center gap-1">
                <Circle className="w-4 h-4 text-primary" />
                <span>Status</span>
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
                <span>Request Type</span>
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
                <span>Sort By</span>
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

      <section className="grid gap-4 lg:grid-cols-4 md:grid-cols-3">
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
              key={`${req._id}-${selectedRequestId === String(req._id)}`}
              req={req}
              isHighlighted={selectedRequestId === String(req._id)}
              id={`request-${req._id}`}
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
