import { useState, useMemo } from "react";
import { X, Users, Filter, Search, Calendar, MessageSquare, ArrowUpDown, RefreshCw } from "lucide-react";
import { Button } from "@/components/atoms/button";
import { useAllWhatsappUsers } from "./hooks/useActiveUsersAnalytics";
import { TranslatableText } from "./components/TranslatableText";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/atoms/table";
import { Pagination } from "@/components/pagination";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/atoms/dialog";
import { Label } from "@/components/atoms/label";
import { Badge } from "@/components/atoms/badge";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/atoms/skeleton";

export interface WhatsAppUser {
  phoneNumber: string;
  messageCount: number;
  firstMessageAt: string;
  lastMessageAt: string;
  lastMessageText: string;
}

export const WhatsappUsers: WhatsAppUser[] = [
  {
    phoneNumber: "919876123456",
    messageCount: 15,
    firstMessageAt: "2026-01-10T08:30:00.000Z",
    lastMessageAt: "2026-05-22T14:20:00.000Z",
    lastMessageText: "How can I grow tomatoes in Punjab?",
  },
  {
    phoneNumber: "918888123456",
    messageCount: 7,
    firstMessageAt: "2026-02-14T11:10:00.000Z",
    lastMessageAt: "2026-05-18T09:45:00.000Z",
    lastMessageText: "What is the best fertilizer for wheat?",
  },
  {
    phoneNumber: "917700123456",
    messageCount: 22,
    firstMessageAt: "2026-03-02T06:50:00.000Z",
    lastMessageAt: "2026-05-24T07:10:00.000Z",
    lastMessageText: "How to control leaf curl disease in chilli?",
  },
  {
    phoneNumber: "919999123456",
    messageCount: 4,
    firstMessageAt: "2026-04-01T10:00:00.000Z",
    lastMessageAt: "2026-05-12T16:40:00.000Z",
    lastMessageText: "Information regarding PM Kisan scheme",
  },
  {
    phoneNumber: "916655123456",
    messageCount: 31,
    firstMessageAt: "2025-12-20T07:15:00.000Z",
    lastMessageAt: "2026-05-23T18:05:00.000Z",
    lastMessageText: "Yellow rust disease has appeared in wheat, what should be done?",
  },
  {
    phoneNumber: "919811123456",
    messageCount: 11,
    firstMessageAt: "2026-01-18T09:00:00.000Z",
    lastMessageAt: "2026-05-20T12:25:00.000Z",
    lastMessageText: "How to increase paddy yield?",
  },
  {
    phoneNumber: "917755123456",
    messageCount: 6,
    firstMessageAt: "2026-03-10T15:40:00.000Z",
    lastMessageAt: "2026-05-11T08:50:00.000Z",
    lastMessageText: "Best pesticide for cotton crop?",
  },
  {
    phoneNumber: "918877123456",
    messageCount: 18,
    firstMessageAt: "2026-02-01T07:35:00.000Z",
    lastMessageAt: "2026-05-24T05:10:00.000Z",
    lastMessageText: "What should I do for yellow leaves in sugarcane?",
  },
  {
    phoneNumber: "919900123456",
    messageCount: 9,
    firstMessageAt: "2026-04-12T13:10:00.000Z",
    lastMessageAt: "2026-05-21T18:45:00.000Z",
    lastMessageText: "How can I prevent stem borer in rice?",
  },
  {
    phoneNumber: "916600123456",
    messageCount: 13,
    firstMessageAt: "2026-01-28T10:30:00.000Z",
    lastMessageAt: "2026-05-19T16:00:00.000Z",
    lastMessageText: "Which variety of wheat is best for Punjab?",
  },
];
interface WhatsAppFilters {
  search: string;
  minMessageCount: string;
  maxMessageCount: string;
  startDate: string;
  endDate: string;
}

const DEFAULT_FILTERS: WhatsAppFilters = {
  search: "",
  minMessageCount: "",
  maxMessageCount: "",
  startDate: "",
  endDate: "",
};

const inputClass =
  "w-full h-10 px-3 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-[#1e1e1e] text-(--foreground) placeholder:text-(--muted-foreground) outline-none focus:ring-2 focus:ring-[#3AAA5A]/30 focus:border-[#3AAA5A] transition-all";

