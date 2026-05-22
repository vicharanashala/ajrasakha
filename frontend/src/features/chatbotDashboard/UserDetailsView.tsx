import { useState, useEffect, useMemo, useRef } from "react";
import { X, MapPin, Maximize2, Trash2 } from "lucide-react";
import { Button } from "@/components/atoms/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import { Spinner } from "@/components/atoms/spinner";
import { useUserDetails } from "./hooks/useUserDetails";
import { useDashboardData } from "./hooks/useDashboardData";
import { BarGraph } from "./components/shared/BarGrapgh";
import { Pagination } from "@/components/pagination";
import { createPortal } from "react-dom";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from "@/components/atoms/context-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/atoms/alert-dialog";
import { Input } from "@/components/atoms/input";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { useDeleteUser } from "./hooks/useDeleteUser";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/atoms/table";
import {
  UserDetailsPreferenceFilter,
  type UserDetailsFilters,
} from "./components/UserDetailsPreferenceFilter";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/atoms/tooltip";
import { TopCropsCard } from "./components/TopCropsCard";
import { useTopCrops } from "./hooks/useTopCrops";
import { useDailyUserTrend } from "./hooks/useDailyUserTrend";
import UserQuestionsModal from "./UserQuestionModal";

const VISIBLE_CROPS = 2;

