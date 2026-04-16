import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/atoms/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/card";
import { Spinner } from "@/components/atoms/spinner";
import { useUserDetails } from "./hooks/useUserDetails";
import { BarGraph } from "./components/shared/BarGrapgh";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { Pagination } from "@/components/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/atoms/table";

const PAGE_SIZE = 10;

interface UserDetailsViewProps {
  source?: 'vicharanashala' | 'annam';
}

export function UserDetailsView({ source = 'vicharanashala' }: UserDetailsViewProps) {
  const [startTime, setStartTime] = useState<Date | undefined>(undefined);
  const [endTime, setEndTime] = useState<Date | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // Debounce the search input so we don't fire a request on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1); // reset to page 1 on new search
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data, isLoading, error } = useUserDetails(
    startTime,
    endTime,
    currentPage,
    PAGE_SIZE,
    debouncedSearch,
    source,
  );

  const { users, totalUsers, totalPages, activeUsers, totalQuestions } = data;

  const handleDateChange = (key: string, value: any) => {
    if (key === "startTime") { setStartTime(value); setCurrentPage(1); }
    if (key === "endTime") { setEndTime(value); setCurrentPage(1); }
  };

  const dateLabel = startTime && endTime
    ? `${startTime.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} – ${endTime.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`
    : "All time";

  return (
    <div className="flex-1 overflow-y-auto px-5 pb-5 min-w-0">
      {/* Header */}
      <div className="mb-5">
        <h2 className="text-base font-semibold text-(--foreground) m-0">
          User Details
        </h2>
        <p className="text-xs text-(--muted-foreground) mt-1">
          {dateLabel} · {totalUsers} users
        </p>
      </div>

      {/* Summary cards + graphs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        {/* Total Users — col 1 row 1 */}
        <Card className="dark:bg-[#1a1a1a] dark:border-[#2a2a2a] relative overflow-hidden self-start">
          <div className="absolute inset-x-0 top-0 h-1 bg-[#3AAA5A]" />
          <CardContent className="p-4 flex flex-col gap-0.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Total Users
            </span>
            <span className="text-2xl font-semibold dark:text-slate-100">
              {isLoading ? "—" : totalUsers.toLocaleString()}
            </span>
          </CardContent>
        </Card>

        {/* Active Users — col 2 row 1 */}
        <Card className="dark:bg-[#1a1a1a] dark:border-[#2a2a2a] relative overflow-hidden self-start">
          <div className="absolute inset-x-0 top-0 h-1 bg-[#3B82F6]" />
          <CardContent className="p-4 flex flex-col gap-0.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Active Users
            </span>
            <span className="text-2xl font-semibold dark:text-slate-100">
              {isLoading ? "—" : activeUsers.toLocaleString()}
            </span>
          </CardContent>
        </Card>

        {/* Total Questions — col 3 row 1 */}
        <Card className="dark:bg-[#1a1a1a] dark:border-[#2a2a2a] relative overflow-hidden self-start">
          <div className="absolute inset-x-0 top-0 h-1 bg-[#EF9F27]" />
          <CardContent className="p-4 flex flex-col gap-0.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Total Questions
            </span>
            <span className="text-2xl font-semibold dark:text-slate-100">
              {isLoading ? "—" : totalQuestions.toLocaleString()}
            </span>
          </CardContent>
        </Card>

        {/* Bar graph — col 1 row 2 on sm+, after all 3 cards on mobile */}
        {!isLoading && !error && users.length > 0 && (
          <Card className="dark:bg-[#1a1a1a] dark:border-[#2a2a2a] sm:col-start-1 sm:row-start-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Questions per User</CardTitle>
            </CardHeader>
            <CardContent>
              <BarGraph
                data={users.map(u => ({ label: u.name, value: u.totalQuestions }))}
                height={120}
              />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Users table */}
      <Card className="dark:bg-[#1a1a1a] dark:border-[#2a2a2a]">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 min-w-0 w-full">
            <CardTitle className="text-sm font-medium">All Farmers</CardTitle>
            <div className="flex flex-col sm:flex-row flex-wrap lg:flex-nowrap items-stretch gap-2 w-full min-w-0">
              <div className="relative w-full sm:flex-1 min-w-0">
                <svg
                  width={14}
                  height={14}
                  viewBox="0 0 16 16"
                  fill="none"
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-(--muted-foreground)"
                >
                  <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-9 pl-9 pr-3 text-sm border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-[#222] text-(--foreground) placeholder:text-(--muted-foreground) outline-none focus:border-[#3AAA5A] transition-colors"
                />
              </div>
              <div className="w-full sm:w-auto lg:flex-none min-w-0 relative [&_label]:hidden [&_#date-toggle]:!w-full [&_#date-toggle]:!h-9 [&_#date-toggle]:!overflow-hidden [&_.absolute]:!left-0 [&_.absolute]:!right-0 [&_.absolute]:!w-full [&_.absolute]:sm:!w-[320px] [&_.absolute]:sm:!left-auto [&_.absolute]:sm:!right-0">
                <DateRangeFilter
                  customName=""
                  advanceFilter={{ startTime, endTime }}
                  handleDialogChange={handleDateChange}
                  className={
                    startTime
                      ? "!h-9 !text-sm !w-full !border-green-500 dark:!border-green-500 !bg-green-50 dark:!bg-[#1a1a1a] !text-green-700 dark:!text-green-400 !font-medium hover:!bg-green-100 dark:hover:!bg-[#2a2a2a]"
                      : "!h-9 !text-sm !w-full !border-gray-200 dark:!border-gray-700 !bg-white dark:!bg-[#1a1a1a] !text-gray-700 dark:!text-gray-200 !font-normal hover:!bg-gray-50 dark:hover:!bg-[#2a2a2a]"
                  }
                />
              </div>
              {(searchQuery || startTime || endTime) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 w-full sm:w-auto"
                  onClick={() => {
                    setSearchQuery("");
                    setStartTime(undefined);
                    setEndTime(undefined);
                    setCurrentPage(1);
                  }}
                >
                  <X />
                  Reset
                </Button>
              )}
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
              <Table className="min-w-[600px]">
                <TableHeader className="bg-card sticky top-0 z-10">
                  <TableRow>
                    <TableHead className="text-center w-12">S.No</TableHead>
                    <TableHead className="text-center">Name</TableHead>
                    <TableHead className="text-center">Email</TableHead>
                    <TableHead className="text-center">Questions Asked</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-10 text-muted-foreground">
                        {debouncedSearch ? "No users match your search." : "No users found."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    users.map((user, idx) => (
                      <TableRow key={user.userId} className="text-center">
                        <TableCell className="align-middle">
                          {(currentPage - 1) * PAGE_SIZE + idx + 1}
                        </TableCell>
                        <TableCell className="align-middle font-medium whitespace-nowrap">
                          {user.name}
                        </TableCell>
                        <TableCell className="align-middle whitespace-nowrap">
                          {user.email}
                        </TableCell>
                        <TableCell className="align-middle">
                          <span
                            className={`inline-flex items-center justify-center min-w-[32px] px-2 py-0.5 rounded-full text-xs font-semibold ${
                              user.totalQuestions > 0
                                ? "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300"
                                : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                            }`}
                          >
                            {user.totalQuestions.toLocaleString()}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              {/* Pagination footer */}
              {totalPages > 0 && (
                <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
                    <span className="text-xs text-(--muted-foreground)">
                      Showing {users.length > 0 ? (currentPage - 1) * PAGE_SIZE + 1 : 0}–{(currentPage - 1) * PAGE_SIZE + users.length} of {totalUsers} users
                    </span>
                    <Pagination
                      currentPage={currentPage}
                      totalPages={totalPages}
                      onPageChange={(page) => setCurrentPage(page)}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
