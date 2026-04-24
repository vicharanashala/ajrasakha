import { useCallback, useEffect, useMemo, useState } from "react";
import type { IUser } from "@/types";
import { STATES } from "./advanced-question-filter";
import { useDebounce } from "@/hooks/ui/useDebounce";
import {
  Filter,
  MapPin,
} from "lucide-react";
import { UsersTable } from "./user-table";
import { Autocomplete, highlightMatch } from "./autocomplete";
import {
  useGetAllExperts,
  useUserAutocomplete,
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
  const [inputValue, setInputValue] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [filter, setFilter] = useState("");
  const debouncedSearch = useDebounce(inputValue.trim(), 120);
  const { data: autocompleteOptions, isLoading: isAutocompleteLoading, isFetching: isAutocompleteFetching } = useUserAutocomplete(debouncedSearch);
  const [sort, setSort] = useState<string>("");
  const [page, setPage] = useState(1);
  const LIMIT = 12;
  const states = STATES;
  const isAdmin = currentUser?.role === "admin";
  const isModerator = currentUser?.role === "moderator";

  const { data: adminUsers, isLoading: adminLoading } = useAdminGetAllUsers(
    page,
    LIMIT,
    appliedSearch,
    sort,
    filter,
    { enabled: isAdmin }
  );
 const toggleSort = useCallback((key: string) => {
   if (key === "rank") {
     setSort("");
     return;
   }
   setSort((prev) => {
     if (prev === `${key}_asc`) return `${key}_desc`;
     return `${key}_asc`;
   });
 }, []);

  const { data: expertDetails, isLoading: expertLoading } = useGetAllExperts(
    page,
    LIMIT,
    appliedSearch,
    sort,
    filter,
    { enabled: isModerator }
  );

  useEffect(() => {
    if (selectedUserId) {
      setSelectedUserId("");
    }
  }, [debouncedSearch]);

  const handleViewMore = useCallback((userId: string) => {
    setSelectedUserId(userId);
  }, []);

  const goBack = useCallback(() => {
    const url = new URL(window.location.href);

    if (url.searchParams.has("comment")) {
      url.searchParams.delete("comment");
      window.history.replaceState({}, "", url.toString());
      setSelectExpertId("");
      return;
    }
    setSelectExpertId("");
  }, []);

  const tableItems = useMemo(
    () => (isAdmin ? adminUsers?.users : expertDetails?.experts) ?? [],
    [isAdmin, adminUsers?.users, expertDetails?.experts]
  );

  const isLoading = isAdmin ? adminLoading : expertLoading;

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
              <div className="w-full">
                <Autocomplete
                  placeholder="Search users..."
                  value={inputValue}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    setInputValue(nextValue);
                    if (nextValue.trim() === "") {
                      setAppliedSearch("");
                      setPage(1);
                    }
                  }}
                  onClear={() => {
                    setInputValue("");
                    setAppliedSearch("");
                    setPage(1);
                  }}
                  data={autocompleteOptions || []}
                  isLoading={isAutocompleteLoading || isAutocompleteFetching}
                  isTyping={inputValue !== debouncedSearch}
                  getDisplayValue={(user: any) => user.email ? `${user.userName} ${user.email}` : user.userName || user}
                  renderItem={(user: any, query: string) => {
                    if (typeof user === 'string') return highlightMatch(user, query);
                    return (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium leading-none">
                          {highlightMatch(user.userName || '', query)}
                        </span>
                        {user.email && (
                          <span className="text-xs text-muted-foreground mt-1">
                            {highlightMatch(user.email, query)}
                          </span>
                        )}
                      </div>
                    );
                  }}
                  onSelect={(user: any) => {
                    const displayValue =
                      typeof user === "string"
                        ? user
                        : (user.userName || "").trim();
                    const searchValue =
                      typeof user === "string"
                        ? user.trim()
                        : (user.email || displayValue).trim();
                    setInputValue(displayValue);
                    setAppliedSearch(searchValue);
                    setPage(1);
                  }}
                />
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
