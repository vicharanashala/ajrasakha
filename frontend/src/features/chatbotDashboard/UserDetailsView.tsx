import { useState, useEffect, useMemo, useRef } from "react";
import { X, MapPin, Maximize2, Trash2, Pencil, Users } from "lucide-react";
import { Button } from "@/components/atoms/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import { Spinner } from "@/components/atoms/spinner";
import { useUserDetails, type UserDetail } from "./hooks/useUserDetails";
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
import { useUpdateUser } from "./hooks/useUpdateUser";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/atoms/tooltip";
import { TopCropsCard } from "./components/TopCropsCard";
import { useTopCrops } from "./hooks/useTopCrops";
import { useDailyUserTrend } from "./hooks/useDailyUserTrend";
import UserQuestionsModal from "./UserQuestionModal";
import { EditFarmerModal } from "./components/EditFarmerModal";
import { AddFarmerModal } from "./components/AddFarmerModal";
import { useAddUser } from "./hooks/useAddUser";

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
  source?: "vicharanashala" | "annam" | "whatsapp";
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
  const updateUserMutation = useUpdateUser();
  const addUserMutation = useAddUser();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
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
  const [userToEdit, setUserToEdit] = useState<UserDetail | null>(null);
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
  } = useTopCrops(source);
  const [selectedUser, setSelectedUser] = useState<any>(null);

  const [questionModalOpen, setQuestionModalOpen] = useState(false);

  const {
    data: dauTrend,
    isLoading: dauLoading,
    error: dauError,
  } = useDailyUserTrend(
    30,
    source,
    filters.userType,
    source === "annam" || source === "vicharanashala",
  );
  // console.log("DAU Trend data:", dauTrend, "Loading:", dauLoading, "Error:", dauError);

  // console.log("Dashboard data in UserDetailsView:", dashboardData, "Loading:", isDashboardLoading, "Error:", error);

  // console.log(
  //   "DAU Trend data:",
  //   dauTrend,
  //   "Loading:",
  //   dauLoading,
  //   "Error:",
  //   dauError,
  // );

  // console.log(
  //   "Dashboard data in UserDetailsView:",
  //   dashboardData,
  //   "Loading:",
  //   isDashboardLoading,
  //   "Error:",
  //   error,
  // );

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

  const handleSaveEditedUser = async (payload: {
    name?: string;
    role?: string;
    farmerProfile?: {
      farmerName?: string;
      age?: number;
      gender?: string | null;
      villageName?: string | null;
      blockName?: string | null;
      district?: string | null;
      state?: string | null;
      phoneNo?: string;
      nearestKVK?: string;
      languagePreference?: string;
      yearsOfExperience?: number;
      landhold?: number;
      cropsCultivated?: string[];
      primaryCrop?: string;
      secondaryCrop?: string;
      awarenessOfKCC?: boolean;
      usesAgriApps?: boolean;
      highestEducatedPerson?: string | null;
      numberOfSmartphones?: number;
      platform?: string;
      platformHistory?: { os: string; timestamp: string }[];
    };
  }) => {
    console.log("Payload is----", payload)
    if (!userToEdit) return;
    await updateUserMutation.mutateAsync({
      userId: userToEdit.userId,
      source,
      data: payload,
    });
    setUserToEdit(null);
  };

  const handleAddUser = async (payload: {
    email: string;
    name: string;
    password: string;
    role?: string;
  }) => {
    await addUserMutation.mutateAsync({
      source,
      data: payload,
    });
    setIsAddModalOpen(false);
  };

  return (
    <div className="flex-1 overflow-y-auto pb-5 min-w-0 ">
      {/* Users table */}
      <div ref={tableRef}>
        <Card
          className="bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow duration-300     
 dark:border-[#2a2a2a]"
        >
          <CardHeader className="pb-4 border-b">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              {/* Title Section */}
              <div className="min-w-0">
                <CardTitle className="text-base font-semibold tracking-tight flex items-center gap-2">
                  <div className="p-1.5 rounded-md bg-primary/10">
                    <Users className="h-4 w-4 text-primary" />
                  </div>
                  All Farmers
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  View and manage farmer details, activity, and preferences.
                </p>
              </div>

              {/* Actions Section */}
              <div className="flex items-center gap-2 flex-wrap lg:flex-nowrap">
                {isFiltered && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 px-3"
                    onClick={handleResetFilters}
                  >
                    <X className="h-4 w-4 mr-1.5" />
                    Clear Filters
                  </Button>
                )}

                {isAdmin &&
                  (source === "annam" || source === "vicharanashala") && (
                    <Button
                      variant="default"
                      size="sm"
                      className="h-9 px-3 bg-primary hover:bg-primary/90 text-white font-medium shadow-sm transition-colors duration-200 flex items-center gap-1.5"
                      onClick={() => setIsAddModalOpen(true)}
                    >
                      <Users className="h-4 w-4" />
                      Add Farmer
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
                          // <ContextMenu key={user.userId}>
                          //   <ContextMenuTrigger asChild>
                          //     <TableRow className="text-center">
                          //       <TableCell className="align-middle">
                          //         {(currentPage - 1) * pageSize + idx + 1}
                          //       </TableCell>
                          //       <TableCell className="align-middle">
                          //         {/* <span
                          //     className={`inline-flex items-center justify-center min-w-[32px] px-2 py-0.5 rounded-full text-xs font-semibold ${
                          //       user.totalQuestions > 0
                          //         ? "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300"
                          //         : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                          //     }`}
                          //   >
                          //     {user.totalQuestions.toLocaleString()}
                          //   </span> */}

                          //         <Button
                          //           onClick={() => {
                          //             setSelectedUser(user);
                          //             setQuestionModalOpen(true);
                          //           }}
                          //           className={`inline-flex items-center justify-center min-w-[32px] px-2 py-0.5 rounded-full text-xs font-semibold hover:cursor-pointer ${
                          //             user.totalQuestions > 0
                          //               ? "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300"
                          //               : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                          //           }`}
                          //         >
                          //           {user.totalQuestions.toLocaleString()}
                          //         </Button>
                          //       </TableCell>

                          //       <TableCell className="align-middle font-medium whitespace-nowrap">
                          //         {user.name}
                          //       </TableCell>
                          //       <TableCell className="align-middle whitespace-nowrap">
                          //         {user.email}
                          //       </TableCell>
                          //       <TableCell className="align-middle whitespace-nowrap">
                          //         {fp?.farmerName ?? "—"}
                          //       </TableCell>
                          //       <TableCell className="align-middle">
                          //         {fp?.age ?? "—"}
                          //       </TableCell>
                          //       <TableCell className="align-middle whitespace-nowrap">
                          //         {fp?.gender ?? "—"}
                          //       </TableCell>
                          //       <TableCell className="align-middle whitespace-nowrap">
                          //         {fp?.villageName ?? "—"}
                          //       </TableCell>
                          //       <TableCell className="align-middle whitespace-nowrap">
                          //         {fp?.blockName ?? "—"}
                          //       </TableCell>
                          //       <TableCell className="align-middle whitespace-nowrap">
                          //         {fp?.district ?? "—"}
                          //       </TableCell>
                          //       <TableCell className="align-middle whitespace-nowrap">
                          //         {fp?.state ?? "—"}
                          //       </TableCell>
                          //       <TableCell className="align-middle whitespace-nowrap">
                          //         {fp?.phoneNo ?? "—"}
                          //       </TableCell>
                          //       <TableCell className="align-middle whitespace-nowrap">
                          //         {fp?.languagePreference ?? "—"}
                          //       </TableCell>
                          //       <TableCell className="align-middle">
                          //         {fp?.yearsOfExperience ?? "—"}
                          //       </TableCell>
                          //       <TableCell className="align-middle">
                          //         <CropsCell crops={fp?.cropsCultivated} />
                          //       </TableCell>
                          //       <TableCell className="align-middle">
                          //         <CropsCell crops={fp?.primaryCrop} />
                          //       </TableCell>
                          //       <TableCell className="align-middle">
                          //         <CropsCell crops={fp?.secondaryCrop} />
                          //       </TableCell>
                          //       <TableCell className="align-middle">
                          //         {fp?.awarenessOfKCC == null
                          //           ? "—"
                          //           : fp.awarenessOfKCC
                          //             ? "Yes"
                          //             : "No"}
                          //       </TableCell>
                          //       <TableCell className="align-middle">
                          //         {fp?.usesAgriApps == null
                          //           ? "—"
                          //           : fp.usesAgriApps
                          //             ? "Yes"
                          //             : "No"}
                          //       </TableCell>
                          //       <TableCell className="align-middle whitespace-nowrap">
                          //         {fp?.highestEducatedPerson ?? "—"}
                          //       </TableCell>
                          //       <TableCell className="align-middle">
                          //         {fp?.numberOfSmartphones ?? "—"}
                          //       </TableCell>
                          //       <TableCell className="align-middle whitespace-nowrap">
                          //         {fp?.platformHistory &&
                          //         fp.platformHistory.length > 0 ? (
                          //           <div className="flex flex-col items-center">
                          //             <span>
                          //               {
                          //                 fp.platformHistory[
                          //                   fp.platformHistory.length - 1
                          //                 ].os
                          //               }
                          //             </span>
                          //             <span className="text-xs text-gray-400">
                          //               {new Date(
                          //                 fp.platformHistory[
                          //                   fp.platformHistory.length - 1
                          //                 ].timestamp,
                          //               ).toLocaleDateString("en-GB", {
                          //                 day: "2-digit",
                          //                 month: "2-digit",
                          //                 year: "2-digit",
                          //               })}
                          //             </span>
                          //           </div>
                          //         ) : (
                          //           (fp?.platform ?? "—")
                          //         )}
                          //       </TableCell>
                          //       <TableCell className="align-middle">
                          //         {fp?.location?.latitude &&
                          //         fp?.location?.longitude ? (
                          //           <a
                          //             href={`https://maps.google.com/?q=${fp.location.latitude},${fp.location.longitude}`}
                          //             target="_blank"
                          //             rel="noopener noreferrer"
                          //             title="View on Maps"
                          //             className="inline-flex items-center justify-center p-1.5 rounded-full bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors cursor-pointer"
                          //             onClick={(e) => e.stopPropagation()}
                          //           >
                          //             <MapPin className="h-4 w-4" />
                          //           </a>
                          //         ) : (
                          //           "—"
                          //         )}
                          //       </TableCell>
                          //     </TableRow>
                          //   </ContextMenuTrigger>
                          //   {isAdmin && (
                          //     <ContextMenuContent>
                          //       <ContextMenuItem
                          //         className="cursor-pointer flex items-center gap-2"
                          //         onClick={(e) => {
                          //           e.stopPropagation();
                          //           setUserToEdit(user);
                          //         }}
                          //       >
                          //         <Pencil className="h-4 w-4" />
                          //         Edit
                          //       </ContextMenuItem>
                          //       <ContextMenuItem
                          //         className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950/50 cursor-pointer flex items-center gap-2"
                          //         onClick={(e) => {
                          //           e.stopPropagation();
                          //           setConfirmEmail("");
                          //           setUserToDelete({
                          //             userId: user.userId,
                          //             source,
                          //             email: user.email,
                          //           });
                          //         }}
                          //       >
                          //         <Trash2 className="h-4 w-4 text-red-600" />
                          //         Delete
                          //       </ContextMenuItem>
                          //     </ContextMenuContent>
                          //   )}
                          // </ContextMenu>
                          // ─── Drop-in replacement for your existing ContextMenu block ─────────────────
                          // All state references (currentPage, pageSize, setSelectedUser, setQuestionModalOpen,
                          // setUserToEdit, setConfirmEmail, setUserToDelete, source, isAdmin) remain unchanged.
                          // Only the visuals are improved.

                          <ContextMenu key={user.userId} modal={false}>
                            <ContextMenuTrigger asChild>
                              <TableRow className="group text-center hover:bg-muted/40 transition-colors duration-100">
                                {/* S.No */}
                                <TableCell className="align-middle text-xs text-muted-foreground tabular-nums">
                                  {(currentPage - 1) * pageSize + idx + 1}
                                </TableCell>

                                {/* Queries asked */}
                                <TableCell className="align-middle">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setSelectedUser(user);
                                      setQuestionModalOpen(true);
                                      console.log("Button clicked")
                                    }}
                                    className={`inline-flex items-center justify-center min-w-[32px] h-6 px-2 rounded-full text-xs font-semibold transition-colors ${
                                      user.totalQuestions > 0
                                        ? "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900"
                                        : "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-default"
                                    }`}
                                    title={
                                      
                                        "View queries"
                                    
                                    }
                                  >
                                    {user.totalQuestions.toLocaleString()}
                                  </Button>
                                </TableCell>

                                {/* Name */}
                                <TableCell className="align-middle font-medium whitespace-nowrap">
                                  {user.name}
                                </TableCell>

                                {/* Email */}
                                <TableCell className="align-middle whitespace-nowrap text-xs text-muted-foreground">
                                  {user.email}
                                </TableCell>

                                {/* Farmer Name */}
                                <TableCell className="align-middle whitespace-nowrap">
                                  {fp?.farmerName ?? (
                                    <span className="text-muted-foreground">
                                      —
                                    </span>
                                  )}
                                </TableCell>

                                {/* Age */}
                                <TableCell className="align-middle tabular-nums">
                                  {fp?.age ?? (
                                    <span className="text-muted-foreground">
                                      —
                                    </span>
                                  )}
                                </TableCell>

                                {/* Gender */}
                                <TableCell className="align-middle">
                                  {fp?.gender ? (
                                    <span
                                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                        fp.gender?.toUpperCase() === "MALE"
                                          ? "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300"
                                          : fp.gender?.toUpperCase() ===
                                              "FEMALE"
                                            ? "bg-pink-50 dark:bg-pink-950 text-pink-700 dark:text-pink-300"
                                            : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                                      }`}
                                    >
                                      {fp.gender}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">
                                      —
                                    </span>
                                  )}
                                </TableCell>

                                {/* Village */}
                                <TableCell className="align-middle whitespace-nowrap">
                                  {fp?.villageName ?? (
                                    <span className="text-muted-foreground">
                                      —
                                    </span>
                                  )}
                                </TableCell>

                                {/* Block */}
                                <TableCell className="align-middle whitespace-nowrap">
                                  {fp?.blockName ?? (
                                    <span className="text-muted-foreground">
                                      —
                                    </span>
                                  )}
                                </TableCell>

                                {/* District */}
                                <TableCell className="align-middle whitespace-nowrap">
                                  {fp?.district ?? (
                                    <span className="text-muted-foreground">
                                      —
                                    </span>
                                  )}
                                </TableCell>

                                {/* State */}
                                <TableCell className="align-middle whitespace-nowrap">
                                  {fp?.state ?? (
                                    <span className="text-muted-foreground">
                                      —
                                    </span>
                                  )}
                                </TableCell>

                                {/* Phone */}
                                <TableCell className="align-middle whitespace-nowrap">
                                  {fp?.phoneNo ? (
                                    <a
                                      href={`tel:${fp.phoneNo}`}
                                      className="text-blue-600 dark:text-blue-400 hover:underline text-xs tabular-nums"
                                    >
                                      {fp.phoneNo}
                                    </a>
                                  ) : (
                                    <span className="text-muted-foreground">
                                      —
                                    </span>
                                  )}
                                </TableCell>

                                {/* Language */}
                                <TableCell className="align-middle whitespace-nowrap">
                                  {fp?.languagePreference ?? (
                                    <span className="text-muted-foreground">
                                      —
                                    </span>
                                  )}
                                </TableCell>

                                {/* Experience */}
                                <TableCell className="align-middle tabular-nums">
                                  {fp?.yearsOfExperience != null ? (
                                    <span>
                                      {fp.yearsOfExperience}{" "}
                                      <span className="text-muted-foreground text-xs">
                                        yrs
                                      </span>
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">
                                      —
                                    </span>
                                  )}
                                </TableCell>

                                {/* Crops cultivated */}
                                <TableCell className="align-middle">
                                  <CropsCell crops={fp?.cropsCultivated} />
                                </TableCell>

                                {/* Primary crop */}
                                <TableCell className="align-middle">
                                  <CropsCell crops={fp?.primaryCrop} />
                                </TableCell>

                                {/* Secondary crop */}
                                <TableCell className="align-middle">
                                  <CropsCell crops={fp?.secondaryCrop} />
                                </TableCell>

                                {/* KCC Aware */}
                                <TableCell className="align-middle">
                                  {fp?.awarenessOfKCC == null ? (
                                    <span className="text-muted-foreground">
                                      —
                                    </span>
                                  ) : fp.awarenessOfKCC ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300">
                                      Yes
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400">
                                      No
                                    </span>
                                  )}
                                </TableCell>

                                {/* Agri Apps */}
                                <TableCell className="align-middle">
                                  {fp?.usesAgriApps == null ? (
                                    <span className="text-muted-foreground">
                                      —
                                    </span>
                                  ) : fp.usesAgriApps ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300">
                                      Yes
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400">
                                      No
                                    </span>
                                  )}
                                </TableCell>

                                {/* Education */}
                                <TableCell className="align-middle whitespace-nowrap">
                                  {fp?.highestEducatedPerson ?? (
                                    <span className="text-muted-foreground">
                                      —
                                    </span>
                                  )}
                                </TableCell>

                                {/* Smartphones */}
                                <TableCell className="align-middle tabular-nums">
                                  {fp?.numberOfSmartphones ?? (
                                    <span className="text-muted-foreground">
                                      —
                                    </span>
                                  )}
                                </TableCell>

                                {/* Platform */}
                                <TableCell className="align-middle whitespace-nowrap">
                                  {fp?.platformHistory &&
                                  fp.platformHistory.length > 0 ? (
                                    <div className="flex flex-col items-center leading-tight gap-0.5">
                                      <span className="font-medium text-xs">
                                        {
                                          fp.platformHistory[
                                            fp.platformHistory.length - 1
                                          ].os
                                        }
                                      </span>
                                      <span className="text-[11px] text-muted-foreground tabular-nums">
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
                                  ) : fp?.platform ? (
                                    <span className="text-xs">
                                      {fp.platform}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">
                                      —
                                    </span>
                                  )}
                                </TableCell>

                                {/* Location */}
                                <TableCell className="align-middle">
                                  {fp?.location?.latitude &&
                                  fp?.location?.longitude ? (
                                    <a
                                      href={`https://maps.google.com/?q=${fp.location.latitude},${fp.location.longitude}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title="View on Google Maps"
                                      className="inline-flex items-center justify-center p-1.5 rounded-full bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <MapPin className="h-4 w-4" />
                                    </a>
                                  ) : (
                                    <span className="text-muted-foreground">
                                      —
                                    </span>
                                  )}
                                </TableCell>
                              </TableRow>
                            </ContextMenuTrigger>

                            {isAdmin && (
                              <ContextMenuContent>
                                <ContextMenuItem
                                  className="cursor-pointer flex items-center gap-2"
                                  onSelect={() => {
                                    setUserToEdit(user);
                                  }}
                                >
                                  <Pencil className="h-4 w-4" />
                                  Edit
                                </ContextMenuItem>
                                <ContextMenuItem
                                  className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950/50 cursor-pointer flex items-center gap-2"
                                  onSelect={() => {
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
            <UserQuestionsModal
              open={questionModalOpen}
              onOpenChange={setQuestionModalOpen}
              user={selectedUser}
              source={source}
              userType={userType}
            />
          </CardContent>
        </Card>
      </div>

      <AddFarmerModal
        open={isAddModalOpen}
        onOpenChange={setIsAddModalOpen}
        isSaving={addUserMutation.isPending}
        onSave={handleAddUser}
      />

      <EditFarmerModal
        open={!!userToEdit}
        onOpenChange={(open) => {
          if (!open) setUserToEdit(null);
        }}
        user={userToEdit}
        isSaving={updateUserMutation.isPending}
        onSave={handleSaveEditedUser}
      />

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
