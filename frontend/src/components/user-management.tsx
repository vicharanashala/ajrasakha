import { useEffect, useState } from "react";
import type { IUser } from "@/types";
import { STATES } from "./advanced-question-filter";
import { useDebounce } from "@/hooks/ui/useDebounce";
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
  const states = STATES;
  const isAdmin = currentUser?.role === "admin";
  const isModerator = currentUser?.role === "moderator" || currentUser?.role === "tester";

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


  console.log("Admin users ->", adminUsers?.users);
  console.log("Expert details ->", expertDetails?.experts);
  console.log("Table items ->", tableItems);

  const isLoading = isAdmin ? adminLoading : expertLoading;

  const totalPages = isAdmin ? 1 : expertDetails?.totalPages || 0;



  return (
    <main className="mx-auto w-full p-4 md:p-6 space-y-6 ">
      {selectExpertId ? (
        <ExpertDashboard
          expertId={selectExpertId}
          goBack={goBack}
          rankPosition={rankPostion}
          expertDetailsList={expertDetails}
          currentUserRole={currentUser?.role}
          selectedUserRole={
            (tableItems as any[]).find((u) => u._id === selectExpertId)?.role
          }
        />
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
              <div className="flex items-center gap-3 w-[240px]">
                <Label className="flex items-center gap-2 text-sm font-semibold whitespace-nowrap">
                  <Filter className="h-4 w-4 text-primary" />
                  Filter
                </Label>

                <Select value={filter} onValueChange={setFilter}>
                  <SelectTrigger className="bg-background px-3 py-2 w-full">
                    <SelectValue placeholder="Select State" />
                  </SelectTrigger>

                  <SelectContent>
                    <SelectItem value="ALL">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-primary" />
                        <span>All</span>
                      </div>
                    </SelectItem>

                    {states.map((st) => (
                      <SelectItem key={st} value={st}>
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-primary" />
                          <span>{st}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Role Filter */}
              {isAdmin && (
                <div className="flex items-center gap-3 w-[180px]">
                  <Select value={roleFilter} onValueChange={(val) => { setRoleFilter(val); setPage(1); }}>
                    <SelectTrigger className="bg-background px-3 py-2 w-full">
                      <SelectValue placeholder="Role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Roles</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="moderator">Moderator</SelectItem>
                      <SelectItem value="expert">Expert</SelectItem>
                      <SelectItem value="pae_expert">PAE Expert</SelectItem>
                      <SelectItem value="tester">Tester</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Status Filter */}
              {isAdmin && (
                <div className="flex items-center gap-3 w-[180px]">
                  <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val); setPage(1); }}>
                    <SelectTrigger className="bg-background px-3 py-2 w-full">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Status</SelectItem>
                      <SelectItem value="false">Unblocked</SelectItem>
                      <SelectItem value="true">Blocked</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Verification Filter */}
              {isAdmin && (
                <div className="flex items-center gap-3 w-[180px] relative">
                  <Badge className="absolute -top-2 -right-1 h-4 text-[9px] px-1.5 py-0 bg-red-500 hover:bg-red-600 border-0 z-10 text-white">New</Badge>
                  <Select value={verifiedFilter} onValueChange={(val) => { setVerifiedFilter(val); setPage(1); }}>
                    <SelectTrigger className="bg-background px-3 py-2 w-full">
                      <SelectValue placeholder="Verification" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Users</SelectItem>
                      <SelectItem value="true">Verified</SelectItem>
                      <SelectItem value="false">Not Verified</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            {/* STF Filter */}
              {isAdmin && (
                <div className="flex items-center gap-3 w-[180px] relative">
                  <Badge className="absolute -top-2 -right-1 h-4 text-[9px] px-1.5 py-0 bg-red-500 hover:bg-red-600 border-0 z-10 text-white">New</Badge>
                  <Select value={stfFilter} onValueChange={(val) => { setStfFilter(val); setPage(1); }}>
                    <SelectTrigger className="bg-background px-3 py-2 w-full">
                      <SelectValue placeholder="STF Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Users</SelectItem>
                      <SelectItem value="true">STF Users</SelectItem>
                      <SelectItem value="false">Non-STF Users</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
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