function CropsCell({ crops }: { crops: string | string[] | undefined | null }) {
  const cropList = Array.isArray(crops)
    ? crops
    : crops
      ? crops
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

  if (cropList.length === 0) return <span>—</span>;

  const visible = cropList.slice(0, VISIBLE_CROPS);
  const hidden = cropList.slice(VISIBLE_CROPS);

  return (
    <div className="flex flex-col items-center gap-0.5">
      {visible.map((c, i) => (
        <span
          key={i}
          className="px-1.5 py-0.5 rounded text-xs max-w-[120px] truncate text-center"
          title={c}
        >
          {c}
        </span>
      ))}

      {hidden.length > 0 && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 cursor-default">
                +{hidden.length}
              </span>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              className="
                p-2
                min-w-[100px]
                bg-white text-gray-900 border border-gray-200
                dark:bg-[#1a1a1a] dark:text-gray-100 dark:border-gray-700
              "
            >
              <div className="flex flex-col gap-2 text-center">
                {cropList.map((c, i) => (
                  <span key={i} className="text-xs whitespace-nowrap">
                    {c}
                  </span>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}
const DEFAULT_FILTERS: UserDetailsFilters = {
  search: "",
  crop: "",
  village: "",
  block: "",
  district: "",
  state: "",
  startTime: undefined,
  endTime: undefined,
  profileCompleted: "all",
  inactiveOnly: false,
  lowFeedbackOnly: false,
  userType: "all",
};

interface UserDetailsViewProps {
  source?: "vicharanashala" | "annam";
  initialFilters?: Partial<UserDetailsFilters>;
  userType?: "all" | "external" | "internal";
}

export function UserDetailsView({
  source = "vicharanashala",
  initialFilters,
  userType = "all",
}: UserDetailsViewProps) {
  const { data: currentUser } = useGetCurrentUser({});
  const isAdmin = currentUser?.role === "admin";
  const deleteUserMutation = useDeleteUser();
  const [filters, setFilters] = useState<UserDetailsFilters>(() => ({
    ...DEFAULT_FILTERS,
    ...initialFilters,
  }));
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [sortBy, setSortBy] = useState<"totalQuestions" | "name">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [isBarGraphMaximized, setIsBarGraphMaximized] = useState(false);
  const [isKnowledgeMaximized, setIsKnowledgeMaximized] = useState(false);
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<{
    userId: string;
    source: string;
    email: string;
  } | null>(null);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [hovered, setHovered] = useState<string | null>(null);
  const [agriHovered, setAgriHovered] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  // const scrollToTable = () => {
  //   setTimeout(() => tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  // };

  const scrollToTable = () => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        tableRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 300);
    });
  };

// useEffect(() => {
//   scrollToTable();
// }, []);

  // Apply initialFilters when they change (e.g. clicking from AlertCard in overview)
  useEffect(() => {
    if (initialFilters) {
      setFilters((prev) => ({ ...prev, ...initialFilters }));
      setCurrentPage(1);
      if (initialFilters.inactiveOnly || initialFilters.lowFeedbackOnly) {
        scrollToTable();
      }
    }
  }, [initialFilters]);

  const { data, isLoading, error } = useUserDetails(
    filters.startTime,
    filters.endTime,
    currentPage,
    pageSize,
    filters.search,
    source,
    filters.crop,
    filters.village,
    filters.profileCompleted,
    filters.inactiveOnly,
    filters.lowFeedbackOnly,
    userType,
    sortBy,
    sortOrder,
  );

  const {
    users,
    totalUsers,
    totalPages,
    activeUsers,
    inactiveUsers,
    totalQuestions,
  } = data;

  // Fetch dashboard data with the same filters for charts
  const dashboardFilters = {
    village: filters.village || "all",
    crop: filters.crop || "all",
    season: "all",
    startTime: filters.startTime,
    endTime: filters.endTime,
    userType: userType,
  };
  const { data: dashboardData, isLoading: isDashboardLoading } =
    useDashboardData(dashboardFilters, source);
  const {
    data: topCrops,
    isLoading: isLoadingTopCrops,
    error: errorLoadingTopCrops,
  } = useTopCrops();
  const [selectedUser, setSelectedUser] = useState<any>(null);

  const [questionModalOpen, setQuestionModalOpen] = useState(false);

  const {
    data: dauTrend,
    isLoading: dauLoading,
    error: dauError,
  } = useDailyUserTrend(30, source, filters.userType, source === "annam" || source === "vicharanashala");
    // console.log("DAU Trend data:", dauTrend, "Loading:", dauLoading, "Error:", dauError);

    // console.log("Dashboard data in UserDetailsView:", dashboardData, "Loading:", isDashboardLoading, "Error:", error);

  console.log(
    "DAU Trend data:",
    dauTrend,
    "Loading:",
    dauLoading,
    "Error:",
    dauError,
  );

  console.log(
    "Dashboard data in UserDetailsView:",
    dashboardData,
    "Loading:",
    isDashboardLoading,
    "Error:",
    error,
  );

  const todayCount =
    dauTrend && dauTrend.length > 0 ? dauTrend[dauTrend.length - 1] : null;

  // Patch the DAU card to show "active today / total" instead of just total (same as dashboard)
  const patchedKpiRow1 = useMemo(() => {
    if (!dashboardData?.kpiRow1) return [];
    // Use activeUsers from user details as the "today" count (users with activity in the filtered period)
    // This makes sense in the context of User Details page where we're showing filtered data
    return dashboardData.kpiRow1.map((card) => {
      if (card.id === "dau") {
        return {
          ...card,
          value: `${todayCount?.toLocaleString()} / ${Number(card.value).toLocaleString()}`,
        };
      }
      return card;
    });
  }, [dashboardData?.kpiRow1, activeUsers, totalUsers]);

  // Mark cards as dummy (to blur them) - same logic as dashboard
  const dynamicIds = ["dau", "queries", "session"];
  const kpiRow1WithOverlay = patchedKpiRow1.map((card) => ({
    ...card,
    isDummy: !dynamicIds.includes(card.id),
  }));

  const kpiRow2WithOverlay =
    dashboardData?.kpiRow2.map((card) => ({
      ...card,
      isDummy: card.id !== "totalInstalls",
    })) || [];

  const handleApplyFilters = (newFilters: UserDetailsFilters) => {
    setFilters(newFilters);
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setCurrentPage(1);
  };

  const handleSort = (newSortBy: "totalQuestions" | "name") => {
    if (sortBy === newSortBy) {
      // Toggle sort order if same field
      setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"));
    } else {
      // Change field and set default sort order
      setSortBy(newSortBy);
      setSortOrder(newSortBy === "name" ? "asc" : "desc");
    }
    setCurrentPage(1);
  };

  const isFiltered =
    filters.search ||
    filters.crop ||
    filters.village ||
    filters.block ||
    filters.district ||
    filters.state ||
    filters.startTime ||
    filters.profileCompleted !== "all" ||
    filters.inactiveOnly ||
    filters.lowFeedbackOnly;

  const dateLabel =
    filters.startTime && filters.endTime
      ? `${filters.startTime.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} – ${filters.endTime.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`
      : "All time";

  return (
    <div className="flex-1 overflow-y-auto pb-5 min-w-0">

      {/* Dashboard Charts Section */}
      <div className="mb-6">
     
        {isDashboardLoading ? (
          <div className="py-8">
            <Spinner text="Loading analytics..." fullScreen={false} />
          </div>
        ) : dashboardData ? (
          <>

            {/* Top Crops - Full Width */}
            {/* <div className="grid grid-cols-1 gap-4 mb-4">
              <TopCropsCard
                topCrops={topCrops}
                isLoadingTopCrops={isLoadingTopCrops}
                errorLoadingtopCrops={errorLoadingTopCrops}
              />
            </div> */}

            {/* Knowledge & Awareness Maximized Modal */}
            {isKnowledgeMaximized &&
              createPortal(
                <div
                  className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
                  onClick={() => setIsKnowledgeMaximized(false)}
                >
                  <div
                    className="bg-white dark:bg-[#1a1a1a] rounded-lg shadow-2xl max-w-2xl w-full p-8 relative"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => setIsKnowledgeMaximized(false)}
                      className="absolute top-4 right-4 p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      title="Close"
                    >
                      <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                    </button>

                    <div className="mb-8">
                      <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
                        Knowledge & Awareness
                      </h3>
                    </div>

                    <div className="flex gap-12 justify-center items-center">
                      {/* KCC Awareness - Enlarged */}
                      {/* {(() => {
                      const pct = dashboardData.kccAwareness?.[0]?.pct ?? 0;
                      const r = 80, cx = 100, cy = 100, circ = 2 * Math.PI * r;
                      const dash = (pct / 100) * circ;
                      return (
                        <div className="flex flex-col items-center gap-4">
                          <svg viewBox="0 0 200 200" className="w-[180px] h-[180px]">
                            <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e5e7eb" strokeWidth={16} />
                            <circle cx={cx} cy={cy} r={r} fill="none" stroke="#3AAA5A" strokeWidth={16}
                              strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={circ / 4}
                              transform={`rotate(-90 ${cx} ${cy})`} />
                            <text x={cx} y={cy} textAnchor="middle" dy="0.35em"
                              className="text-4xl font-bold fill-gray-800 dark:fill-gray-100">
                              {pct.toFixed(2)}%
                            </text>
                          </svg>
                          <span className="text-base text-gray-700 dark:text-gray-200 font-medium">KCC Awareness</span>
                        </div>
                      );
                    })()} */}

                      {(() => {
                        const pct =
                          dashboardData.kccAwareness?.[0]?.count +
                            dashboardData.kccAwareness?.[1]?.count || 0;
                        const circ = 2 * Math.PI * 90;
                        // const dash = (pct / 100) * circ;
                        const yesDash =
                          (dashboardData.kccAwareness?.[0]?.count / pct) * circ;
                        const noDash =
                          (dashboardData.kccAwareness?.[1]?.count / pct) * circ;
                        const cx = 120,
                          cy = 120,
                          r = 90;
                        return (
                          <div className="flex flex-col items-center gap-4">
                            <svg
                              viewBox="0 0 240 240"
                              className="w-[200px] h-[200px]"
                            >
                              {/* Background Ring */}
                              <circle
                                cx={cx}
                                cy={cy}
                                r={r}
                                fill="none"
                                stroke="#2f3542"
                                strokeWidth={10}
                              />

                              {/* YES SEGMENT */}
                              <circle
                                cx={cx}
                                cy={cy}
                                r={r}
                                fill="none"
                                stroke="#22c55e"
                                strokeWidth={hovered === "yes" ? 14 : 10}
                                strokeDasharray={`${yesDash} ${circ}`}
                                strokeDashoffset={0}
                                transform={`rotate(-90 ${cx} ${cy})`}
                                strokeLinecap="butt"
                                className="transition-all duration-300 cursor-pointer"
                                onMouseEnter={() => setHovered("yes")}
                                onMouseLeave={() => setHovered(null)}
                              />

                              {/* NO SEGMENT */}
                              <circle
                                cx={cx}
                                cy={cy}
                                r={r}
                                fill="none"
                                stroke="#6b7280"
                                strokeWidth={hovered === "no" ? 14 : 10}
                                strokeDasharray={`${noDash} ${circ}`}
                                strokeDashoffset={-yesDash}
                                transform={`rotate(-90 ${cx} ${cy})`}
                                strokeLinecap="butt"
                                className="transition-all duration-300 cursor-pointer"
                                onMouseEnter={() => setHovered("no")}
                                onMouseLeave={() => setHovered(null)}
                              />

                              {/* CENTER TEXT */}
                              <text
                                x={120}
                                y={120}
                                textAnchor="middle"
                                fontSize={hovered ? 32 : 32}
                                fontWeight={700}
                                fill="#ffffff"
                              >
                                {hovered === "yes"
                                  ? `${dashboardData.kccAwareness?.[0]?.count ?? 0}`
                                  : hovered === "no"
                                    ? `${dashboardData.kccAwareness?.[1]?.count ?? 0}`
                                    : pct}
                              </text>

                              <text
                                x={120}
                                y={138}
                                textAnchor="middle"
                                fontSize={20}
                                fill="#9ca3af"
                              >
                                {hovered === "yes"
                                  ? "Aware"
                                  : hovered === "no"
                                    ? "Unaware"
                                    : "TOTAL"}
                              </text>
                            </svg>
                            <span className="text-base text-gray-600 dark:text-gray-300 text-center font-medium">
                              KCC Awareness
                            </span>
                          </div>
                        );
                      })()}

                      {/* Agri Apps - Enlarged */}
                      {/* {(() => {
                      const pct = dashboardData.agriAppUsage?.[0]?.pct ?? 0;
                      const r = 80, cx = 100, cy = 100, circ = 2 * Math.PI * r;
                      const dash = (pct / 100) * circ;
                      return (
                        <div className="flex flex-col items-center gap-4">
                          <svg viewBox="0 0 200 200" className="w-[180px] h-[180px]">
                            <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e5e7eb" strokeWidth={16} />
                            <circle cx={cx} cy={cy} r={r} fill="none" stroke="#378ADD" strokeWidth={16}
                              strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={circ / 4}
                              transform={`rotate(-90 ${cx} ${cy})`} />
                            <text x={cx} y={cy} textAnchor="middle" dy="0.35em"
                              className="text-4xl font-bold fill-gray-800 dark:fill-gray-100">
                              {pct.toFixed(2)}%
                            </text>
                          </svg>
                          <span className="text-base text-gray-700 dark:text-gray-200 font-medium">Uses Agri Apps</span>
                        </div>
                      );
                    })()} */}

                      {(() => {
                        const pct =
                          dashboardData.agriAppUsage?.[0]?.count +
                            dashboardData.agriAppUsage?.[1]?.count || 0;
                        const circ = 2 * Math.PI * 90;
                        // const dash = (pct / 100) * circ;
                        const yesDash =
                          (dashboardData.kccAwareness?.[0]?.count / pct) * circ;
                        const noDash =
                          (dashboardData.kccAwareness?.[1]?.count / pct) * circ;
                        const cx = 120,
                          cy = 120,
                          r = 90;
                        return (
                          <div className="flex flex-col items-center gap-4">
                            <svg
                              viewBox="0 0 240 240"
                              className="w-[200px] h-[200px]"
                            >
                              <circle
                                cx={cx}
                                cy={cy}
                                r={r}
                                fill="none"
                                stroke="#2f3542"
                                strokeWidth={10}
                              />

                              {/* YES SEGMENT */}
                              <circle
                                cx={cx}
                                cy={cy}
                                r={r}
                                fill="none"
                                stroke="blue"
                                strokeWidth={agriHovered === "yes" ? 14 : 10}
                                strokeDasharray={`${yesDash} ${circ}`}
                                strokeDashoffset={0}
                                transform={`rotate(-90 ${cx} ${cy})`}
                                strokeLinecap="butt"
                                className="transition-all duration-300 cursor-pointer"
                                onMouseEnter={() => setAgriHovered("yes")}
                                onMouseLeave={() => setAgriHovered(null)}
                              />

                              {/* NO SEGMENT */}
                              <circle
                                cx={cx}
                                cy={cy}
                                r={r}
                                fill="none"
                                stroke="#ffff"
                                strokeWidth={agriHovered === "no" ? 14 : 10}
                                strokeDasharray={`${noDash} ${circ}`}
                                strokeDashoffset={-yesDash}
                                transform={`rotate(-90 ${cx} ${cy})`}
                                strokeLinecap="butt"
                                className="transition-all duration-300 cursor-pointer"
                                onMouseEnter={() => setAgriHovered("no")}
                                onMouseLeave={() => setAgriHovered(null)}
                              />

                              {/* CENTER TEXT */}
                              <text
                                x={120}
                                y={120}
                                textAnchor="middle"
                                fontSize={agriHovered ? 32 : 32}
                                fontWeight={700}
                                fill="#ffffff"
                              >
                                {agriHovered === "yes"
                                  ? `${dashboardData.agriAppUsage?.[0]?.count ?? 0}`
                                  : agriHovered === "no"
                                    ? `${dashboardData.agriAppUsage?.[1]?.count ?? 0}`
                                    : pct}
                              </text>

                              <text
                                x={120}
                                y={138}
                                textAnchor="middle"
                                fontSize={20}
                                fill="#9ca3af"
                              >
                                {agriHovered === "yes"
                                  ? "Aware"
                                  : agriHovered === "no"
                                    ? "Unaware"
                                    : "TOTAL"}
                              </text>
                            </svg>
                            <span className="text-base text-gray-600 dark:text-gray-300 text-center font-medium">
                              Uses Agri Apps
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>,
                document.body,
              )}
          </>
        ) : null}
      </div>

      {/* Summary cards + graphs */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-5">
        {/* Active Users — col 1 row 1 */}
        {/* <Card className="dark:bg-[#1a1a1a] dark:border-[#2a2a2a] relative overflow-hidden self-start h-full">
          <div className="absolute inset-x-0 top-0 h-1 bg-[#3B82F6]" />
          <CardContent className="p-4 flex flex-col gap-0.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Active Users
            </span>
            <span className="text-2xl font-semibold dark:text-slate-100">
              {isLoading ? "—" : activeUsers.toLocaleString()}
            </span>
          </CardContent>
        </Card> */}

        {/* Inactive Users — col 2 row 1 */}
        {/* <Card className="dark:bg-[#1a1a1a] dark:border-[#2a2a2a] relative overflow-hidden self-start h-full">
          <div className="absolute inset-x-0 top-0 h-1 bg-[#EF4444]" />
          <CardContent className="p-4 flex flex-col gap-0.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Inactive Users
            </span>
            <span className="text-2xl font-semibold dark:text-slate-100">
              {isLoading ? "—" : inactiveUsers.toLocaleString()}
            </span>
          </CardContent>
        </Card> */}

        {/* Total Questions — col 3 row 1 */}
        {/* <Card className="dark:bg-[#1a1a1a] dark:border-[#2a2a2a] relative overflow-hidden self-start h-full">
          <div className="absolute inset-x-0 top-0 h-1 bg-[#EF9F27]" />
          <CardContent className="p-4 flex flex-col gap-0.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Total Questions
            </span>
            <span className="text-2xl font-semibold dark:text-slate-100">
              {isLoading ? "—" : totalQuestions.toLocaleString()}
            </span>
          </CardContent>
        </Card> */}

        {/* Bar graph — col 1 row 2 on sm+, after all 3 cards on mobile */}
        {!isLoading && !error && users.length > 0 && !filters.inactiveOnly && (
          <>
            {/* <Card className="dark:bg-[#1a1a1a] dark:border-[#2a2a2a] sm:col-start-1 sm:row-start-2 relative"> */}
            {/* <Card className="dark:bg-[#1a1a1a] dark:border-[#2a2a2a] relative h-full">
              <button
                onClick={() => setIsBarGraphMaximized(true)}
                className="absolute top-3 right-3 p-1.5 rounded-md bg-white/80 dark:bg-gray-800/80 hover:bg-white dark:hover:bg-gray-700 transition-colors shadow-sm z-20"
                title="Maximize chart"
              >
                <Maximize2 className="w-4 h-4 text-gray-600 dark:text-gray-300" />
              </button>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  Questions per User
                </CardTitle>
              </CardHeader>
              <CardContent>
                <BarGraph
                  data={users.map((u) => ({
                    label: u.name,
                    value: u.totalQuestions,
                  }))}
                  height={120}
                  showMaximize={false}
                />
              </CardContent>
            </Card> */}

            {/* Maximized Bar Graph Modal */}
            {isBarGraphMaximized &&
              createPortal(
                <div
                  className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
                  onClick={() => setIsBarGraphMaximized(false)}
                >
                  <div
                    className="bg-white dark:bg-[#1a1a1a] rounded-lg shadow-2xl max-w-4xl w-full p-8 relative"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => setIsBarGraphMaximized(false)}
                      className="absolute top-4 right-4 p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      title="Close"
                    >
                      <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                    </button>

                    <div className="mb-8">
                      <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
                        Questions per User
                      </h3>
                    </div>

                    {/* Chart (left) + Table (right) */}
                    <div className="flex gap-4 items-start">
                      {/* Chart — 65% */}
                      <div className="flex-[65] min-w-0 relative">
                        <div className="absolute left-0 top-0 bottom-0 w-px bg-gray-300 dark:bg-gray-700 z-10" />
                        <div className="absolute left-0 right-0 bottom-0 h-px bg-gray-300 dark:bg-gray-700 z-10" />
                        <BarGraph
                          data={users.map((u) => ({
                            label: u.name,
                            value: u.totalQuestions,
                          }))}
                          height={400}
                          showMaximize={false}
                        />
                      </div>

                      {/* Table — 35% */}
                      <div className="flex-[35] min-w-0 max-h-[400px] overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10">
                            <tr>
                              <th className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-300">
                                User
                              </th>
                              <th className="px-3 py-2 text-right font-semibold text-gray-700 dark:text-gray-300">
                                Questions
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {users.map((u, idx) => (
                              <tr
                                key={idx}
                                className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                              >
                                <td className="px-3 py-2 text-gray-600 dark:text-gray-400 truncate max-w-[140px]">
                                  {u.name}
                                </td>
                                <td className="px-3 py-2 text-right font-medium text-gray-900 dark:text-gray-100">
                                  {u.totalQuestions.toLocaleString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>,
                document.body,
              )}
          </>
        )}
      </div>

      {/* Users table */}
      <div ref={tableRef}>
        <Card className="dark:bg-[#1a1a1a] dark:border-[#2a2a2a]">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3 min-w-0 w-full">
              <CardTitle className="text-sm font-medium">All Farmers</CardTitle>
              <div className="flex items-center gap-2">
                {isFiltered && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 text-muted-foreground hover:text-foreground"
                    onClick={handleResetFilters}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Clear
                  </Button>
                )}
                <UserDetailsPreferenceFilter
                  filters={filters}
                  onApply={handleApplyFilters}
                  hideFields={["userType"]}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading && (
              <div className="py-12">
                <Spinner text="Fetching user details..." fullScreen={false} />
              </div>
            )}

            {error && (
              <div className="px-4 py-8 text-center text-red-500 text-sm">
                Failed to load user details. Please try again.
              </div>
            )}

            {!isLoading && !error && (
              <div className="rounded-lg border bg-card overflow-x-auto">
                <Table className="min-w-[1600px]">
                  <TableHeader className="bg-card sticky top-0 z-10">
                    <TableRow>
                      <TableHead className="text-center w-12">S.No</TableHead>
                      <TableHead
                        className={`text-center ${userType === "external" ? "cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800" : "cursor-not-allowed opacity-50"} transition-colors`}
                        onClick={() =>
                          userType === "external" &&
                          handleSort("totalQuestions")
                        }
                      >
                        <div className="flex items-center justify-center gap-1">
                          Query Asked
                          {sortBy === "totalQuestions" ? (
                            <span className="text-blue-600 dark:text-blue-400">
                              {sortOrder === "desc" ? "↓" : "↑"}
                            </span>
                          ) : (
                            <span className="text-gray-400 dark:text-gray-500">
                              ↕
                            </span>
                          )}
                        </div>
                      </TableHead>
                      <TableHead
                        className={`text-center ${userType === "external" ? "cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800" : "cursor-not-allowed opacity-50"} transition-colors`}
                        onClick={() =>
                          userType === "external" && handleSort("name")
                        }
                      >
                        <div className="flex items-center justify-center gap-1">
                          Name
                          {sortBy === "name" ? (
                            <span className="text-blue-600 dark:text-blue-400">
                              {sortOrder === "desc" ? "↓" : "↑"}
                            </span>
                          ) : (
                            <span className="text-gray-400 dark:text-gray-500">
                              ↕
                            </span>
                          )}
                        </div>
                      </TableHead>
                      <TableHead className="text-center">Email</TableHead>
                      <TableHead className="text-center">Farmer Name</TableHead>
                      <TableHead className="text-center">Age</TableHead>
                      <TableHead className="text-center">Gender</TableHead>
                      <TableHead className="text-center">Village</TableHead>
                      <TableHead className="text-center">Block</TableHead>
                      <TableHead className="text-center">District</TableHead>
                      <TableHead className="text-center">State</TableHead>
                      <TableHead className="text-center">Phone</TableHead>
                      <TableHead className="text-center">Language</TableHead>
                      <TableHead className="text-center">Exp. (Yrs)</TableHead>
                      <TableHead className="text-center">Crops</TableHead>
                      <TableHead className="text-center">
                        Primary Crop
                      </TableHead>
                      <TableHead className="text-center">
                        Secondary Crop
                      </TableHead>
                      <TableHead className="text-center">KCC Aware</TableHead>
                      <TableHead className="text-center">Agri Apps</TableHead>
                      <TableHead className="text-center">Education</TableHead>
                      <TableHead className="text-center">Smartphones</TableHead>
                      <TableHead className="text-center">Platform</TableHead>
                      <TableHead className="text-center">Location</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={23}
                          className="text-center py-10 text-muted-foreground"
                        >
                          {isFiltered
                            ? "No users match your filters."
                            : "No users found."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      users.map((user, idx) => {
                        const fp = user.farmerProfile;
                        return (
                          <ContextMenu key={user.userId}>
                            <ContextMenuTrigger asChild>
                              <TableRow className="text-center">
                                <TableCell className="align-middle">
                                  {(currentPage - 1) * pageSize + idx + 1}
                                </TableCell>
                                <TableCell className="align-middle">
                                  {/* <span
                              className={`inline-flex items-center justify-center min-w-[32px] px-2 py-0.5 rounded-full text-xs font-semibold ${
                                user.totalQuestions > 0
                                  ? "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300"
                                  : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                              }`}
                            >
                              {user.totalQuestions.toLocaleString()}
                            </span> */}

                                  <Button
                                    onClick={() => {
                                      setSelectedUser(user);
                                      setQuestionModalOpen(true);
                                    }}
                                    className={`inline-flex items-center justify-center min-w-[32px] px-2 py-0.5 rounded-full text-xs font-semibold hover:cursor-pointer ${
                                      user.totalQuestions > 0
                                        ? "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300"
                                        : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                                    }`}
                                  >
                                    {user.totalQuestions.toLocaleString()}
                                  </Button>
                                </TableCell>

                                <TableCell className="align-middle font-medium whitespace-nowrap">
                                  {user.name}
                                </TableCell>
                                <TableCell className="align-middle whitespace-nowrap">
                                  {user.email}
                                </TableCell>
                                <TableCell className="align-middle whitespace-nowrap">
                                  {fp?.farmerName ?? "—"}
                                </TableCell>
                                <TableCell className="align-middle">
                                  {fp?.age ?? "—"}
                                </TableCell>
                                <TableCell className="align-middle whitespace-nowrap">
                                  {fp?.gender ?? "—"}
                                </TableCell>
                                <TableCell className="align-middle whitespace-nowrap">
                                  {fp?.villageName ?? "—"}
                                </TableCell>
                                <TableCell className="align-middle whitespace-nowrap">
                                  {fp?.blockName ?? "—"}
                                </TableCell>
                                <TableCell className="align-middle whitespace-nowrap">
                                  {fp?.district ?? "—"}
                                </TableCell>
                                <TableCell className="align-middle whitespace-nowrap">
                                  {fp?.state ?? "—"}
                                </TableCell>
                                <TableCell className="align-middle whitespace-nowrap">
                                  {fp?.phoneNo ?? "—"}
                                </TableCell>
                                <TableCell className="align-middle whitespace-nowrap">
                                  {fp?.languagePreference ?? "—"}
                                </TableCell>
                                <TableCell className="align-middle">
                                  {fp?.yearsOfExperience ?? "—"}
                                </TableCell>
                                <TableCell className="align-middle">
                                  <CropsCell crops={fp?.cropsCultivated} />
                                </TableCell>
                                <TableCell className="align-middle">
                                  <CropsCell crops={fp?.primaryCrop} />
                                </TableCell>
                                <TableCell className="align-middle">
                                  <CropsCell crops={fp?.secondaryCrop} />
                                </TableCell>
                                <TableCell className="align-middle">
                                  {fp?.awarenessOfKCC == null
                                    ? "—"
                                    : fp.awarenessOfKCC
                                      ? "Yes"
                                      : "No"}
                                </TableCell>
                                <TableCell className="align-middle">
                                  {fp?.usesAgriApps == null
                                    ? "—"
                                    : fp.usesAgriApps
                                      ? "Yes"
                                      : "No"}
                                </TableCell>
                                <TableCell className="align-middle whitespace-nowrap">
                                  {fp?.highestEducatedPerson ?? "—"}
                                </TableCell>
                                <TableCell className="align-middle">
                                  {fp?.numberOfSmartphones ?? "—"}
                                </TableCell>
                                <TableCell className="align-middle whitespace-nowrap">
                                  {fp?.platformHistory &&
                                  fp.platformHistory.length > 0 ? (
                                    <div className="flex flex-col items-center">
                                      <span>
                                        {
                                          fp.platformHistory[
                                            fp.platformHistory.length - 1
                                          ].os
                                        }
                                      </span>
                                      <span className="text-xs text-gray-400">
                                        {new Date(
                                          fp.platformHistory[
                                            fp.platformHistory.length - 1
                                          ].timestamp,
                                        ).toLocaleDateString("en-GB", {
                                          day: "2-digit",
                                          month: "2-digit",
                                          year: "2-digit",
                                        })}
                                      </span>
                                    </div>
                                  ) : (
                                    (fp?.platform ?? "—")
                                  )}
                                </TableCell>
                                <TableCell className="align-middle">
                                  {fp?.location?.latitude &&
                                  fp?.location?.longitude ? (
                                    <a
                                      href={`https://maps.google.com/?q=${fp.location.latitude},${fp.location.longitude}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title="View on Maps"
                                      className="inline-flex items-center justify-center p-1.5 rounded-full bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors cursor-pointer"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <MapPin className="h-4 w-4" />
                                    </a>
                                  ) : (
                                    "—"
                                  )}
                                </TableCell>
                              </TableRow>
                            </ContextMenuTrigger>
                            {isAdmin && (
                              <ContextMenuContent>
                                <ContextMenuItem
                                  className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950/50 cursor-pointer flex items-center gap-2"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirmEmail("");
                                    setUserToDelete({
                                      userId: user.userId,
                                      source,
                                      email: user.email,
                                    });
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 text-red-600" />
                                  Delete
                                </ContextMenuItem>
                              </ContextMenuContent>
                            )}
                          </ContextMenu>
                        );
                      })
                    )}
                  </TableBody>
                  <UserQuestionsModal
                    open={questionModalOpen}
                    onOpenChange={setQuestionModalOpen}
                    user={selectedUser}
                    source={source}
                    userType={userType}
                  />
                </Table>
                {/* Pagination footer */}
                {totalPages > 0 && (
                  <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
                      <span className="text-xs text-(--muted-foreground)">
                        Showing{" "}
                        {users.length > 0
                          ? (currentPage - 1) * pageSize + 1
                          : 0}
                        –{(currentPage - 1) * pageSize + users.length} of{" "}
                        {totalUsers} users
                      </span>
                      <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        onPageChange={(page) => setCurrentPage(page)}
                        limit={pageSize}
                        onLimitChange={setPageSize}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog
        open={!!userToDelete}
        onOpenChange={(open) => {
          if (!open) {
            setUserToDelete(null);
            setConfirmEmail("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              farmer and remove their data. To confirm this action, enter the
              email address <strong>{userToDelete?.email}</strong> in the box
              below.
            </AlertDialogDescription>
            <Input
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              placeholder="Enter email to confirm"
            />
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={confirmEmail !== userToDelete?.email}
              onClick={() => {
                if (userToDelete) {
                  deleteUserMutation.mutate(userToDelete);
                  setUserToDelete(null);
                  setConfirmEmail("");
                }
              }}
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
