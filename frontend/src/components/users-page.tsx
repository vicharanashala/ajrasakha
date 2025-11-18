
import { useEffect,useState } from "react";
import type { IUser } from "@/types";
import {
} from "./advanced-question-filter";
import { useDebounce } from "@/hooks/ui/useDebounce";
import { Loader2, Search, X } from "lucide-react";
import { Input } from "./atoms/input";
import { UsersTable } from "./user-table";
import { useGetAllExperts } from "@/hooks/api/user/useGetAllUsers";

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
  const debouncedSearch = useDebounce(search);
  const [page,setPage] = useState(1)
  const LIMIT = 10;

  const {data:expertDetails,isLoading} = useGetAllExperts(page,LIMIT,search)
  useEffect(() => {
    if (selectedQuestionId && !autoOpenQuestionId) {
      setSelectedQuestionId("");
    }
  }, [debouncedSearch]);

  useEffect(() => {
    if (debouncedSearch === "") return;
    if (currentUser?.role !== "expert") onReset();
  }, [debouncedSearch]);

  const onReset = () => {
  };

  const handleViewMore = (questoinId: string) => {
    setSelectedQuestionId(questoinId);
  };

  return (
    <main className="mx-auto w-full p-4 md:p-6 space-y-6 ">
      {isLoading ? (
          <Loader2 className="animate-spin w-6 h-6 mx-auto text-primary" />
      ) : (
        <>
          <div className="flex-1 min-w-[200px] max-w-[400px]">
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
