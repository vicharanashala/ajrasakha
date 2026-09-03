import { useState, useEffect, useRef } from "react";
import {
  Eye,
  X,
  Trash2,
  Pencil,
  Users,
  InfoIcon,
  UserPlus,
  Search,
  AlertCircle,
  Inbox,
  ArrowUpDown,
  ArrowDown,
  ArrowUp,
  UserCheck2,
  Loader2,
  RefreshCw,
  ShieldX,
  User,
  Shield,
  Briefcase,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/atoms/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/atoms/tooltip";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import { Skeleton } from "@/components/atoms/skeleton";
import { useUserDetails, type UserDetail } from "./hooks/useUserDetails";
// import { useDashboardData } from "./hooks/useDashboardData";
// import { BarGraph } from "./components/shared/BarGrapgh";
import { Pagination } from "@/components/pagination";
// import { createPortal } from "react-dom";
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
import { useChangeUserPassword } from "./hooks/useChangeUserPassword";
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
// import { TopCropsCard } from "./components/TopCropsCard";
// import { useTopCrops } from "./hooks/useTopCrops";
// import { useDailyUserTrend } from "./hooks/useDailyUserTrend";
import UserQuestionsModal from "./UserQuestionModal";
import { EditFarmerModal } from "./components/EditFarmerModal";
import { AddFarmerModal } from "./components/AddFarmerModal";
import { FarmerDetailsModal } from "./components/FarmerDetailsModal";
import { FarmerNameLink } from "./components/FarmerNameLink";
import { useAddUser } from "./hooks/useAddUser";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/atoms/badge";
import { useDebounce } from "@/hooks/ui/useDebounce";
import { useVerifyUserAnalytics } from "@/hooks/api/user/useVerifyUserAnalytics";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const EMPTY_VALUE = "Not provided";

function EmptyValue() {
  return <span className="text-muted-foreground">{EMPTY_VALUE}</span>;
}

const DEFAULT_FILTERS: UserDetailsFilters = {
  search: "",
  crop: "",
  primaryCrops: [],
  secondaryCrops: [],
  roles: [],
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
  verificationStatus: "all",
  loginStatus: "all",
};

const rolesForUserType = (value: "all" | "external" | "internal"): string[] => {
  if (value === "external") {
    return [
      "Farmer",
      "district_coordinator",
      "block_coordinator",
      "village_volunteer",
    ];
  }
  if (value === "internal") return ["Internal"];
  return [];
};

interface UserDetailsViewProps {
  source?: "vicharanashala" | "annam" | undefined;
  initialFilters?: Partial<UserDetailsFilters>;
  userType?: "all" | "external" | "internal";
}

export function UserDetailsView({
  source = "vicharanashala",
  initialFilters,
  userType = "all",
}: UserDetailsViewProps) {
  const { data: currentUser } = useGetCurrentUser({});
  const verifyUserMutation = useVerifyUserAnalytics();
  const [verifyingUserId, setVerifyingUserId] = useState<string | null>(null);
  const isAdmin = currentUser?.role === "admin";
  const deleteUserMutation = useDeleteUser();
  const updateUserMutation = useUpdateUser();
  const changeUserPasswordMutation = useChangeUserPassword();
  const addUserMutation = useAddUser();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [filters, setFilters] = useState<UserDetailsFilters>(() => ({
    ...DEFAULT_FILTERS,
    ...initialFilters,
    roles: initialFilters?.roles ?? rolesForUserType(userType),
  }));
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [sortBy, setSortBy] = useState<
    "totalQuestions" | "name" | "farmerName" | "email"
  >("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  // const [isBarGraphMaximized, setIsBarGraphMaximized] = useState(false);
  // const [isKnowledgeMaximized, setIsKnowledgeMaximized] = useState(false);
  // const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<{
    userId: string;
    source: string;
    email: string;
  } | null>(null);
  const [verificationToConfirm, setVerificationToConfirm] = useState<{
    userId: string;
    source: string;
    name: string;
    email: string;
    isVerified: boolean;
  } | null>(null);
  const [pendingVerification, setPendingVerification] = useState<{
    user: UserDetail;
    nextStatus: boolean;
  } | null>(null);

  const [userToEdit, setUserToEdit] = useState<UserDetail | null>(null);
  const [userToView, setUserToView] = useState<UserDetail | null>(null);
  const [confirmEmail, setConfirmEmail] = useState("");
  // const [hovered, setHovered] = useState<string | null>(null);
  // const [agriHovered, setAgriHovered] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const debouncedSearch = useDebounce(filters.search, 500);

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

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch]);

  // useEffect(() => {
  //   scrollToTable();
  // }, []);

  // Apply initialFilters when they change (e.g. clicking from AlertCard in overview)
  // Note: We don't auto-scroll here because the parent dashboard handles scrolling
  // via the scrollTo function when handlers are called
  useEffect(() => {
    if (initialFilters) {
      setFilters((prev) => ({
        ...prev,
        ...initialFilters,
        roles: initialFilters.roles ?? rolesForUserType(userType),
        profileCompleted:
          initialFilters.profileCompleted ??
          (userType === "internal" ? "all" : prev.profileCompleted),
      }));
      setCurrentPage(1);
    }
  }, [initialFilters, userType]);

  useEffect(() => {
    setFilters((prev) => ({
      ...prev,
      roles: rolesForUserType(userType),
      profileCompleted: userType === "internal" ? "all" : prev.profileCompleted,
    }));
    setCurrentPage(1);
  }, [userType]);

  const { data, isLoading, error } = useUserDetails(
    filters.startTime,
    filters.endTime,
    currentPage,
    pageSize,
    debouncedSearch,
    source,
    filters.crop,
    filters.primaryCrops,
    filters.secondaryCrops,
    filters.village,
    filters.state,
    filters.district,
    filters.block,
    filters.profileCompleted,
    filters.inactiveOnly,
    filters.lowFeedbackOnly,
    userType,
    filters.roles,
    sortBy,
    sortOrder,
    false,
    "",
    filters.verificationStatus,
    true,
    filters.loginStatus,
  );

  const {
    users,
    totalUsers,
    totalPages,
    // activeUsers,
    // inactiveUsers,
    // totalQuestions,
  } = data;

  // Fetch dashboard data with the same filters for charts
  // const dashboardFilters = {
  //   village: filters.village || "all",
  //   crop: filters.crop || "all",
  //   season: "all",
  //   startTime: filters.startTime,
  //   endTime: filters.endTime,
  //   userType: userType,
  // };
  // const { data: dashboardData, isLoading: isDashboardLoading } =
  //   useDashboardData(dashboardFilters, source);
  // const {
  //   data: topCrops,
  //   isLoading: isLoadingTopCrops,
  //   error: errorLoadingTopCrops,
  // } = useTopCrops(source);
  const [selectedUser, setSelectedUser] = useState<any>(null);

  const [questionModalOpen, setQuestionModalOpen] = useState(false);

  // const {
  //   data: dauTrend,
  //   isLoading: dauLoading,
  //   error: dauError,
  //   } = useDailyUserTrend(
  //   30,
  //   source,
  //   filters.userType,
  //   source === "annam" || source === "vicharanashala",
  // );
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

  // const todayCount =
  //   dauTrend && dauTrend.length > 0 ? dauTrend[dauTrend.length - 1] : null;

  // Patch the DAU card to show "active today / total" instead of just total (same as dashboard)
  // const patchedKpiRow1 = useMemo(() => {
  //   if (!dashboardData?.kpiRow1) return [];
  //   // Use activeUsers from user details as the "today" count (users with activity in the filtered period)
  //   // This makes sense in the context of User Details page where we're showing filtered data
  //   return dashboardData.kpiRow1.map((card) => {
  //     if (card.id === "dau") {
  //       return {
  //         ...card,
  //         value: `${todayCount?.toLocaleString()} / ${Number(card.value).toLocaleString()}`,
  //       };
  //     }
  //     return card;
  //   });
  // }, [dashboardData?.kpiRow1, activeUsers, totalUsers]);

  // Mark cards as dummy (to blur them) - same logic as dashboard
  // const dynamicIds = ["dau", "queries", "session"];
  // const kpiRow1WithOverlay = patchedKpiRow1.map((card) => ({
  //   ...card,
  //   isDummy: !dynamicIds.includes(card.id),
  // }));

  // const kpiRow2WithOverlay =
  //   dashboardData?.kpiRow2.map((card) => ({
  //     ...card,
  //     isDummy: card.id !== "totalInstalls",
  //   })) || [];

  const handleApplyFilters = (newFilters: UserDetailsFilters) => {
    setFilters(newFilters);
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setCurrentPage(1);
  };

  const handleSort = (
    newSortBy: "totalQuestions" | "name" | "farmerName" | "email",
  ) => {
    if (sortBy === newSortBy) {
      // Toggle sort order if same field
      setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"));
    } else {
      // Change field and set default sort order
      setSortBy(newSortBy);
      setSortOrder(
        newSortBy === "name" ||
          newSortBy === "farmerName" ||
          newSortBy === "email"
          ? "asc"
          : "desc",
      );
    }
    setCurrentPage(1);
  };

  const isFiltered =
    filters.search ||
    filters.crop ||
    filters.primaryCrops.length > 0 ||
    filters.secondaryCrops.length > 0 ||
    filters.village ||
    filters.block ||
    filters.district ||
    filters.state ||
    filters.startTime ||
    filters.profileCompleted !== "all" ||
    filters.inactiveOnly ||
    filters.lowFeedbackOnly ||
    filters.verificationStatus !== "all" ||
    filters.loginStatus !== "all";

  // const dateLabel =
  //   filters.startTime && filters.endTime
  //     ? `${filters.startTime.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} – ${filters.endTime.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`
  //     : "All time";

  const handleSaveEditedUser = async (payload: {
    name?: string;
    userRole?: string;
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
    // console.log("Payload is----", payload)
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
    userRole?: string;
    role?: "district_coordinator" | "block_coordinator" | "village_volunteer";
    isVerified?: boolean;
    target: "web_app" | "review_system";
  }) => {
    await addUserMutation.mutateAsync({
      source,
      data: payload,
    });
    setIsAddModalOpen(false);
  };

  const handleChangeViewedUserPassword = async (payload: {
    newPassword: string;
    keepLoggedIn: boolean;
  }) => {
    if (!userToView) return;
    await changeUserPasswordMutation.mutateAsync({
      userId: userToView.userId,
      source,
      newPassword: payload.newPassword,
      keepLoggedIn: payload.keepLoggedIn,
    });
  };

  const handleEditUser = (user: UserDetail) => {
    setUserToView(null);
    setUserToEdit(user);
  };

  const handleUpdateVerification = async (
    userId: string,
    source: string,
    isVerified: boolean,
  ) => {
    setVerifyingUserId(userId);

    try {
      const response = await verifyUserMutation.mutateAsync({
        userId,
        source,
        isVerified,
      });

      toast.success(
        response?.message ||
          (isVerified
            ? "User verified successfully"
            : "User marked unverified successfully"),
      );
    } catch (error: any) {
      toast.error(error?.message || "Failed to update verification status");
    } finally {
      setVerifyingUserId(null);
    }
  };

  const requestVerificationChange = (user: UserDetail, nextStatus: boolean) => {
    console.log(
      "Requesting verification change for user:",
      user,
      "Next status:",
      nextStatus,
    );
    setVerificationToConfirm({
      userId: user.userId,
      source,
      name: user.name || user.farmerProfile?.farmerName || EMPTY_VALUE,
      email: user.email,
      isVerified: nextStatus,
    });
  };

  // const handleConfirmVerificationChange = async () => {
  //   if (!verificationToConfirm) return;
  //   await handleUpdateVerification(
  //     verificationToConfirm.userId,
  //     verificationToConfirm.source,
  //     verificationToConfirm.isVerified,
  //   );
  //   setVerificationToConfirm(null);
  // };

  const handleConfirmVerificationChange = async () => {
    if (!verificationToConfirm) return;

    try {
      await handleUpdateVerification(
        verificationToConfirm.userId,
        verificationToConfirm.source,
        verificationToConfirm.isVerified,
      );
    } finally {
      setVerificationToConfirm(null);
    }
  };

  const handleDeleteUser = (user: UserDetail) => {
    setUserToView(null);
    setConfirmEmail("");
    setUserToDelete({
      userId: user.userId,
      source,
      email: user.email,
    });
  };

  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => {
    setRefreshing(true);
    await queryClient.refetchQueries({ queryKey: ["user-details"] });
    setRefreshing(false);
  };

  useEffect(() => {
    if (!userToView && pendingVerification) {
      setVerificationToConfirm({
        userId: pendingVerification.user.userId,
        source,
        name:
          pendingVerification.user.name ||
          pendingVerification.user.farmerProfile?.farmerName ||
          EMPTY_VALUE,
        email: pendingVerification.user.email,
        isVerified: pendingVerification.nextStatus,
      });

      setPendingVerification(null);
    }
  }, [userToView, pendingVerification, source]);

  return (
    <div className="flex-1 overflow-y-auto  min-w-0 bg-gradient-to-b from-background to-muted/30">
      <div ref={tableRef}>
        <Card className="bg-gradient-to-br from-card to-card/50 backdrop-blur-sm border-border/60 shadow-sm hover:shadow-md transition-shadow duration-300">
          {/* ─────────── Header ─────────── */}
          <CardHeader className="pb-4 border-b border-border/60">
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"
            >
              {/* Title */}
              <div className="min-w-0 flex items-start gap-3">
                <motion.div
                  whileHover={{ rotate: -6, scale: 1.05 }}
                  transition={{ type: "spring", stiffness: 300, damping: 18 }}
                  className="p-2 rounded-lg bg-primary/10 ring-1 ring-primary/15 shrink-0"
                >
                  <Users className="h-4 w-4 text-primary" />
                </motion.div>
                <div className="min-w-0">
                  <CardTitle className="text-base font-semibold tracking-tight truncate">
                    All Farmers
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    View and manage farmer details, activity, and preferences.
                  </p>
                </div>
              </div>

              {/* Search */}
              <div className="relative w-full lg:max-w-xs lg:flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  type="text"
                  name="farmer-table-search"
                  autoComplete="off"
                  placeholder="Search by name or email..."
                  value={filters.search}
                  onChange={(e) =>
                    setFilters((d) => ({ ...d, search: e.target.value }))
                  }
                  className="h-10 pl-9 pr-9 bg-background focus-visible:ring-primary/30 focus-visible:border-primary transition-all"
                />
                <AnimatePresence>
                  {filters.search && (
                    <motion.button
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      onClick={() => setFilters((d) => ({ ...d, search: "" }))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      aria-label="Clear search"
                    >
                      <X className="h-3.5 w-3.5" />
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-wrap lg:flex-nowrap lg:justify-end">
                <AnimatePresence>
                  {isFiltered && (
                    <motion.div
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 8 }}
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-9 px-3 text-muted-foreground hover:text-foreground"
                        onClick={handleResetFilters}
                      >
                        <X className="h-4 w-4 mr-1.5" />
                        Clear Filters
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>

                <button
                  onClick={handleRefresh}
                  className="rounded-lg p-1.5 shadow-sm backdrop-blur-sm transition-all duration-200"
                  title="Refresh"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 bg-background ${
                      refreshing ? "animate-spin" : ""
                    }`}
                  />
                </button>

                <UserDetailsPreferenceFilter
                  filters={filters}
                  onApply={handleApplyFilters}
                  hideFields={["userType"]}
                />

                {isAdmin &&
                  (source === "annam" || source === "vicharanashala") && (
                    <motion.div
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.97 }}
                    >
                      <Button
                        type="button"
                        size="sm"
                        className="h-9 px-3.5 gap-1.5 shadow-sm shadow-primary/20"
                        onClick={() => {
                          setFilters((prev) => ({ ...prev, search: "" }));
                          setIsAddModalOpen(true);
                        }}
                      >
                        <UserPlus className="h-4 w-4" />
                        Add User
                      </Button>
                    </motion.div>
                  )}
              </div>
            </motion.div>
          </CardHeader>

          {/* ─────────── Content ─────────── */}
          <CardContent className="p-0">
            {/* Loading */}
            {(refreshing || isLoading) && (
              <div className="space-y-2 p-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-md" />
                ))}
              </div>
            )}

            {/* Error */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center"
              >
                <div className="p-3 rounded-full bg-destructive/10">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                </div>
                <p className="text-sm font-medium text-foreground">
                  Something went wrong
                </p>
                <p className="text-xs text-muted-foreground">
                  Failed to load user details. Please try again.
                </p>
              </motion.div>
            )}

            {/* Table */}
            {!refreshing && !isLoading && !error && (
              <div className="overflow-x-auto">
                <Table className="min-w-[980px]">
                  <TableHeader className="bg-muted/40 sticky top-0 z-10 backdrop-blur">
                    <TableRow className="hover:bg-transparent border-border/60">
                      <TableHead className="text-center w-12 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        S.No
                      </TableHead>

                      <SortableHead
                        label="Name"
                        field="name"
                        active={sortBy === "name"}
                        order={sortOrder}
                        onSort={handleSort}
                      />

                      <SortableHead
                        label="Farmer Name"
                        field="farmerName"
                        active={sortBy === "farmerName"}
                        order={sortOrder}
                        onSort={handleSort}
                      />
                      <SortableHead
                        label="Email"
                        field="email"
                        active={sortBy === "email"}
                        order={sortOrder}
                        onSort={handleSort}
                      />
                      <TableHead className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        User Role
                      </TableHead>

                      <SortableHead
                        label="Query Asked"
                        field="totalQuestions"
                        active={sortBy === "totalQuestions"}
                        order={sortOrder}
                        onSort={handleSort}
                      />

                      <TableHead className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {users.length === 0 ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={7} className="text-center py-16">
                          <div className="flex flex-col items-center gap-2 text-muted-foreground">
                            <div className="p-3 rounded-full bg-muted">
                              <Inbox className="h-5 w-5" />
                            </div>
                            <p className="text-sm font-medium text-foreground">
                              {isFiltered
                                ? "No matches found"
                                : "No farmers yet"}
                            </p>
                            <p className="text-xs">
                              {isFiltered
                                ? "Try adjusting your filters or search."
                                : "Farmers you add will appear here."}
                            </p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      users.map((user, idx) => {
                        const isVerifyingThisUser =
                          verifyingUserId === user.userId;
                        // Default to `false` (not verified) when the field is
                        // missing so a stale/undefined cache entry does not
                        // silently hide the verify button. The backend always
                        // returns a boolean, so this fallback only kicks in for
                        // legacy records that lack the field.
                        const isUserVerified = user.isVerified ?? false;
                        return (
                          <ContextMenu key={user.userId} modal={false}>
                            <ContextMenuTrigger asChild>
                              <motion.tr
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{
                                  duration: 0.18,
                                  delay: Math.min(idx * 0.02, 0.2),
                                }}
                                className="group text-center border-b border-border/40 hover:bg-muted/40 transition-colors duration-150"
                              >
                                <TableCell className="align-middle text-xs text-muted-foreground tabular-nums">
                                  {(currentPage - 1) * pageSize + idx + 1}
                                </TableCell>

                                <TableCell className="align-middle font-medium whitespace-nowrap">
                                  <div className="inline-flex items-center justify-center gap-1.5">
                                    {currentUser?.role === "admin" ? (
                                      <FarmerNameLink userId={user.userId}>
                                        {user.name || <EmptyValue />}
                                      </FarmerNameLink>
                                    ) : (
                                      <span>{user.name || <EmptyValue />}</span>
                                    )}
                                    {!isUserVerified && (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <ShieldX className="h-4 w-4 text-orange-500" />
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          Not verified
                                        </TooltipContent>
                                      </Tooltip>
                                    )}
                                  </div>
                                </TableCell>

                                <TableCell className="align-middle whitespace-nowrap">
                                  {user.farmerProfile?.farmerName || (
                                    <EmptyValue />
                                  )}
                                </TableCell>

                                <TableCell className="align-middle whitespace-nowrap text-xs text-muted-foreground">
                                  {user.email || <EmptyValue />}
                                </TableCell>

                                <TableCell className="align-middle whitespace-nowrap">
                                  <RoleBadge role={user.userRole} />
                                </TableCell>

                                <TableCell className="align-middle">
                                  <button
                                    onClick={() => {
                                      setSelectedUser(user);
                                      setQuestionModalOpen(true);
                                    }}
                                    disabled={user.totalQuestions === 0}
                                    title="View queries"
                                    className={`inline-flex items-center justify-center min-w-[36px] h-6 px-2.5 rounded-full text-xs font-semibold transition-all ${
                                      user.totalQuestions > 0
                                        ? "bg-primary/10 text-primary hover:bg-primary/20 hover:scale-105 cursor-pointer"
                                        : "bg-muted text-muted-foreground cursor-default"
                                    }`}
                                  >
                                    {user.totalQuestions.toLocaleString()}
                                  </button>
                                </TableCell>

                                <TableCell className="align-middle">
                                  <div className="flex items-center justify-center gap-3">
                                    {isAdmin && (
                                      <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                                        {!isUserVerified ? (
                                          <Button
                                            // disabled={isVerifyingThisUser}
                                            className="h-8 px-3 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
                                            onClick={() =>
                                              requestVerificationChange(
                                                user,
                                                true,
                                              )
                                            }
                                          >
                                            {isVerifyingThisUser ? (
                                              <>
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                Verifying...
                                              </>
                                            ) : (
                                              <>
                                                <UserCheck2 className="h-4 w-4" />
                                                Verify
                                              </>
                                            )}
                                          </Button>
                                        ) : (
                                          <>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
                                              onClick={() =>
                                                handleEditUser(user)
                                              }
                                              title="Edit farmer"
                                            >
                                              <Pencil className="h-4 w-4" />
                                            </Button>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                              onClick={() =>
                                                handleDeleteUser(user)
                                              }
                                              title="Delete farmer"
                                            >
                                              <Trash2 className="h-4 w-4" />
                                            </Button>
                                          </>
                                        )}
                                      </div>
                                    )}
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setUserToView(user)}
                                      className="h-8 gap-1.5"
                                    >
                                      <Eye className="h-3.5 w-3.5" />
                                      View More
                                    </Button>
                                  </div>
                                </TableCell>
                              </motion.tr>
                            </ContextMenuTrigger>

                            {isAdmin && (
                              <ContextMenuContent className="w-40">
                                <ContextMenuItem
                                  className="cursor-pointer gap-2"
                                  onSelect={() => setUserToEdit(user)}
                                >
                                  <Pencil className="h-4 w-4" />
                                  Edit
                                </ContextMenuItem>
                                <ContextMenuItem
                                  className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer gap-2"
                                  onSelect={() => {
                                    setConfirmEmail("");
                                    setUserToDelete({
                                      userId: user.userId,
                                      source,
                                      email: user.email,
                                    });
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
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

                {/* Pagination */}
                {totalPages > 0 && (
                  <div className="px-4 py-3 border-t border-border/60 bg-muted/20">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">
                        Showing{" "}
                        <span className="font-medium text-foreground">
                          {users.length > 0
                            ? (currentPage - 1) * pageSize + 1
                            : 0}
                          –{(currentPage - 1) * pageSize + users.length}
                        </span>{" "}
                        of{" "}
                        <span className="font-medium text-foreground">
                          {totalUsers}
                        </span>{" "}
                        users
                      </span>
                      <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        onPageChange={setCurrentPage}
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
            <FarmerDetailsModal
              open={!!userToView}
              onOpenChange={(open) => !open && setUserToView(null)}
              user={userToView}
              isAdmin={isAdmin}
              onEdit={handleEditUser}
              onDelete={handleDeleteUser}
              isChangingPassword={changeUserPasswordMutation.isPending}
              onChangePassword={handleChangeViewedUserPassword}
              isUpdatingVerification={!!verifyingUserId}
              onVerificationChange={(nextStatus) => {
                if (userToView) {
                  setPendingVerification({
                    user: userToView,
                    nextStatus,
                  });

                  // Close FarmerDetailsModal first
                  setUserToView(null);
                }
              }}
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
        onOpenChange={(open) => !open && setUserToEdit(null)}
        user={userToEdit}
        isSaving={updateUserMutation.isPending}
        onSave={handleSaveEditedUser}
      />

      {/* Delete confirmation */}
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
            <div className="mx-auto mb-2 p-3 rounded-full bg-destructive/10 w-fit">
              <AlertCircle className="h-5 w-5 text-destructive" />
            </div>
            <AlertDialogTitle className="text-center">
              Delete this farmer?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center">
              This action cannot be undone. To confirm, type{" "}
              <strong className="text-foreground">{userToDelete?.email}</strong>{" "}
              below.
            </AlertDialogDescription>
            <Input
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              placeholder="Enter email to confirm"
              className="mt-3"
            />
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              disabled={confirmEmail !== userToDelete?.email}
              onClick={() => {
                if (userToDelete) {
                  deleteUserMutation.mutate(userToDelete);
                  setUserToDelete(null);
                  setConfirmEmail("");
                }
              }}
            >
              Delete Farmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {verificationToConfirm && (
  <div className="fixed inset-0 z-[9999] flex items-center justify-center">
    {/* Backdrop */}
    <div
      className="absolute inset-0 bg-black/50"
      onClick={() => {
        if (!verifyingUserId) {
          setVerificationToConfirm(null);
        }
      }}
    />

    {/* Confirmation */}
    <div className="relative z-10 w-[90vw] max-w-md rounded-lg border bg-background p-6 shadow-xl">
      <div className="flex flex-col items-center text-center">
        <div className="mb-3 rounded-full bg-primary/10 p-3">
          {verificationToConfirm.isVerified ? (
            <UserCheck2 className="h-5 w-5 text-primary" />
          ) : (
            <ShieldX className="h-5 w-5 text-destructive" />
          )}
        </div>

        <h2 className="text-lg font-semibold">
          {verificationToConfirm.isVerified
            ? "Set user as verified?"
            : "Set user as unverified?"}
        </h2>

        <p className="mt-2 text-sm text-muted-foreground">
          This will update verification status for{" "}
          <strong className="text-foreground">
            {verificationToConfirm.name}
          </strong>
          {verificationToConfirm.email ? (
            <> ({verificationToConfirm.email})</>
          ) : null}
          .
        </p>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button
          variant="outline"
          disabled={!!verifyingUserId}
          onClick={() => setVerificationToConfirm(null)}
        >
          Cancel
        </Button>

        <Button
          disabled={!!verifyingUserId}
          onClick={() => {
            void handleConfirmVerificationChange();
          }}
        >
          {verifyingUserId ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Updating...
            </>
          ) : verificationToConfirm.isVerified ? (
            "Set Verified"
          ) : (
            "Set Unverified"
          )}
        </Button>
      </div>
    </div>
  </div>
)}

    </div>
  );
}

function SortableHead({
  label,
  field,
  active,
  order,
  disabled = false,
  onSort,
}: {
  label: string;
  field: "totalQuestions" | "name" | "farmerName" | "email";
  active: boolean;
  order: "asc" | "desc";
  disabled?: boolean;
  onSort?: (f: "totalQuestions" | "name" | "farmerName" | "email") => void;
}) {
  const Icon = !active ? ArrowUpDown : order === "desc" ? ArrowDown : ArrowUp;
  return (
    <TableHead
      onClick={() => !disabled && onSort?.(field)}
      className={`text-center text-xs font-medium uppercase tracking-wide transition-colors ${
        disabled
          ? "cursor-not-allowed opacity-50 text-muted-foreground"
          : "cursor-pointer hover:bg-muted/60 text-muted-foreground hover:text-foreground"
      }`}
    >
      <div className="inline-flex items-center justify-center gap-1.5">
        {label}
        <Icon
          className={`h-3 w-3 ${active ? "text-primary" : "text-muted-foreground/60"}`}
        />
      </div>
    </TableHead>
  );
}

// Role Badge component with pill-shaped badges and icons for user roles
function RoleBadge({ role }: { role?: string }) {
  if (!role) return <EmptyValue />;

  const roleConfig: Record<
    string,
    { icon: React.ReactNode; className: string }
  > = {
    farmer: {
      icon: <User className="h-3 w-3" />,
      className:
        "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 border border-green-200 dark:border-green-800",
    },
    district_coordinator: {
      icon: <UsersRound className="h-3 w-3" />,
      className:
        "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800",
    },
    block_coordinator: {
      icon: <UsersRound className="h-3 w-3" />,
      className:
        "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800",
    },
    village_volunteer: {
      icon: <UsersRound className="h-3 w-3" />,
      className:
        "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800",
    },
    internal: {
      icon: <Briefcase className="h-3 w-3" />,
      className:
        "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800",
    },
  };

  const normalizedRole = role.toLowerCase();
  const config = roleConfig[normalizedRole] || {
    icon: <User className="h-3 w-3" />,
    className:
      "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border border-gray-200 dark:border-gray-700",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${config.className}`}
    >
      {config.icon}
      {role}
    </span>
  );
}