function FilterSection({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-[#161616] p-4 space-y-2">
      <Label className="flex items-center gap-2 text-sm font-semibold text-(--foreground)">
        <span className="flex items-center justify-center w-6 h-6 rounded-md bg-[#3AAA5A]/10 text-[#3AAA5A]">
          {icon}
        </span>
        {label}
      </Label>
      {children}
    </div>
  );
}

interface WhatsAppUsersPreferenceFilterProps {
  filters: WhatsAppFilters;
  onApply: (filters: WhatsAppFilters) => void;
}

function WhatsAppUsersPreferenceFilter({
  filters,
  onApply,
}: WhatsAppUsersPreferenceFilterProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<WhatsAppFilters>(filters);

  const handleOpen = (isOpen: boolean) => {
    if (isOpen) setDraft(filters);
    setOpen(isOpen);
  };

  const handleApply = () => {
    onApply(draft);
    setOpen(false);
  };

  const handleReset = () => {
    setDraft(DEFAULT_FILTERS);
  };

  const activeCount =
    (filters.search ? 1 : 0) +
    (filters.minMessageCount ? 1 : 0) +
    (filters.maxMessageCount ? 1 : 0) +
    (filters.startDate ? 1 : 0) +
    (filters.endDate ? 1 : 0);

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 flex items-center gap-2 border-gray-200 dark:border-gray-700 hover:border-[#3AAA5A] hover:text-[#3AAA5A] transition-colors"
        >
          <Filter className="h-4 w-4" />
          Preferences
          {activeCount > 0 && (
            <Badge className="ml-0.5 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs bg-[#3AAA5A] hover:bg-[#3AAA5A] text-white">
              {activeCount}
            </Badge>
          )}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg w-full p-0 gap-0 overflow-hidden z-[10001]" overlayClassName="z-[10000]">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-[#3AAA5A]/10">
              <Filter className="h-4 w-4 text-[#3AAA5A]" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                Filter Preferences
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Refine the WhatsApp user list with one or more filters
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="px-6 py-5 space-y-3 max-h-[60vh] overflow-y-auto">
          {/* Search */}
          <FilterSection icon={<Search className="h-3.5 w-3.5" />} label="Phone / Message text">
            <input
              type="text"
              placeholder="Search phone number or message..."
              value={draft.search}
              onChange={(e) => setDraft((d) => ({ ...d, search: e.target.value }))}
              className={inputClass}
            />
          </FilterSection>

          {/* Message Count */}
          <FilterSection icon={<MessageSquare className="h-3.5 w-3.5" />} label="Message Count Range">
            <div className="grid grid-cols-2 gap-3">
              <input
                type="number"
                min="0"
                placeholder="Min messages..."
                value={draft.minMessageCount}
                onChange={(e) => setDraft((d) => ({ ...d, minMessageCount: e.target.value }))}
                className={inputClass}
              />
              <input
                type="number"
                min="0"
                placeholder="Max messages..."
                value={draft.maxMessageCount}
                onChange={(e) => setDraft((d) => ({ ...d, maxMessageCount: e.target.value }))}
                className={inputClass}
              />
            </div>
          </FilterSection>

          {/* Last Message Date Range */}
          <FilterSection icon={<Calendar className="h-3.5 w-3.5" />} label="Last Message Date Range">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground font-medium">From</span>
                <input
                  type="date"
                  value={draft.startDate}
                  onChange={(e) => setDraft((d) => ({ ...d, startDate: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground font-medium">To</span>
                <input
                  type="date"
                  value={draft.endDate}
                  onChange={(e) => setDraft((d) => ({ ...d, endDate: e.target.value }))}
                  className={inputClass}
                />
              </div>
            </div>
          </FilterSection>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex justify-between sm:justify-between gap-2 bg-gray-50/50 dark:bg-[#161616]">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="text-muted-foreground hover:text-foreground"
          >
            Reset all
          </Button>
          <div className="flex gap-2">
            <DialogClose asChild>
              <Button variant="outline" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button
              size="sm"
              onClick={handleApply}
              className="bg-[#3AAA5A] hover:bg-[#2e9449] text-white px-5"
            >
              Apply Filters
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function WhatsAppUsersView() {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => {
    setRefreshing(true);
    await queryClient.refetchQueries({ queryKey: ["whatsapp-all-users"] });
    setRefreshing(false);
  };
  const [filters, setFilters] = useState<WhatsAppFilters>(DEFAULT_FILTERS);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [sortBy, setSortBy] = useState<keyof WhatsAppUser>("lastMessageAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const { data: apiResponse, isLoading } = useAllWhatsappUsers();

  const activeUsersData = useMemo<WhatsAppUser[]>(() => {
    if (apiResponse?.users && apiResponse.users.length > 0) {
      return apiResponse.users;
    }
    return [];
  }, [apiResponse]);

  const handleApplyFilters = (newFilters: WhatsAppFilters) => {
    setFilters(newFilters);
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setCurrentPage(1);
  };

  const handleSort = (field: keyof WhatsAppUser) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"));
    } else {
      setSortBy(field);
      setSortOrder(field === "phoneNumber" ? "asc" : "desc");
    }
    setCurrentPage(1);
  };

  // 1. Filtering logic
  const filteredUsers = useMemo(() => {
    return activeUsersData.filter((user) => {
      // Search text filter
      if (filters.search) {
        const query = filters.search.toLowerCase();
        const matchesPhone = (user.phoneNumber ?? '').toLowerCase().includes(query);
        const matchesMessage = (user.lastMessageText ?? '').toLowerCase().includes(query);
        if (!matchesPhone && !matchesMessage) return false;
      }

      // Min message count
      if (filters.minMessageCount) {
        const minVal = parseInt(filters.minMessageCount, 10);
        if (!isNaN(minVal) && user.messageCount < minVal) return false;
      }

      // Max message count
      if (filters.maxMessageCount) {
        const maxVal = parseInt(filters.maxMessageCount, 10);
        if (!isNaN(maxVal) && user.messageCount > maxVal) return false;
      }

      // Date Range filters (based on lastMessageAt)
      if (filters.startDate) {
        const start = new Date(filters.startDate);
        start.setHours(0, 0, 0, 0);
        const lastMsgDate = new Date(user.lastMessageAt);
        if (lastMsgDate < start) return false;
      }

      if (filters.endDate) {
        const end = new Date(filters.endDate);
        end.setHours(23, 59, 59, 999);
        const lastMsgDate = new Date(user.lastMessageAt);
        if (lastMsgDate > end) return false;
      }

      return true;
    });
  }, [activeUsersData, filters]);

  // 2. Sorting logic
  const sortedUsers = useMemo(() => {
    const sorted = [...filteredUsers];
    sorted.sort((a, b) => {
      let aVal = a[sortBy];
      let bVal = b[sortBy];

      if (sortBy === "firstMessageAt" || sortBy === "lastMessageAt") {
        const aDate = new Date(aVal as string).getTime();
        const bDate = new Date(bVal as string).getTime();
        return sortOrder === "asc" ? aDate - bDate : bDate - aDate;
      }

      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortOrder === "asc" ? aVal - bVal : bVal - aVal;
      }

      // Alphabetical sorting for string
      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      return sortOrder === "asc" ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
    });
    return sorted;
  }, [filteredUsers, sortBy, sortOrder]);

  // 3. Pagination logic
  const paginatedUsers = useMemo(() => {
    const startIdx = (currentPage - 1) * pageSize;
    return sortedUsers.slice(startIdx, startIdx + pageSize);
  }, [sortedUsers, currentPage, pageSize]);

  const totalPages = Math.ceil(sortedUsers.length / pageSize);

  const formatDateTime = (dateStr: string) => {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  const isFiltered =
    filters.search ||
    filters.minMessageCount ||
    filters.maxMessageCount ||
    filters.startDate ||
    filters.endDate;

  return (
    <div className="w-full">
      <Card className="dark:bg-[#1a1a1a] dark:border-[#2a2a2a]">
        <CardHeader className="pb-4 border-b">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="text-base font-semibold tracking-tight flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-primary/10">
                  <Users className="h-4 w-4 text-primary" />
                </div>
                All Whatsapp Users
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                View and filter Whatsapp user activity and message summaries.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap lg:flex-nowrap">
              {isFiltered && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 px-3"
                  onClick={handleResetFilters}
                >
                  <X className="h-4 w-4 mr-1.5" />
                  Clear Filters
                </Button>
              )}
              <button
                onClick={handleRefresh}
                className="h-9 w-9 pl-2 rounded-md border"
              >
                <RefreshCw
                  className={`h-4 w-4 bg-background ${
                    refreshing ? "animate-spin" : ""
                  }`}
                />
              </button>

              <WhatsAppUsersPreferenceFilter
                filters={filters}
                onApply={handleApplyFilters}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {refreshing || isLoading && !apiResponse ? (
            <div className="h-[320px]">
                <Skeleton className="h-full w-full" />
            </div>
          ) : activeUsersData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center border rounded-lg bg-card">
              <Users className="h-10 w-10 text-muted-foreground/50 mb-3" />
              <h3 className="font-medium text-sm text-foreground">No WhatsApp Users</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                No WhatsApp user threads or message histories were found in the database.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border bg-card overflow-x-auto">
            <Table className="min-w-[1000px]">
              <TableHeader className="bg-card sticky top-0 z-10">
                <TableRow>
                  <TableHead className="text-center w-16">S.No</TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    onClick={() => handleSort("phoneNumber")}
                  >
                    <div className="flex items-center justify-center gap-1">
                      Phone Number
                      <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    onClick={() => handleSort("messageCount")}
                  >
                    <div className="flex items-center justify-center gap-1">
                      Message Count
                      <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    onClick={() => handleSort("firstMessageAt")}
                  >
                    <div className="flex items-center justify-center gap-1">
                      First Message At
                      <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    onClick={() => handleSort("lastMessageAt")}
                  >
                    <div className="flex items-center justify-center gap-1">
                      Last Message At
                      <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </TableHead>
                  <TableHead className="text-left max-w-[300px]">Last Message Text</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedUsers.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center py-10 text-muted-foreground"
                    >
                      {isFiltered
                        ? "No users match your filters."
                        : "No users found."}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedUsers.map((user, idx) => (
                    <TableRow key={user.phoneNumber} className="group text-center hover:bg-muted/40 transition-colors duration-100">
                      <TableCell className="align-middle text-xs text-muted-foreground tabular-nums">
                        {(currentPage - 1) * pageSize + idx + 1}
                      </TableCell>
                      <TableCell className="align-middle font-medium whitespace-nowrap">
                        <a
                          href={`tel:${user.phoneNumber}`}
                          className="text-blue-600 dark:text-blue-400 hover:underline text-sm tabular-nums"
                        >
                          +{user.phoneNumber}
                        </a>
                      </TableCell>
                      <TableCell className="align-middle">
                        <span className="inline-flex items-center justify-center min-w-[32px] h-6 px-2 rounded-full text-xs font-semibold bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300">
                          {user.messageCount.toLocaleString()}
                        </span>
                      </TableCell>
                      <TableCell className="align-middle whitespace-nowrap text-xs text-muted-foreground">
                        {formatDateTime(user.firstMessageAt)}
                      </TableCell>
                      <TableCell className="align-middle whitespace-nowrap text-xs text-muted-foreground">
                        {formatDateTime(user.lastMessageAt)}
                      </TableCell>
                      <TableCell className="align-middle text-left text-sm max-w-[300px]">
                        <TranslatableText
                          text={user.lastMessageText}
                          showTooltip
                          textClassName="text-sm truncate"
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            {totalPages > 0 && (
              <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    Showing{" "}
                    {paginatedUsers.length > 0
                      ? (currentPage - 1) * pageSize + 1
                      : 0}
                    –{(currentPage - 1) * pageSize + paginatedUsers.length} of{" "}
                    {sortedUsers.length} users
                  </span>
                  <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={(page) => setCurrentPage(page)}
                    limit={pageSize}
                    onLimitChange={setPageSize}
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
