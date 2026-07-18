import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Copy, Check, RefreshCw } from "lucide-react";
import { Badge } from "@/components/atoms/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/atoms/tabs";
import {
  // useDistrictQuestion,
  // useQueryCategoryQuestions,
  useQuestionFilter,
  type QueryCategoryQuestionEntry,
  type QueryCategoryQuestionType,
} from "../hooks/useActiveUsersAnalytics";
import {
  QuestionListTable,
  type QuestionListColumn,
} from "./QuestionListTable";
import { TranslatableText } from "./TranslatableText";
import { FarmerNameLink } from "./FarmerNameLink";
import { useSelectedQuestion } from "@/hooks/api/question/useSelectedQuestion";
import { useQueryClient } from "@tanstack/react-query";

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

interface QueryCategoryQuestionsModalProps {
  category?: string;
  district?: string;
  state?: string;
  crop?: string;
  crops?: string[];
  status?: string;
  closedWithInTwohours?: boolean;
  notificationType?: string;
  period?: string;
  source?: "both" | "annam" | "whatsapp";
  // source? : string;
  userType?: string;
  isQueryCategory?: boolean;
  startDate?: Date;
  endDate?: Date;
  onClose: () => void;
  isPassed?: boolean;
  tag?: string;
  totalClosedAndPassed?: number;
  userId?: string;
  closedQuestions?: number;
  totalQuestions?: number;
  passedQuestions?: number;
  closedInLastTwoHours?: number;
  passedInLastTwoHours?: number;
  dynamicClosedInLastTwoHours?: number;
  duplicateClosedInLastTwoHours?: number;
  slaBreached?: number;
  safeNotified?: number;
  safeNotNotified?: number;
  safeUntracked?: number;
  isIndiaView?: boolean;
}

const PAGE_SIZE = 10;

