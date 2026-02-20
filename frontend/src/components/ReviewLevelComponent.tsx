import { useEffect, useState } from "react";
import { useGetReviewLevel } from "@/hooks/api/user/useGetReviewLevel";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./atoms/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import {
  Loader2,
  MapPin,
  Filter,
  Leaf,
  Globe,
  FileText,
  UserIcon,
  Info,
} from "lucide-react";
import { DateRangeFilter } from "./DateRangeFilter";
import { STATES, CROPS, DOMAINS, SEASONS, STATUS } from "./MetaData";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/atoms/select";
import { Label } from "@/components/atoms/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./atoms/dialog";
import { Button } from "@/components/atoms/button";
import { useGetAllUsers } from "@/hooks/api/user/useGetAllUsers";
import { TooltipContent, TooltipTrigger } from "./atoms/tooltip";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { useRestartOnView } from "@/hooks/ui/useRestartView";
interface DateRange {
  startTime?: Date;
  endTime?: Date;
}
type FilterSelectProps = {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  Icon?: any;
};
type Filters = {
  state: string;
  crop: string;
  domain: string;
  status: string;
  dateRange: DateRange;
  userId: string;
};

const FilterSelect = ({
  label,
  value,
  options,
  onChange,
  Icon,
}: FilterSelectProps) => (
  <div className="space-y-2">
    <Label className="text-sm font-semibold flex items-center gap-2">
      {Icon && <Icon className="h-4 w-4 text-primary" />}
      {label}
    </Label>
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={`Select ${label}`} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All {label}</SelectItem>
        {options.map((opt) => (
          <SelectItem key={opt} value={opt}>
            {opt}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);
const defaultFilters: Filters = {
  state: "all",
  crop: "all",
  domain: "all",
  status: "all",
  dateRange: {},
  userId: "all",
};
export const ReviewLevelComponent = () => {
  const { data: userNameReponse, isLoading } = useGetAllUsers();
  const {key,ref} = useRestartOnView()
  const [openFilter, setOpenFilter] = useState(false);
  const [draftFilters, setDraftFilters] = useState<Filters>(defaultFilters);
  const [filters, setFilters] = useState<Filters>(defaultFilters);

  let role = "moderator";
  const { data: reviewLevel, isLoading: isLoadingReviewLevel } =
    useGetReviewLevel({
      role,
      dateRange: filters.dateRange,
      state: filters.state,
      crop: filters.crop,
      domain: filters.domain,
      status: filters.status,
      userId: filters.userId,
    });
  const levels = reviewLevel || [];
  const totalCompleted = levels.reduce(
    (sum, item) => sum + (item.count ?? 0),
    0,
  );

  const handleDraftDateChange = (key: string, value?: Date) => {
    setDraftFilters((prev) => ({
      ...prev,
      dateRange: {
        ...prev.dateRange,
        [key]: value,
      },
    }));
  };
  const handleSelectedExpert = (value?: string) => {
    setDraftFilters((prev) => ({
      ...prev,
      userId: value ?? "all",
    }));
  };
  const updateDraft = (key: keyof Filters, value: string) => {
    setDraftFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  };
  const handleApplyFilters = () => {
    setFilters(draftFilters); // apply
    setOpenFilter(false); // close modal
  };
  const handleClearFilters = () => {
    setDraftFilters(defaultFilters);
    setFilters(defaultFilters);
  };
  const users = (userNameReponse?.users || [])
    .sort((a, b) => a.userName.localeCompare(b.userName))
    .filter((ele) => ele.role === "expert");

  const chartData = reviewLevel?.map((level: any) => ({
    reviewLevel: level.Review_level, // X-axis label
    completedTasks: level.count, // Bar value
  }));

  const getDescription = () => {
    const parts: string[] = [];

    if (filters.state !== "all") parts.push(`State: ${filters.state}`);
    if (filters.crop !== "all") parts.push(`Crop: ${filters.crop}`);
    if (filters.domain !== "all") parts.push(`Domain: ${filters.domain}`);
    if (filters.status !== "all") parts.push(`Status: ${filters.status}`);

    if (filters.userId !== "all") {
      const user = users.find((u) => u._id === filters.userId);
      if (user) parts.push(`User: ${user.userName}`);
    }

    if (filters.dateRange?.startTime || filters.dateRange?.endTime) {
      const start = filters.dateRange.startTime
        ? filters.dateRange.startTime.toLocaleDateString()
        : "Any";
      const end = filters.dateRange.endTime
        ? filters.dateRange.endTime.toLocaleDateString()
        : "Any";
      parts.push(`Date: ${start} → ${end}`);
    }

    if (parts.length === 0) {
      return "Showing distribution of questions passed at each review level.";
    }

    return `Showing distribution of questions passed at each review level.\nFiltered by • ${parts.join(" • ")}`;
  };

  return (
    <div>
      {/*summary of review level */}
      <Card className="mt-10">
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="relative">
              <CardTitle className="mb-2">Review Stage Distribution</CardTitle>
              <CardDescription className="whitespace-pre-line">
                {getDescription()}
              </CardDescription>
            </div>
          </div>
          <div className="flex justify-between items-center mb-4 ml-5 mr-5">
            <Dialog open={openFilter} onOpenChange={setOpenFilter}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2 absolute right-20 ">
                  <Filter className="h-4 w-4 text-primary" />
                  Preferences
                </Button>
              </DialogTrigger>

              <DialogContent className="sm:max-w-2xl max-w-[95vw] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Filter Options</DialogTitle>
                </DialogHeader>

                {/* Filter Body */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                  <FilterSelect
                    label="States / Regions"
                    value={draftFilters.state}
                    options={STATES}
                    onChange={(val) => updateDraft("state", val)}
                    Icon={MapPin}
                  />

                  <FilterSelect
                    label="Crops"
                    value={draftFilters.crop}
                    options={CROPS}
                    onChange={(val) => updateDraft("crop", val)}
                    Icon={Leaf}
                  />

                  <FilterSelect
                    label="Domains"
                    value={draftFilters.domain}
                    options={DOMAINS}
                    onChange={(val) => updateDraft("domain", val)}
                    Icon={Globe}
                  />

                  <FilterSelect
                    label="Statuss"
                    value={draftFilters.status}
                    options={STATUS}
                    onChange={(val) => updateDraft("status", val)}
                    Icon={FileText}
                  />
                  <div className="space-y-2 min-w-0">
                    <Label className="flex items-center gap-2 text-sm font-semibold">
                      <UserIcon className="h-4 w-4 text-primary" />
                      User
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-primary transition-colors"
                          >
                            <Info className="h-4 w-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs text-sm">
                          <p>
                            This option allows filtering questions that have
                            been submitted at least once by the selected user.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </Label>

                    <Select
                      value={draftFilters.userId}
                      onValueChange={handleSelectedExpert}
                      disabled={isLoading}
                    >
                      <SelectTrigger className="bg-background w-full">
                        <SelectValue />
                      </SelectTrigger>

                      <SelectContent>
                        {isLoading ? (
                          <div className="flex items-center justify-center p-3">
                            <Loader2 className="h-4 w-4 animate-spin text-primary" />
                            <span className="ml-2 text-sm text-muted-foreground">
                              Loading users...
                            </span>
                          </div>
                        ) : (
                          <>
                            <SelectItem value="all">All Users</SelectItem>
                            {users?.map((u) => (
                              <SelectItem key={u._id} value={u._id}>
                                {u.userName}
                              </SelectItem>
                            ))}
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 min-w-0">
                    <DateRangeFilter
                      advanceFilter={draftFilters.dateRange}
                      handleDialogChange={handleDraftDateChange}
                    />
                  </div>
                </div>

                <DialogFooter className="gap-2 mt-4">
                  <Button variant="outline" onClick={handleClearFilters}>
                    Clear
                  </Button>

                  <Button onClick={handleApplyFilters}>Apply Filters</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>

        <div ref={ref} className="rounded-lg border bg-card overflow-x-auto min-h-[55vh] ml-5 mr-5">
          {/* <Table className="min-w-[800px]">
            <TableHeader className="bg-card sticky top-0 z-10">
              <TableRow>
                <TableHead className="text-center w-12">Sl.No</TableHead>
                <TableHead className="w-[35%] text-center w-52">
                  Review Level
                </TableHead>

                <TableHead className="text-center w-52">
                  Completed Tasks
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {isLoadingReviewLevel ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-10">
                    <Loader2 className="animate-spin w-6 h-6 mx-auto text-primary" />
                  </TableCell>
                </TableRow>
              ) : !reviewLevel || reviewLevel.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={10}
                    rowSpan={10}
                    className="text-center py-10 text-muted-foreground"
                  >
                    No Details found
                  </TableCell>
                </TableRow>
              ) : (
                reviewLevel.map((level: any, ind: number) => (
                  <TableRow key={ind} className="text-center">
                    <TableCell className="align-middle w-36">
                      {ind + 1}
                    </TableCell>
                    <TableCell className="align-middle w-36">
                      {level.Review_level}
                    </TableCell>

                    <TableCell className="align-middle w-36">
                      {level.count}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table> */}
          <ResponsiveContainer width="100%" height={350}>
            {isLoadingReviewLevel ? (
              <Loader2 className="animate-spin w-6 h-6 mx-auto text-primary" />
            ) : !reviewLevel || reviewLevel.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                No Details found
              </div>
            ) : (
              <BarChart
                key={key}
                data={chartData}
                margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                />
                <XAxis
                  dataKey="reviewLevel"
                  stroke="var(--color-muted-foreground)"
                />
                <YAxis stroke="var(--color-muted-foreground)" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius)",
                    color: "var(--color-foreground)",
                  }}
                />
                <Legend />
                <Bar
                  dataKey="completedTasks"
                  fill="var(--color-chart-1)"
                  name="Completed Tasks"
                />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
};
