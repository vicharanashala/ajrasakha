import { useEffect, useMemo, useState } from "react";
import { Copy, Check } from "lucide-react";
import {
  useWeatherConcernQueries,
  type WeatherConcernFilters,
} from "../hooks/useWeatherConcernAnalytics";
import { TranslatableText } from "./TranslatableText";
import { FarmerNameLink } from "./FarmerNameLink";
import { useSelectedQuestion } from "@/hooks/api/question/useSelectedQuestion";
import { QueriesModal, type QueryListColumn } from "./QueriesModal";

const CopyableIdCell = ({ id }: { id?: string }) => {
  const [copied, setCopied] = useState(false);

  if (!id) return null;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group flex items-center gap-1.5">
      <span className="font-mono" title={id}>
        ...{id.slice(-6)}
      </span>
      <button
        type="button"
        onClick={handleCopy}
        className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-gray-900 dark:hover:text-gray-100"
        title="Copy full ID"
      >
        {copied ? (
          <Check className="h-3 w-3 text-green-500" />
        ) : (
          <Copy className="h-3 w-3 text-gray-400" />
        )}
      </button>
    </div>
  );
};

interface WeatherConcernQueriesModalProps {
  concern: string | null;
  filters: WeatherConcernFilters;
  source?: "vicharanashala" | "annam";
  userType?: "all" | "external" | "internal";
  onClose: () => void;
}

const PAGE_SIZE = 10;

export function WeatherConcernQueriesModal({
  concern,
  filters,
  source = "annam",
  userType = "all",
  onClose,
}: WeatherConcernQueriesModalProps) {
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const { setSelectedQuestionId, setView } = useSelectedQuestion();

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setSearchTerm("");
    setDebouncedSearch("");
    setPage(1);
  }, [concern]);

  const { data, isLoading, isError, isFetching } = useWeatherConcernQueries(
    filters,
    concern,
    page,
    PAGE_SIZE,
    source,
    userType,
    debouncedSearch || undefined,
  );

  const columns = useMemo<QueryListColumn<any>[]>(
    () => [
      {
        key: "messageId",
        label: "Message ID",
        sortable: true,
        sortAccessor: (row) => row.messageId || row.questionId,
        className: "w-[12%]",
        cellClassName: "text-xs text-gray-500",
        render: (row) => <CopyableIdCell id={row.messageId || row.questionId} />,
      },
      {
        key: "email",
        label: "Email",
        sortable: true,
        sortAccessor: (row) => row.email || "N/A",
        className: "w-[16%]",
        cellClassName: "truncate",
        accessor: (row) => row.email || "N/A",
      },
      {
        key: "name",
        label: "Name",
        sortable: true,
        sortAccessor: (row) => row.name || row.farmerName || "N/A",
        className: "w-[14%]",
        cellClassName: "truncate",
        render: (row) => (
          <FarmerNameLink userId={row.userId}>
            {row.name || row.farmerName || "N/A"}
          </FarmerNameLink>
        ),
      },
      {
        key: "question",
        label: "Query",
        sortable: true,
        sortAccessor: (row) => row.question,
        className: "w-[32%]",
        cellClassName: "overflow-hidden",
        render: (row) => (
          <button
            className="text-left hover:underline"
            onClick={() => {
              if (row.questionId) {
                setSelectedQuestionId(row.questionId);
                setView("lifecycle");
                onClose();
              }
            }}
          >
            <TranslatableText
              text={row.question ?? ""}
              showTooltip
              textClassName="text-xs line-clamp-2"
            />
          </button>
        ),
      },
      {
        key: "createdAt",
        label: "Created At",
        sortable: true,
        sortAccessor: (row) => (row.createdAt ? new Date(row.createdAt) : null),
        className: "w-[10%]",
        cellClassName: "whitespace-normal break-words text-[11px]",
        render: (row) =>
          row.createdAt
            ? new Date(row.createdAt).toLocaleString(undefined, {
                dateStyle: "short",
                timeStyle: "short",
              })
            : undefined,
      },
    ],
    [onClose, setSelectedQuestionId, setView]
  );

  if (!concern) return null;

  return (
    <QueriesModal
      title={`${concern} Queries`}
      subtitle={`Weather queries categorized under "${concern}"`}
      data={data?.questions ?? []}
      columns={columns}
      total={data?.total ?? 0}
      isLoading={isLoading}
      isError={isError}
      isFetching={isFetching}
      page={page}
      pageSize={PAGE_SIZE}
      onPageChange={setPage}
      onClose={onClose}
      getRowKey={(row) => row.messageId || row.questionId}
      entityName="query"
      searchValue={searchTerm}
      onSearchChange={setSearchTerm}
      searchPlaceholder="Search by name, email, query or ID..."
    />
  );
}
