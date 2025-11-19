import { useEffect, useState } from "react";
import type { IUser } from "@/types";
import { STATES } from "./advanced-question-filter";
import { useDebounce } from "@/hooks/ui/useDebounce";
import {
  CalendarDays,
  Globe,
  Loader2,
  MessageSquare,
  Search,
  Star,
  TrendingDown,
  TrendingUp,
  UserRound,
  X,
} from "lucide-react";
import { Input } from "./atoms/input";
import { UsersTable } from "./user-table";
import { useGetAllExperts } from "@/hooks/api/user/useGetAllUsers";
import { Label } from "./atoms/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./atoms/select";

export const UsersPage = ({
  currentUser,
  autoOpenQuestionId,
}: {
  currentUser?: IUser;
  autoOpenQuestionId?: string | null;
}) => {
  const [search, setSearch] = useState("");
  const [selectedQuestionId, setSelectedQuestionId] = useState(
    autoOpenQuestionId || ""
  );
  const [filter, setFilter] = useState("");
  const debouncedSearch = useDebounce(search);
  const [selectedSort, setSelectedSort] = useState("");
  const [page, setPage] = useState(1);
  const LIMIT = 10;
  const states = STATES;
  const { data: expertDetails, isLoading } = useGetAllExperts(
    page,
    LIMIT,
    search,
    selectedSort,
    filter
  );
  useEffect(() => {
    if (selectedQuestionId && !autoOpenQuestionId) {
      setSelectedQuestionId("");
    }
  }, [debouncedSearch]);

  useEffect(() => {
    if (debouncedSearch === "") return;
    if (currentUser?.role !== "expert") onReset();
  }, [debouncedSearch]);

  const onReset = () => {};

  const handleViewMore = (questoinId: string) => {
    setSelectedQuestionId(questoinId);
  };

  return (
    <main className="mx-auto w-full p-4 md:p-6 space-y-6 ">
      {isLoading ? (
        <Loader2 className="animate-spin w-6 h-6 mx-auto text-primary" />
      ) : (
        <>
          <div className="flex justify-between items-start gap-4 w-full">
            {/* LEFT: Search Box */}
            <div className="flex-1 min-w-[250px] max-w-[400px]">
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />

                <Input
                  placeholder="Search users..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
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

            <div className="flex items-center gap-3 w-[260px]">
              <Label className="flex items-center gap-2 text-sm font-semibold whitespace-nowrap">
                <MessageSquare className="h-4 w-4 text-primary" />
                Sort
              </Label>

              {/* Select Box */}
              <Select
                value={selectedSort}
                onValueChange={(v) => setSelectedSort(v)}
              >
                <SelectTrigger className="bg-background px-3 py-2">
                  <SelectValue placeholder="Select Filter" />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="reputation_score">
                    <div className="flex items-center gap-2">
                      <Star className="w-4 h-4 text-primary" />
                      <span>Reputation Score</span>
                    </div>
                  </SelectItem>

                  <SelectItem value="incentive">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-green-500" />
                      <span>Incentive</span>
                    </div>
                  </SelectItem>

                  <SelectItem value="penalty">
                    <div className="flex items-center gap-2">
                      <TrendingDown className="w-4 h-4 text-red-500" />
                      <span>Penalty</span>
                    </div>
                  </SelectItem>

                  <SelectItem value="createdAt">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="w-4 h-4 text-primary" />
                      <span>Join Date</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-3 w-[260px]">
              <Label className="flex items-center gap-2 text-sm font-semibold whitespace-nowrap">
                <Globe className="h-4 w-4 text-primary" />
                Filter
              </Label>

              <Select value={filter} onValueChange={(v) => setFilter(v)}>
                <SelectTrigger className="bg-background px-3 py-2">
                  <SelectValue placeholder="Select State" />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="ALL">
                    <div className="flex items-center gap-2">
                      <UserRound className="w-4 h-4 text-primary" />
                      <span>All</span>
                    </div>
                  </SelectItem>
                  {states.map((st) => (
                    <SelectItem key={st} value={st}>
                      <div className="flex items-center gap-2">
                        <UserRound className="w-4 h-4 text-primary" />
                        <span>{st}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <UsersTable
            items={expertDetails?.experts}
            onViewMore={handleViewMore}
            currentPage={page}
            setCurrentPage={setPage}
            userRole={currentUser?.role!}
            limit={LIMIT}
            totalPages={expertDetails?.totalPages || 0}
            isLoading={isLoading}
          />
        </>
      )}
    </main>
  );
};
