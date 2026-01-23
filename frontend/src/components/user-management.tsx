import { useEffect, useState } from "react";
import type { IUser } from "@/types";
import { STATES } from "./advanced-question-filter";
import { useDebounce } from "@/hooks/ui/useDebounce";
import {
  Award,
  CalendarClock,
  Filter,
  Gavel,
  Loader2,
  MapPin,
  MessageSquare,
  Search,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { Input } from "./atoms/input";
import { UsersTable } from "./user-table";
import {
  useGetAllExperts,
  useGetAllUsers,
} from "@/hooks/api/user/useGetAllUsers";
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
  const [page, setPage] = useState(1);
  const LIMIT = 12;
  const states = STATES;
  const isAdmin = currentUser?.role === "admin";
  const isModerator = currentUser?.role === "moderator";

  const { data: adminUsers, isLoading: adminLoading } = useGetAllUsers(
    page,
    LIMIT,
    search,
    sort,
    filter,
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
    LIMIT,
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

  const onReset = () => {};

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
        />
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4 w-full bg-card py-4 px-2 rounded">
            {/* LEFT — Search */}
            <div className="flex-1 min-w-[250px] max-w-[400px] order-1">
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
            </div>

            {/* RIGHT — Sort + Filter Group */}
            <div className="flex items-center gap-4 order-2">
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
            </div>
          </div>

          <UsersTable
            items={tableItems} // either adminUsers.users or expertDetails.experts
            onViewMore={handleViewMore}
            currentPage={page}
            setCurrentPage={setPage}
            userRole={currentUser?.role!}
            limit={LIMIT}
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
          />
        </>
      )}
    </main>
  );
};
