import { useState, useEffect, useRef } from "react";
import { X, MapPin } from "lucide-react";
import { Button } from "@/components/atoms/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/card";
import { Spinner } from "@/components/atoms/spinner";
import { useUserDetails } from "./hooks/useUserDetails";
import { BarGraph } from "./components/shared/BarGrapgh";
import { Pagination } from "@/components/pagination";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/atoms/tooltip";

const PAGE_SIZE = 10;

const VISIBLE_CROPS = 2;

function CropsCell({ crops }: { crops: string | string[] | undefined | null }) {
  const cropList = Array.isArray(crops) 
    ? crops 
    : (crops ? crops.split(",").map(s => s.trim()).filter(Boolean) : []);

  if (cropList.length === 0) return <span>—</span>;

  const visible = cropList.slice(0, VISIBLE_CROPS);
  const hidden = cropList.slice(VISIBLE_CROPS);

  return (
    <div className="flex flex-col items-center gap-0.5">
      {visible.map((c, i) => (
        <span
          key={i}
          className="px-1.5 py-0.5 rounded text-xs max-w-[120px] truncate text-center"
          title={c}
        >
          {c}
        </span>
      ))}

      {hidden.length > 0 && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 cursor-default">
                +{hidden.length}
              </span>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              className="
                p-2
                min-w-[100px]
                bg-white text-gray-900 border border-gray-200
                dark:bg-[#1a1a1a] dark:text-gray-100 dark:border-gray-700
              "
            >
              <div className="flex flex-col gap-2 text-center">
                {cropList.map((c, i) => (
                  <span key={i} className="text-xs whitespace-nowrap">
                    {c}
                  </span>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}
const DEFAULT_FILTERS: UserDetailsFilters = {
  search: "",
  crop: "",
  village: "",
  startTime: undefined,
  endTime: undefined,
  profileCompleted: "all",
  inactiveOnly: false,
  userType: "all",
};

interface UserDetailsViewProps {
  source?: 'vicharanashala' | 'annam';
  initialFilters?: Partial<UserDetailsFilters>;
  userType?: 'all' | 'external' | 'internal';
}

export function UserDetailsView({ source = 'vicharanashala', initialFilters, userType = 'all' }: UserDetailsViewProps) {
  const [filters, setFilters] = useState<UserDetailsFilters>(() => ({
    ...DEFAULT_FILTERS,
    ...initialFilters,
    userType,
  }));
  const [currentPage, setCurrentPage] = useState(1);

  // Apply initialFilters when they change (e.g. clicking from AlertCard)
  useEffect(() => {
    if (initialFilters) {
      setFilters(prev => ({ ...prev, ...initialFilters }));
      setCurrentPage(1);
    }
  }, [initialFilters]);

  const { data, isLoading, error } = useUserDetails(
    filters.startTime,
    filters.endTime,
    currentPage,
    PAGE_SIZE,
    filters.search,
    source,
    filters.crop,
    filters.village,
    filters.profileCompleted,
    filters.inactiveOnly,
    filters.userType,
  );

  const { users, totalUsers, totalPages, activeUsers, inactiveUsers, totalQuestions } = data;

  const handleApplyFilters = (newFilters: UserDetailsFilters) => {
    setFilters(newFilters);
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setCurrentPage(1);
  };

  const isFiltered =
    filters.search ||
    filters.crop ||
    filters.village ||
    filters.startTime ||
    filters.profileCompleted !== "all" ||
    filters.inactiveOnly ||
    filters.userType !== "all";

  const dateLabel = filters.startTime && filters.endTime
    ? `${filters.startTime.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} – ${filters.endTime.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`
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
        {/* Active Users — col 1 row 1 */}
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

        {/* Inactive Users — col 2 row 1 */}
        <Card className="dark:bg-[#1a1a1a] dark:border-[#2a2a2a] relative overflow-hidden self-start">
          <div className="absolute inset-x-0 top-0 h-1 bg-[#EF4444]" />
          <CardContent className="p-4 flex flex-col gap-0.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Inactive Users
            </span>
            <span className="text-2xl font-semibold dark:text-slate-100">
              {isLoading ? "—" : inactiveUsers.toLocaleString()}
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
        {!isLoading && !error && users.length > 0 && !filters.inactiveOnly && (
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
          <div className="flex items-center justify-between gap-3 min-w-0 w-full">
            <CardTitle className="text-sm font-medium">All Farmers</CardTitle>
            <div className="flex items-center gap-2">
              {isFiltered && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 text-muted-foreground hover:text-foreground"
                  onClick={handleResetFilters}
                >
                  <X className="h-4 w-4 mr-1" />
                  Clear
                </Button>
              )}
              <UserDetailsPreferenceFilter
                filters={filters}
                onApply={handleApplyFilters}
              />
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
                    <TableHead className="text-center">Location</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={22} className="text-center py-10 text-muted-foreground">
                        {isFiltered ? "No users match your filters." : "No users found."}
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
                          <TableCell className="align-middle"><CropsCell crops={fp?.cropsCultivated} /></TableCell>
                          <TableCell className="align-middle"><CropsCell crops={fp?.primaryCrop} /></TableCell>
                          <TableCell className="align-middle"><CropsCell crops={fp?.secondaryCrop} /></TableCell>
                          <TableCell className="align-middle">{fp?.awarenessOfKCC == null ? "—" : fp.awarenessOfKCC ? "Yes" : "No"}</TableCell>
                          <TableCell className="align-middle">{fp?.usesAgriApps == null ? "—" : fp.usesAgriApps ? "Yes" : "No"}</TableCell>
                          <TableCell className="align-middle whitespace-nowrap">{fp?.highestEducatedPerson ?? "—"}</TableCell>
                          <TableCell className="align-middle">{fp?.numberOfSmartphones ?? "—"}</TableCell>
                          <TableCell className="align-middle">
                            {fp?.location?.latitude && fp?.location?.longitude ? (
                              <a 
                                href={`https://maps.google.com/?q=${fp.location.latitude},${fp.location.longitude}`} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                title="View on Maps"
                                className="inline-flex items-center justify-center p-1.5 rounded-full bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors cursor-pointer"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MapPin className="h-4 w-4" />
                              </a>
                            ) : (
                              "—"
                            )}
                          </TableCell>
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
