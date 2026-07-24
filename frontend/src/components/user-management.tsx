import { useEffect, useState } from "react";
import type { IUser } from "@/types";
import { useDebounce } from "@/hooks/ui/useDebounce";
import { canManageUsers } from "@/lib/roles";
import {
  Filter,
  MapPin,
  Search,
  X,
  Eye,
  EyeOff,
} from "lucide-react";
import { Input } from "./atoms/input";
import { Badge } from "./atoms/badge";
import { UsersTable } from "./user-table";
import {
  useGetAllExperts,
} from "@/hooks/api/user/useGetAllUsers";
import { useAdminGetAllUsers } from "@/hooks/api/Admin/useAdminGetAllUsers";
import { Label } from "./atoms/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./atoms/select";
import { ExpertDashboard } from "./ExpertDashboard";
import { GateKeeperAuditorDashboard } from "./GateKeeperAuditorDashboard";
import { Dashboard } from "./dashboard";
import { Button } from "./atoms/button";
import { UserFiltersDialog } from "./UserFiltersDialog";

export const UserManagement = ({ currentUser }: { currentUser?: IUser }) => {
  const [selectExpertId, setSelectExpertId] = useState<string>("");
  const [rankPostion, setRankPosition] = useState<number>(0);
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [filter, setFilter] = useState("");
  const debouncedSearch = useDebounce(search);
  const [sort, setSort] = useState<string>("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [verifiedFilter, setVerifiedFilter] = useState<string>("ALL");
  const [stfFilter, setStfFilter] = useState<string>("ALL");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(12);
  const [showSensitive, setShowSensitive] = useState(false);
  const isAdmin = currentUser?.role === "admin";
  // Every non-admin role with management access (moderator, tester, gate keeper, auditor)
  // gets the same Expert Management view, so this can't drift from the tab's allowlist.
  const isModerator = !isAdmin && canManageUsers(currentUser?.role);

  const { data: adminUsers, isLoading: adminLoading } = useAdminGetAllUsers(
  page,
  limit,
  search,
  sort,
  filter,
  roleFilter,
  statusFilter,
  verifiedFilter,
  stfFilter,
  { enabled: isAdmin }
);
  const toggleSort = (key: string) => {
    if (key === "rank") {
      setSort("");
      return;
    }
    setSort((prev) => {
      if (prev === `${key}_asc`) return `${key}_desc`;
      return `${key}_asc`;
    });
  };

  const { data: expertDetails, isLoading: expertLoading } = useGetAllExperts(
    page,
    limit,
    search,
    sort,
    filter,
    { enabled: isModerator }
  );

  useEffect(() => {
    if (selectedUserId) {
      setSelectedUserId("");
    }
  }, [debouncedSearch]);

  useEffect(() => {
    if (debouncedSearch === "") return;
    if (currentUser?.role !== "expert") onReset();
  }, [debouncedSearch]);

  const onReset = () => { };

  const handleViewMore = (userId: string) => {
    setSelectedUserId(userId);
  };
  const goBack = () => {
    const url = new URL(window.location.href);

    if (url.searchParams.has("comment")) {
      url.searchParams.delete("comment");
      window.history.replaceState({}, "", url.toString());
      setSelectExpertId("");
      return;
    }
    setSelectExpertId("");
  };

  const tableItems = isAdmin
    ? adminUsers?.users ?? []
    : expertDetails?.experts ?? [];

  let activeFiltersCount = 0;
  if (filter !== "ALL" && filter !== "") activeFiltersCount++;
  if (roleFilter !== "ALL") activeFiltersCount++;
  if (statusFilter !== "ALL") activeFiltersCount++;
  if (verifiedFilter !== "ALL") activeFiltersCount++;
  if (stfFilter !== "ALL") activeFiltersCount++;


  console.log("Admin users ->", adminUsers?.users);
  console.log("Expert details ->", expertDetails?.experts);
  console.log("Table items ->", tableItems);

  const isLoading = isAdmin ? adminLoading : expertLoading;

  const totalPages = isAdmin ? 1 : expertDetails?.totalPages || 0;



  return (
    <main className="mx-auto w-full p-4 md:p-6 space-y-6 ">
      {selectExpertId ? (
        (() => {
          const selectedUser = (tableItems as any[]).find(
            (u) => u._id === selectExpertId,
          );
          const selectedRole = selectedUser?.role;
          // Admin / moderator → the admin/moderator overview dashboard.
          if (selectedRole === "admin" || selectedRole === "moderator") {
            return (
              <div className="space-y-2">
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    className="inline-flex items-center justify-center gap-1 whitespace-nowrap p-2"
                    onClick={goBack}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                      className="w-4 h-4"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M17 8l4 4m0 0l-4 4m4-4H3"
                      />
                    </svg>
                    <span className="leading-none">Exit</span>
                  </Button>
                </div>
                <Dashboard />
              </div>
            );
          }
          // Gate keeper / auditor get their own dashboard; everyone else keeps the
          // expert performance view.
          if (selectedRole === "gate_keeper" || selectedRole === "auditor") {
            return (
              <GateKeeperAuditorDashboard
                userId={selectExpertId}
                role={selectedRole}
                userName={
                  `${selectedUser?.firstName ?? selectedUser?.userName ?? ""} ${selectedUser?.lastName ?? ""}`.trim()
                }
                goBack={goBack}
              />
            );
          }
          return (
            <ExpertDashboard
              expertId={selectExpertId}
              goBack={goBack}
              rankPosition={rankPostion}
              expertDetailsList={expertDetails}
              currentUserRole={currentUser?.role}
              selectedUserRole={selectedRole}
            />
          );
        })()
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4 w-full bg-card py-4 px-2 rounded">
            {/* LEFT — Search */}
            <div className="flex items-center gap-3 flex-1 min-w-[250px] max-w-[500px] order-1">
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />

                <Input
                  placeholder="Search users..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="pl-9 pr-9 bg-background"
                />

                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Toggle Phone & University columns — admin only */}
              {isAdmin && (
                <button
                  onClick={() => setShowSensitive((v) => !v)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-md border text-sm font-medium whitespace-nowrap transition-colors ${
                    showSensitive
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-input hover:text-foreground"
                  }`}
                >
                  {showSensitive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  {showSensitive ? "Hide Info" : "Show Info"}
                </button>
              )}
            </div>

            {/* RIGHT — Sort + Filter Group */}
            <div className="flex items-center gap-4 order-2">
              {/* Toggle Phone & University columns — moderator only (admin gets it next to search) */}
              {!isAdmin && (
                <button
                  onClick={() => setShowSensitive((v) => !v)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-md border text-sm font-medium whitespace-nowrap transition-colors ${
                    showSensitive
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-input hover:text-foreground"
                  }`}
                >
                  {showSensitive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  {showSensitive ? "Hide Info" : "Show Info"}
                </button>
              )}

              {/* Filter */}
              <UserFiltersDialog
                isAdmin={isAdmin}
                filter={filter}
                setFilter={setFilter}
                roleFilter={roleFilter}
                setRoleFilter={setRoleFilter}
                statusFilter={statusFilter}
                setStatusFilter={setStatusFilter}
                verifiedFilter={verifiedFilter}
                setVerifiedFilter={setVerifiedFilter}
                stfFilter={stfFilter}
                setStfFilter={setStfFilter}
                setPage={setPage}
                activeFiltersCount={activeFiltersCount}
              />
            </div>
          </div>

          <UsersTable
            items={tableItems} // either adminUsers.users or expertDetails.experts
            onViewMore={handleViewMore}
            currentPage={page}
            setCurrentPage={setPage}
            userRole={currentUser?.role!}
            limit={limit}
            setLimit={setLimit}
            totalPages={
              isAdmin
                ? adminUsers?.totalPages || 1
                : expertDetails?.totalPages || 0
            }
            isLoading={isLoading}
            setSelectExpertId={setSelectExpertId}
            setRankPosition={setRankPosition}
            onSort={toggleSort}
            sort={sort}
            showSensitive={showSensitive}
          />
        </>
      )}
    </main>
  );
};