export function QueryCategoryQuestionsModal({
  category,
  district,
  state,
  crop,
  crops,
  status,
  closedWithInTwohours,
  notificationType,
  period,
  source,
  userType = "all",
  isQueryCategory,
  startDate,
  endDate,
  onClose,
  isPassed,
  tag,
  totalClosedAndPassed,
  userId,
  closedQuestions,
  totalQuestions,
  passedQuestions,
  closedInLastTwoHours,
  passedInLastTwoHours,
  dynamicClosedInLastTwoHours,
  duplicateClosedInLastTwoHours,
  slaBreached,
  safeNotified,
  safeNotNotified,
  safeUntracked,
  isIndiaView,
}: QueryCategoryQuestionsModalProps) {
  const { setSelectedQuestionId, setView } = useSelectedQuestion();

  const [questionType, setQuestionType] =
    useState<QueryCategoryQuestionType>("all");
  const [page, setPage] = useState(1);

  // console.log("StartDate", startDate);
  // console.log("EndDate", endDate);

  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    setPage(1);
    setQuestionType("all");
  }, [category]);

  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  const { data, isLoading, isError, isFetching } = useQuestionFilter({
    category,
    district,
    state,
    crop,
    crops,
    status,
    closedWithInTwohours,
    notificationType,
    period,
    questionType,
    page,
    limit: PAGE_SIZE,
    source,
    userType,
    startDate,
    endDate,
    search: debouncedSearch,
    enabled: true,
    isPassed,
    tag,
    userId,
  });

  const isMapView = isIndiaView ?? (!!state || !!district);

  console.log("State", state, " district", district)

  console.log("Map view is", isMapView)

  const columns = useMemo<
    QuestionListColumn<QueryCategoryQuestionEntry>[]
  >(() => {
    // const baseColumns: QuestionListColumn<QueryCategoryQuestionEntry>[] = [
    //   {
    //     key: period ? "messageId" : "questionId",
    //     label: period ? "Message ID" : "Question ID",
    //     sortable: true,
    //     sortAccessor: (row) => row.questionId || row.messageId,
    //     className: "w-[12%]",
    //     cellClassName: "text-xs text-gray-500",
    //     render: (row) => (
    //       <CopyableIdCell id={period ? row.messageId : row.questionId} />
    //     ),
    //   },

    //   {
    //     key: "email",
    //     label: "Email",
    //     sortable: true,
    //     sortAccessor: (row) => row.email || "N/A",
    //     className: "w-[16%]",
    //     cellClassName: "truncate",
    //     accessor: (row) => row.email || "N/A",
    //   },

    //   {
    //     key: "name",
    //     label: "Name",
    //     sortable: true,
    //     sortAccessor: (row) => row.name || row.farmerName || "N/A",
    //     className: "w-[14%]",
    //     cellClassName: "truncate",
    //     render: (row) => (
    //       <FarmerNameLink userId={row.userId}>
    //         {row.name || row.farmerName || "N/A"}
    //       </FarmerNameLink>
    //     ),
    //   },

    //   {
    //     key: "question",
    //     label: period ? "Query" : "Question",
    //     sortable: true,
    //     sortAccessor: (row) => row.question,
    //     className: "w-[32%]",
    //     cellClassName: "overflow-hidden",
    //     render: (row) => (
    //       <button
    //         className="text-left hover:underline"
    //         onClick={() => {
    //           setSelectedQuestionId(row.questionId);
    //           setView("lifecycle");
    //           onClose();
    //         }}
    //       >
    //         <TranslatableText
    //           text={row.question ?? ""}
    //           showTooltip
    //           textClassName="text-xs line-clamp-2"
    //         />
    //       </button>
    //     ),
    //   },

    //   {
    //     key: "createdAt",
    //     label: "Created At",
    //     sortable: true,
    //     sortAccessor: (row) => (row.createdAt ? new Date(row.createdAt) : null),
    //     className: "w-[10%]",
    //     cellClassName: "whitespace-normal break-words text-[11px]",
    //     render: (row) =>
    //       row.createdAt
    //         ? new Date(row.createdAt).toLocaleString(undefined, {
    //             dateStyle: "short",
    //             timeStyle: "short",
    //           })
    //         : undefined,
    //   },
    // ];

    const baseColumns: QuestionListColumn<QueryCategoryQuestionEntry>[] = [];

    if (!isMapView) {
  baseColumns.push({
    key: period ? "messageId" : "questionId",
    label: period ? "Message ID" : "Question ID",
    sortable: true,
    sortAccessor: (row) => row.questionId || row.messageId,
    className: "w-[12%]",
    cellClassName: "text-xs text-gray-500",
    render: (row) => (
      <CopyableIdCell
        id={period ? row.messageId : row.questionId}
      />
    ),
  });
}

    // Email (Always)
    baseColumns.push({
      key: "email",
      label: "Email",
      sortable: true,
      sortAccessor: (row) => row.email || "N/A",
      className: "w-[18%]",
      cellClassName: "truncate",
      accessor: (row) => row.email || "N/A",
    });

    // Name (Dashboard only)
    if (!isMapView) {
      baseColumns.push({
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
      });
    }

    // Question (Always)
    baseColumns.push({
      key: "question",
      label: period ? "Query" : "Question",
      sortable: true,
      sortAccessor: (row) => row.question,
      className: isMapView ? "w-[45%]" : "w-[32%]",
      cellClassName: "overflow-hidden",
      render: (row) => (
        <button
          className="text-left hover:underline"
          onClick={() => {
            setSelectedQuestionId(row.questionId);
            setView("lifecycle");
            onClose();
          }}
        >
          <TranslatableText
            text={row.question ?? ""}
            showTooltip
            textClassName="text-xs line-clamp-2"
          />
        </button>
      ),
    });

    // State (Only Map)
    if (isMapView && !isIndiaView) {
      baseColumns.push({
        key: "state",
        label: "State",
        sortable: true,
        sortAccessor: (row) => row.state ?? "",
        className: "w-[12%]",
        render: () => state ?? "-"
      });
    }

    // District (Only District View)
    if (district) {
      baseColumns.push({
        key: "district",
        label: "District",
        sortable: true,
        sortAccessor: (row) => row.district ?? "",
        className: "w-[12%]",
        render: () => district ?? "-"
      });
    }

    // Created At (Dashboard only)
    if (!isMapView) {
      baseColumns.push({
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
      });
    }

    // Show Type column only when status modal is NOT opened
    if (
      !isMapView &&
      !status &&
      !closedWithInTwohours &&
      !notificationType &&
      !period
    ) {
      baseColumns.push({
        key: "questionType",
        label: "Type",
        align: "center",
        sortable: true,
        sortAccessor: (row) => row.questionType,
        className: "w-[8%]",
        render: (row) => (
          <Badge
            variant={
              row.questionType === "duplicate" ? "destructive" : "secondary"
            }
            className="justify-center capitalize"
          >
            {row.questionType}
          </Badge>
        ),
      });
    }

    if (!period) {
      baseColumns.push({
        key: "status",
        label: "Status",
        align: "center",
        sortable: true,
        sortAccessor: (row) => row.status ?? "",
        className: "w-[8%]",
        render: (row) => (
          <Badge
            variant="outline"
            className="justify-center capitalize text-gray-500"
          >
            {row.status}
          </Badge>
        ),
      });
    }

    return baseColumns;
  }, [  state,
  district,
  period,
  status,
  closedWithInTwohours,
  notificationType,
  setSelectedQuestionId,
  setView,
  onClose,]);

  

  const questions = data?.questions ?? [];

  const total = data?.total ?? 0;

  const [viewMode, setViewMode] = useState<"table" | "lifecycle">("table");

  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await queryClient.refetchQueries({ queryKey: ["lifecycle-summary"] });
    await queryClient.refetchQueries({ queryKey: ["get-question-filter"] });
    setRefreshing(false);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-999 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="flex max-h-[88vh] w-full max-w-6xl flex-col rounded-xl bg-white shadow-2xl dark:bg-[#1a1a1a]">
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-gray-100 px-6 py-4 dark:border-[#2a2a2a]">
          <Tabs
            value={viewMode}
            onValueChange={(value) =>
              setViewMode(value as "table" | "lifecycle")
            }
          >
            <TabsList>
              <TabsTrigger value="table">Questions</TabsTrigger>

              <TabsTrigger value="lifecycle">Lifecycle Summary</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-gray-900 dark:text-gray-100">
              {category}
            </h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {isQueryCategory
                ? "Questions in this query category"
                : crop
                  ? `Question related to crop of type ${crop}`
                  : status
                    ? "Question related to Question Stats"
                    : closedWithInTwohours
                      ? "Question that closed with in 2 hours"
                      : notificationType
                        ? "Question related to Notification users"
                        : period
                          ? `Question related to the ${period}`
                          : state && !district
                            ? `Question releated to the ${state}`
                            : `Question releated to the ${district}`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <button
              onClick={handleRefresh}
              className=" rounded-lg p-1.5 shadow-sm backdrop-blur-sm transition-all duration-200"
              title="Refresh"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 bg-background ${
                  refreshing ? "animate-spin" : ""
                }`}
              />
            </button>
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-64 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-[#2a2a2a]"
            />
            <Tabs
              value={questionType}
              onValueChange={(value) => {
                setQuestionType(value as QueryCategoryQuestionType);
                setPage(1);
              }}
            >
              {!status &&
                !closedWithInTwohours &&
                !notificationType &&
                !period && (
                  <TabsList>
                    <TabsTrigger value="all">All</TabsTrigger>
                    <TabsTrigger value="unique">Unique</TabsTrigger>
                    <TabsTrigger value="duplicate">Duplicate</TabsTrigger>
                  </TabsList>
                )}
            </Tabs>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
              aria-label="Close category questions"
            >
              <X className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            </button>
          </div>
        </div>
        <QuestionListTable
          data={questions}
          columns={columns}
          loading={isLoading}
          loadingMessage="Loading category questions..."
          error={
            isError
              ? "Failed to load category questions. Please try again."
              : undefined
          }
          emptyMessage="No questions found for this category."
          getRowKey={(row) => row.questionId || row.messageId}
          pagination={{
            page,
            pageSize: PAGE_SIZE,
            total,
            onPageChange: setPage,
          }}
          initialSortKey="createdAt"
          initialSortDirection="desc"
          viewMode={viewMode}
          startDate={startDate?.toString()}
          endDate={endDate?.toString()}
          source={source}
          status={status}
          userType={userType}
          isPassed={isPassed}
          tag={tag}
          notificationType={notificationType}
          totalClosedAndPassed={totalClosedAndPassed}
          userId={userId}
          closedQuestions={closedQuestions}
          totalQuestions={totalQuestions}
          passedQuestions={passedQuestions}
          closedInLastTwoHours={closedInLastTwoHours}
          passedInLastTwoHours={passedInLastTwoHours}
          dynamicClosedInLastTwoHours={dynamicClosedInLastTwoHours}
          duplicateClosedInLastTwoHours={duplicateClosedInLastTwoHours}
          slaBreached={slaBreached}
          safeNotified={safeNotified}
          safeNotNotified={safeNotNotified}
          safeUntracked={safeUntracked}
        />

        <div className="flex shrink-0 items-center justify-between border-t border-gray-100 px-6 py-3 text-xs text-gray-400 dark:border-[#2a2a2a] dark:text-gray-500">
          <span>
            {isFetching && !isLoading
              ? "Refreshing..."
              : `${total} question${total !== 1 ? "s" : ""}`}
          </span>
          <span className="capitalize">{questionType} filter</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
