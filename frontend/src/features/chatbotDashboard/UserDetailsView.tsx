import { useState, useEffect, useRef } from "react";
import { Eye, X, Trash2, Pencil, Users, InfoIcon } from "lucide-react";
import { Button } from "@/components/atoms/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/atoms/tooltip";
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
import { useAddUser } from "./hooks/useAddUser";

const EMPTY_VALUE = "Not provided";

function EmptyValue() {
  return <span className="text-muted-foreground">{EMPTY_VALUE}</span>;
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
  // const [isBarGraphMaximized, setIsBarGraphMaximized] = useState(false);
  // const [isKnowledgeMaximized, setIsKnowledgeMaximized] = useState(false);
  // const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<{
    userId: string;
    source: string;
    email: string;
  } | null>(null);
  const [userToEdit, setUserToEdit] = useState<UserDetail | null>(null);
  const [userToView, setUserToView] = useState<UserDetail | null>(null);
  const [confirmEmail, setConfirmEmail] = useState("");
  // const [hovered, setHovered] = useState<string | null>(null);
  // const [agriHovered, setAgriHovered] = useState<string | null>(null);
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
  // } = useDailyUserTrend(
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

  // const dateLabel =
  //   filters.startTime && filters.endTime
  //     ? `${filters.startTime.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} – ${filters.endTime.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`
  //     : "All time";

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
    role?: string;
  }) => {
    await addUserMutation.mutateAsync({
      source,
      data: payload,
    });
    setIsAddModalOpen(false);
  };

  const handleEditUser = (user: UserDetail) => {
    setUserToView(null);
    setUserToEdit(user);
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
              <div className="space-y-3 p-4">
                <Skeleton className="h-10 w-full rounded-md" />
                <Skeleton className="h-10 w-full rounded-md" />
                <Skeleton className="h-10 w-full rounded-md" />
                <Skeleton className="h-10 w-full rounded-md" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
            )}

            {error && (
              <div className="px-4 py-8 text-center text-red-500 text-sm">
                Failed to load user details. Please try again.
              </div>
            )}

            {!isLoading && !error && (
              <div className="rounded-lg border bg-card overflow-x-auto">
                <Table className="min-w-[980px]">
                  <TableHeader className="bg-card sticky top-0 z-10">
                    <TableRow>
                      <TableHead className="text-center w-12">S.No</TableHead>
                      <TableHead
                        className={`text-center ${userType === "external" ? "cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800" : "cursor-not-allowed opacity-50"} transition-colors`}
                        onClick={() =>
                          userType === "external" && handleSort("name")
                        }
                      >
                        Name
                      </TableHead>
                      <TableHead className="text-center">Farmer Name</TableHead>
                      <TableHead className="text-center">Email</TableHead>
                      <TableHead className="text-center">Role</TableHead>
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
                      <TableHead className="text-center">View More</TableHead>
                      {isAdmin && (
                        <TableHead className="text-center">Actions</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={isAdmin ? 8 : 7}
                          className="text-center py-10 text-muted-foreground"
                        >
                          {isFiltered
                            ? "No users match your filters."
                            : "No users found."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      users.map((user, idx) => {
                        return (
                          <ContextMenu key={user.userId} modal={false}>
                            <ContextMenuTrigger asChild>
                              <TableRow className="group text-center hover:bg-muted/40 transition-colors duration-100">
                                {/* S.No */}
                                <TableCell className="align-middle text-xs text-muted-foreground tabular-nums">
                                  {(currentPage - 1) * pageSize + idx + 1}
                                </TableCell>

                                {/* Name */}
                                <TableCell className="align-middle font-medium whitespace-nowrap">
                                  {user.name || <EmptyValue />}
                                </TableCell>

                                {/* Farmer Name */}
                                <TableCell className="align-middle whitespace-nowrap">
                                  {user.farmerProfile?.farmerName || (
                                    <EmptyValue />
                                  )}
                                </TableCell>

                                {/* Email */}
                                <TableCell className="align-middle whitespace-nowrap text-xs text-muted-foreground">
                                  {user.email || <EmptyValue />}
                                </TableCell>

                                {/* Role */}
                                <TableCell className="align-middle whitespace-nowrap">
                                  {user.role || <EmptyValue />}
                                </TableCell>

                                {/* Queries asked */}
                                <TableCell className="align-middle">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setSelectedUser(user);
                                      setQuestionModalOpen(true);
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

                                {/* View more */}
                                <TableCell className="align-middle">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setUserToView(user)}
                                    className="h-8"
                                  >
                                    <Eye className="h-4 w-4" />
                                    View More
                                  </Button>
                                </TableCell>

                                {isAdmin && (
                                  <TableCell className="align-middle">
                                    <div className="flex items-center justify-center gap-2">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => handleEditUser(user)}
                                        title="Edit farmer"
                                      >
                                        <Pencil className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/50"
                                        onClick={() => handleDeleteUser(user)}
                                        title="Delete farmer"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                )}

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
            <FarmerDetailsModal
              open={!!userToView}
              onOpenChange={(open) => {
                if (!open) setUserToView(null);
              }}
              user={userToView}
              isAdmin={isAdmin}
              onEdit={handleEditUser}
              onDelete={handleDeleteUser}
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
