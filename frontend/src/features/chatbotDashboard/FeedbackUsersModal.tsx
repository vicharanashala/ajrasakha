import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, RefreshCw } from "lucide-react";
import { QuestionListTable, type QuestionListColumn } from "./components/QuestionListTable";
import { useFeedbackUsers } from "./hooks/useFeedbackUsers";
import { useQueryClient } from "@tanstack/react-query";

interface FeedbackUserEntry {
  id?: string;
  userId?: string;
  name?: string;
  email?: string;
  rating?: string;
  tag?: string;
  createdAt?: string;
}

interface FeedbackUsersModalProps {
  onClose: () => void;
  rating: "positive" | "negative";
  source?: string;
  userType?: string;
}

const PAGE_SIZE = 10;

export function FeedbackUsersModal({ onClose, rating, source, userType }: FeedbackUsersModalProps) {
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState<string>("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const queryClient = useQueryClient();
  const [dataRefreshing, setDataRefreshing] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const { data, isLoading, isFetching, isError, refetch } = useFeedbackUsers({
    page,
    limit: PAGE_SIZE,
    search: debouncedSearch,
    sortBy,
    sortOrder,
    rating,
    source,
    userType,
  });

  const handleRefresh = async () => {
    setDataRefreshing(true);
    await refetch();
    setDataRefreshing(false);
  };

  const users = data?.messages ?? [];
  const total = data?.totalFeedbacks ?? 0;

  const columns = useMemo<QuestionListColumn<FeedbackUserEntry>[]>(
    () => [
      {
        key: "name",
        label: "Username",
        sortable: true,
        sortAccessor: (row: any) => row.farmerName ?? row.name ?? "",
        accessor: (row: any) => row.farmerName ?? row.name ?? "-",
      },
      {
        key: "email",
        label: "Email",
        sortable: false,
        accessor: (row) => row.email ?? "-",
      },
      {
        key: "rating",
        label: "Rating",
        sortable: false,
        accessor: (row: any) => row.feedback?.rating ?? "-",
        render: (row: any) => {
          const r = row.feedback?.rating;
          return (
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${r === 'thumbsUp' || r === 'positive' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : r === 'thumbsDown' || r === 'negative' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' : 'bg-muted text-muted-foreground'}`}>
              {r === 'thumbsUp' ? 'Positive' : r === 'thumbsDown' ? 'Negative' : (r ?? "-")}
            </span>
          );
        },
      },
      {
        key: "tag",
        label: "Tag",
        sortable: false,
        accessor: (row: any) => row.feedback?.tag ?? "-",
      },
      {
        key: "createdAt",
        label: "Created At",
        sortable: true,
        sortAccessor: (row) => row.createdAt ?? "",
        accessor: (row) => (row.createdAt ? new Date(row.createdAt).toLocaleString() : "-"),
      },
    ],
    []
  );

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[88vh] w-full max-w-[95vw] flex-col rounded-xl bg-white shadow-2xl dark:bg-[#1a1a1a]">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-[#2a2a2a]">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold capitalize">
              {rating} Feedback Users
            </h2>
            <button
              onClick={handleRefresh}
              className="rounded p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800"
              title="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${dataRefreshing || isFetching ? 'animate-spin text-muted-foreground' : 'text-gray-500'}`} />
            </button>
          </div>

          <div className="flex items-center gap-3">
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search username..."
              className="w-72 rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 dark:bg-[#2a2a2a] dark:border-gray-700"
            />
            <button
              onClick={onClose}
              className="rounded p-2 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Table */}
        <QuestionListTable
          data={users}
          columns={columns}
          loading={isLoading}
          loadingMessage={`Loading ${rating} feedback users...`}
          emptyMessage={`No ${rating} feedback users found.`}
          error={isError ? "Failed to load feedback users." : undefined}
          getRowKey={(row) => row.id ?? row.userId ?? Math.random().toString()}
          pagination={{
            page,
            pageSize: PAGE_SIZE,
            total,
            onPageChange: setPage,
          }}
          initialSortKey={sortBy}
          initialSortDirection={sortOrder}
          onSortChange={(key, dir) => {
            if (key) setSortBy(key);
            if (dir) setSortOrder(dir);
            setPage(1); // Reset to first page on sort
          }}
          viewMode="table"
        />

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between border-t border-gray-100 px-6 py-3 text-xs text-gray-400 dark:border-[#2a2a2a]">
          <span>
            {isFetching && !isLoading
              ? "Refreshing..."
              : `${total} total`}
          </span>
          <span>
            Showing {users.length} of {total}
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
}
