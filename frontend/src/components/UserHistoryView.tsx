import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Briefcase,
  CalendarClock,
  CircleCheckBig,
  CircleOff,
  Filter,
  History as HistoryIcon,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/atoms/badge";
import { Button } from "@/components/atoms/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import { Input } from "@/components/atoms/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/atoms/table";
import {
  useGetUserHistory,
  type UserHistoryItem,
} from "@/hooks/api/user/useGetUserHistory";

const padTime = (value: number) => String(value).padStart(2, "0");

const getTodayFilterDefaults = () => {
  const now = new Date();
  const today = `${now.getFullYear()}-${padTime(now.getMonth() + 1)}-${padTime(
    now.getDate(),
  )}`;

  return {
    fromDate: today,
    fromTime: "00:00",
    toDate: today,
    toTime: "23:59",
  };
};

const buildDateTimeValue = (date?: string, time?: string) => {
  if (!date) return "";
  if (!time) return date;
  return `${date}T${time}`;
};

const formatDisplayDateTime = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

const formatValue = (value: unknown) => {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value === undefined || value === null || value === "") return "-";
  return String(value);
};

const getDisplayText = (value: unknown) => {
  if (typeof value === "string") {
    return value
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }
  return formatValue(value);
};

interface UserHistoryViewProps {
  userId: string;
  showBack?: boolean;
  onBack?: () => void;
}

export function UserHistoryView({ userId, showBack = false, onBack }: UserHistoryViewProps) {
  const navigate = useNavigate();
  const [dateFilter, setDateFilter] = useState(() => getTodayFilterDefaults());

  const fromValue = useMemo(
    () => buildDateTimeValue(dateFilter.fromDate, dateFilter.fromTime),
    [dateFilter.fromDate, dateFilter.fromTime],
  );
  const toValue = useMemo(
    () => buildDateTimeValue(dateFilter.toDate, dateFilter.toTime),
    [dateFilter.toDate, dateFilter.toTime],
  );

  const { data, isLoading, error } = useGetUserHistory(
    userId,
    fromValue,
    toValue,
  );

  const userDetails = data?.userDetails;
  const history = data?.roleHistory ?? [];

  const windowFrom = fromValue;
  const windowTo = toValue;

  const displayName =
    userDetails?.name ||
    [userDetails?.firstName, userDetails?.lastName].filter(Boolean).join(" ") ||
    "User";
  const displayEmail = userDetails?.email || "-";
  const displayRole = userDetails?.role || "-";
  const displayStatus = userDetails?.status || "-";
  const isBlocked = userDetails?.isBlocked ?? false;
  const isStf = userDetails?.special_task_force ?? false;

  const selectedRangeLabel = useMemo(() => {
    if (fromValue && toValue) return `${fromValue} -> ${toValue}`;
    if (fromValue) return `From ${fromValue}`;
    if (toValue) return `Until ${toValue}`;
    return "All available history";
  }, [fromValue, toValue]);

  const resetFilters = () => {
    setDateFilter(getTodayFilterDefaults());
  };

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 w-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {showBack && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack || (() => navigate({ to: "/home" }))}
              className="rounded-full"
              aria-label="Go back"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              User account activity
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">
              User history
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary shadow-sm">
          <Filter className="h-4 w-4" />
          <span className="max-w-[260px] truncate">{selectedRangeLabel}</span>
        </div>
      </div>

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl">
                <UserRound className="h-5 w-5 text-primary" />
                User profile snapshot
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Key details and the current account state pulled from the user
                history endpoint.
              </p>
            </div>
            <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
              {history.length} activity records
            </div>
          </div>
        </CardHeader>

        <CardContent className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border border-border/70 bg-gradient-to-br from-primary/5 via-background to-background p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <UserRound className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">{displayName}</h2>
                <p className="text-sm text-muted-foreground">
                  {displayEmail}
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <InfoItem icon={Briefcase} label="Role" value={displayRole} />
              <InfoItem
                icon={ShieldAlert}
                label="Status"
                value={displayStatus}
              />
              <InfoItem
                icon={isBlocked ? CircleOff : CircleCheckBig}
                label="Blocked"
                value={isBlocked ? "Yes" : "No"}
              />
              <InfoItem
                icon={isStf ? ShieldCheck : CircleOff}
                label="STF"
                value={isStf ? "Yes" : "No"}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-muted/20 p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <CalendarClock className="h-4 w-4 text-primary" />
              Activity window
            </div>
            <div className="mt-4 space-y-3">
              <WindowCard
                label="From"
                value={
                  windowFrom
                    ? formatDisplayDateTime(windowFrom)
                    : "All available history"
                }
              />
              <WindowCard
                label="To"
                value={
                  windowTo
                    ? formatDisplayDateTime(windowTo)
                    : "Latest available record"
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <HistoryIcon className="h-5 w-5 text-primary" />
                History timeline
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Filter the records by a custom start and end date/time range.
              </p>
            </div>

            <div className="w-full max-w-2xl rounded-2xl border border-border/70 bg-background/80 p-3 shadow-sm">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">
                    From date
                  </label>
                  <Input
                    type="date"
                    value={dateFilter.fromDate}
                    onChange={(event) =>
                      setDateFilter((prev) => ({
                        ...prev,
                        fromDate: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">
                    To date
                  </label>
                  <Input
                    type="date"
                    value={dateFilter.toDate}
                    onChange={(event) =>
                      setDateFilter((prev) => ({
                        ...prev,
                        toDate: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">
                    From time
                  </label>
                  <Input
                    type="time"
                    value={dateFilter.fromTime}
                    onChange={(event) =>
                      setDateFilter((prev) => ({
                        ...prev,
                        fromTime: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">
                    To time
                  </label>
                  <Input
                    type="time"
                    value={dateFilter.toTime}
                    onChange={(event) =>
                      setDateFilter((prev) => ({
                        ...prev,
                        toTime: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Select both a start and end date/time to narrow the table
                  below.
                </p>
                <Button variant="ghost" size="sm" onClick={resetFilters}>
                  Reset
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-border/70 bg-muted/20 p-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading user history...
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-destructive/20 bg-destructive/10 p-6 text-sm text-destructive">
              Unable to load user history right now. Please try again shortly.
            </div>
          ) : history.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-8 text-center text-sm text-muted-foreground">
              No activity records found for the selected period.
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border/70">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="min-w-[180px]">Time</TableHead>
                    <TableHead className="min-w-[100px]">Role</TableHead>
                    <TableHead className="min-w-[110px]">Status</TableHead>
                    <TableHead className="min-w-[90px]">Blocked</TableHead>
                    <TableHead className="min-w-[80px]">STF</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((item: UserHistoryItem, index: number) => (
                    <TableRow
                      key={item._id ?? `${item.from ?? "entry"}-${index}`}
                    >
                      <TableCell className="font-medium text-foreground">
                        {formatDisplayDateTime(item.from)}
                      </TableCell>
                      <TableCell>{getDisplayText(item.role)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {getDisplayText(item.status || displayStatus)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            item.isBlocked === true || isBlocked
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {formatValue(item.isBlocked ?? isBlocked)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            item.special_task_force === true || isStf
                              ? "default"
                              : "secondary"
                          }
                        >
                          {formatValue(item.special_task_force ?? isStf)}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[320px] whitespace-normal text-sm text-muted-foreground">
                        {getDisplayText(
                          item.to
                            ? `Active until ${formatDisplayDateTime(item.to)}`
                            : "Currently active",
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function InfoItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/70 p-3 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Icon className="h-4 w-4 text-primary" />
        {label}
      </div>
      <p className="mt-2 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function WindowCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/70 p-3 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}
