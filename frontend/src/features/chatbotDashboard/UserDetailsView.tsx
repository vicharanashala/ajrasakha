import { useState, useEffect, useRef } from "react";
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

const VISIBLE_CROPS = 2;

function CropsCell({ crops }: { crops: string[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!crops || crops.length === 0) return <span>—</span>;

  const visible = crops.slice(0, VISIBLE_CROPS);
  const hidden = crops.slice(VISIBLE_CROPS);

  return (
    <div className="flex items-center gap-1 flex-wrap justify-center" ref={ref}>
      {visible.map((c, i) => (
        <span
          key={i}
          className="inline-block px-1.5 py-0.5 rounded text-xs bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 whitespace-nowrap"
        >
          {c}
        </span>
      ))}
      {hidden.length > 0 && (
        <div className="relative">
          <button
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900 transition-colors cursor-pointer"
          >
            +{hidden.length}
          </button>
          {open && (
            <div className="absolute z-50 top-full mt-1 left-1/2 -translate-x-1/2 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-2 min-w-[120px]">
              <div className="flex flex-col gap-1">
                {crops.map((c, i) => (
                  <span
                    key={i}
                    className="px-2 py-1 rounded text-xs bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 whitespace-nowrap"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface UserDetailsViewProps {
  source?: 'vicharanashala' | 'annam';
}

export function UserDetailsView({ source = 'vicharanashala' }: UserDetailsViewProps) {
  const [startTime, setStartTime] = useState<Date | undefined>(undefined);
  const [endTime, setEndTime] = useState<Date | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [cropQuery, setCropQuery] = useState("");
  const [debouncedCrop, setDebouncedCrop] = useState("");
  const [villageQuery, setVillageQuery] = useState("");
  const [debouncedVillage, setDebouncedVillage] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // Debounce the search input so we don't fire a request on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedCrop(cropQuery);
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [cropQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedVillage(villageQuery);
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [villageQuery]);

  const { data, isLoading, error } = useUserDetails(
    startTime,
    endTime,
    currentPage,
    PAGE_SIZE,
    debouncedSearch,
    source,
    debouncedCrop,
    debouncedVillage,
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
            {/* Row 1: name search + date range */}
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
            </div>
            {/* Row 2: crop + village + reset */}
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
                  placeholder="Filter by crop..."
                  value={cropQuery}
                  onChange={(e) => setCropQuery(e.target.value)}
                  className="w-full h-9 pl-9 pr-3 text-sm border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-[#222] text-(--foreground) placeholder:text-(--muted-foreground) outline-none focus:border-[#3AAA5A] transition-colors"
                />
              </div>
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
                  placeholder="Filter by village..."
                  value={villageQuery}
                  onChange={(e) => setVillageQuery(e.target.value)}
                  className="w-full h-9 pl-9 pr-3 text-sm border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-[#222] text-(--foreground) placeholder:text-(--muted-foreground) outline-none focus:border-[#3AAA5A] transition-colors"
                />
              </div>
              {(searchQuery || startTime || endTime || cropQuery || villageQuery) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 w-full sm:w-auto"
                  onClick={() => {
                    setSearchQuery("");
                    setStartTime(undefined);
                    setEndTime(undefined);
                    setCropQuery("");
                    setVillageQuery("");
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
              <Table className="min-w-[1600px]">
                <TableHeader className="bg-card sticky top-0 z-10">
                  <TableRow>
                    <TableHead className="text-center w-12">S.No</TableHead>
                    <TableHead className="text-center">Questions Asked</TableHead>
                    <TableHead className="text-center">Name</TableHead>
                    <TableHead className="text-center">Email</TableHead>
                    <TableHead className="text-center">Farmer Name</TableHead>
                    <TableHead className="text-center">Age</TableHead>
                    <TableHead className="text-center">Gender</TableHead>
                    <TableHead className="text-center">Village</TableHead>
                    <TableHead className="text-center">Block</TableHead>
                    <TableHead className="text-center">District</TableHead>
                    <TableHead className="text-center">State</TableHead>
                    <TableHead className="text-center">Phone</TableHead>
                    <TableHead className="text-center">Language</TableHead>
                    <TableHead className="text-center">Exp. (Yrs)</TableHead>
                    <TableHead className="text-center">Crops</TableHead>
                    <TableHead className="text-center">Primary Crop</TableHead>
                    <TableHead className="text-center">Secondary Crop</TableHead>
                    <TableHead className="text-center">KCC Aware</TableHead>
                    <TableHead className="text-center">Agri Apps</TableHead>
                    <TableHead className="text-center">Education</TableHead>
                    <TableHead className="text-center">Smartphones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={21} className="text-center py-10 text-muted-foreground">
                        {debouncedSearch ? "No users match your search." : "No users found."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    users.map((user, idx) => {
                      const fp = user.farmerProfile;
                      return (
                        <TableRow key={user.userId} className="text-center">
                          <TableCell className="align-middle">
                            {(currentPage - 1) * PAGE_SIZE + idx + 1}
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
                          <TableCell className="align-middle font-medium whitespace-nowrap">
                            {user.name}
                          </TableCell>
                          <TableCell className="align-middle whitespace-nowrap">
                            {user.email}
                          </TableCell>
                          <TableCell className="align-middle whitespace-nowrap">{fp?.farmerName ?? "—"}</TableCell>
                          <TableCell className="align-middle">{fp?.age ?? "—"}</TableCell>
                          <TableCell className="align-middle whitespace-nowrap">{fp?.gender ?? "—"}</TableCell>
                          <TableCell className="align-middle whitespace-nowrap">{fp?.villageName ?? "—"}</TableCell>
                          <TableCell className="align-middle whitespace-nowrap">{fp?.blockName ?? "—"}</TableCell>
                          <TableCell className="align-middle whitespace-nowrap">{fp?.district ?? "—"}</TableCell>
                          <TableCell className="align-middle whitespace-nowrap">{fp?.state ?? "—"}</TableCell>
                          <TableCell className="align-middle whitespace-nowrap">{fp?.phoneNo ?? "—"}</TableCell>
                          <TableCell className="align-middle whitespace-nowrap">{fp?.languagePreference ?? "—"}</TableCell>
                          <TableCell className="align-middle">{fp?.yearsOfExperience ?? "—"}</TableCell>
                          <TableCell className="align-middle"><CropsCell crops={fp?.cropsCultivated ?? []} /></TableCell>
                          <TableCell className="align-middle whitespace-nowrap">{fp?.primaryCrop ?? "—"}</TableCell>
                          <TableCell className="align-middle whitespace-nowrap">{fp?.secondaryCrop ?? "—"}</TableCell>
                          <TableCell className="align-middle">{fp?.awarenessOfKCC == null ? "—" : fp.awarenessOfKCC ? "Yes" : "No"}</TableCell>
                          <TableCell className="align-middle">{fp?.usesAgriApps == null ? "—" : fp.usesAgriApps ? "Yes" : "No"}</TableCell>
                          <TableCell className="align-middle whitespace-nowrap">{fp?.highestEducatedPerson ?? "—"}</TableCell>
                          <TableCell className="align-middle">{fp?.numberOfSmartphones ?? "—"}</TableCell>
                        </TableRow>
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
