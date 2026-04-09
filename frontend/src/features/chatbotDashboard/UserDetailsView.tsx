import { useState, useMemo, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/card";
import { Spinner } from "@/components/atoms/spinner";
import { useUserDetails } from "./hooks/useUserDetails";
import { DateRangeFilter } from "@/components/DateRangeFilter";

export function UserDetailsView() {
  const [startTime, setStartTime] = useState<Date | undefined>(undefined);
  const [endTime, setEndTime] = useState<Date | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");
  const PAGE_SIZE = 30;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLTableRowElement | null>(null);

  const { data: users, isLoading, error } = useUserDetails(startTime, endTime);

  const handleDateChange = (key: string, value: any) => {
    if (key === "startTime") setStartTime(value);
    if (key === "endTime") setEndTime(value);
  };

  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users;
    const q = searchQuery.toLowerCase();
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
    );
  }, [users, searchQuery]);

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [searchQuery, startTime, endTime]);

  const visibleUsers = useMemo(
    () => filteredUsers.slice(0, visibleCount),
    [filteredUsers, visibleCount]
  );

  const hasMore = visibleCount < filteredUsers.length;

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore) {
          setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, filteredUsers.length));
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, filteredUsers.length]);

  const totalQuestions = useMemo(
    () => filteredUsers.reduce((sum, u) => sum + u.totalQuestions, 0),
    [filteredUsers]
  );

  const activeUsers = useMemo(
    () => filteredUsers.filter((u) => u.totalQuestions > 0).length,
    [filteredUsers]
  );

  const dateLabel = startTime && endTime
    ? `${startTime.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} – ${endTime.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`
    : "All time";

  return (
    <div style={{ padding: "0px 20px 20px 20px", flex: 1, overflowY: "auto" }}>
      {/* Header */}
      <div className="mb-5">
        <h2
          className="text-base font-semibold text-(--foreground)"
          style={{ margin: 0 }}
        >
          User Details
        </h2>
        <p
          className="text-xs text-(--muted-foreground)"
          style={{ marginTop: 4 }}
        >
          {dateLabel} · {filteredUsers.length} users
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <Card className="dark:bg-[#1a1a1a] dark:border-[#2a2a2a] relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-1" style={{ background: "#3AAA5A" }} />
          <CardContent className="p-4 flex flex-col gap-0.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Total Users
            </span>
            <span className="text-2xl font-semibold dark:text-slate-100">
              {isLoading ? "—" : filteredUsers.length.toLocaleString()}
            </span>
          </CardContent>
        </Card>
        <Card className="dark:bg-[#1a1a1a] dark:border-[#2a2a2a] relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-1" style={{ background: "#3B82F6" }} />
          <CardContent className="p-4 flex flex-col gap-0.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Active Users
            </span>
            <span className="text-2xl font-semibold dark:text-slate-100">
              {isLoading ? "—" : activeUsers.toLocaleString()}
            </span>
          </CardContent>
        </Card>
        <Card className="dark:bg-[#1a1a1a] dark:border-[#2a2a2a] relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-1" style={{ background: "#EF9F27" }} />
          <CardContent className="p-4 flex flex-col gap-0.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Total Questions
            </span>
            <span className="text-2xl font-semibold dark:text-slate-100">
              {isLoading ? "—" : totalQuestions.toLocaleString()}
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Users table */}
      <Card className="dark:bg-[#1a1a1a] dark:border-[#2a2a2a]">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-sm font-medium">All Farmers</CardTitle>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-56">
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
              <div className="shrink-0 [&_label]:hidden [&_#date-toggle]:!whitespace-nowrap [&_#date-toggle_span]:!whitespace-nowrap [&_#date-toggle]:!h-9">
                <DateRangeFilter
                  customName=""
                  advanceFilter={{ startTime, endTime }}
                  handleDialogChange={handleDateChange}
                  className={
                    startTime
                      ? "!h-9 !text-sm !border-green-500 dark:!border-green-500 !bg-green-50 dark:!bg-[#1a1a1a] !text-green-700 dark:!text-green-400 !font-medium hover:!bg-green-100 dark:hover:!bg-[#2a2a2a]"
                      : "!h-9 !text-sm !border-gray-200 dark:!border-gray-700 !bg-white dark:!bg-[#1a1a1a] !text-gray-700 dark:!text-gray-200 !font-normal hover:!bg-gray-50 dark:hover:!bg-[#2a2a2a]"
                  }
                />
              </div>
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
            <div style={{ overflowX: "auto" }}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-[#151515]">
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-(--muted-foreground)">#</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-(--muted-foreground)">Name</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-(--muted-foreground)">Email</th>
                    <th className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-(--muted-foreground)">Questions Asked</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-(--muted-foreground) text-sm">
                        {searchQuery ? "No users match your search." : "No users found."}
                      </td>
                    </tr>
                  ) : (
                    <>
                      {visibleUsers.map((user, idx) => (
                        <tr
                          key={user.userId}
                          className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50/50 dark:hover:bg-[#1e1e1e] transition-colors"
                        >
                          <td className="px-4 py-2.5 text-(--muted-foreground) tabular-nums">
                            {idx + 1}
                          </td>
                          <td className="px-4 py-2.5 font-medium text-(--foreground) whitespace-nowrap">
                            {user.name}
                          </td>
                          <td className="px-4 py-2.5 text-(--muted-foreground) whitespace-nowrap">
                            {user.email}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            <span
                              className={`inline-flex items-center justify-center min-w-[32px] px-2 py-0.5 rounded-full text-xs font-semibold ${
                                user.totalQuestions > 0
                                  ? "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300"
                                  : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                              }`}
                            >
                              {user.totalQuestions.toLocaleString()}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {/* Scroll sentinel — triggers loading more rows */}
                      <tr ref={sentinelRef} style={{ height: 1 }}>
                        <td colSpan={4} />
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
              {/* Showing X of Y indicator */}
              {filteredUsers.length > 0 && (
                <div className="px-4 py-2.5 text-center text-xs text-(--muted-foreground) border-t border-gray-100 dark:border-gray-800">
                  Showing {Math.min(visibleCount, filteredUsers.length)} of {filteredUsers.length} users
                  {hasMore && " · scroll for more"}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
