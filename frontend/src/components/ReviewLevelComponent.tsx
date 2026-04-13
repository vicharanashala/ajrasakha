import { useState } from "react";
import { useFilterStore } from "@/stores/filter-store";
import { useGetReviewLevel } from "@/hooks/api/user/useGetReviewLevel";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import { Loader2, Filter } from "lucide-react";
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
import { CommonFilterFields } from "./CommonFilterFields";
import type { CommonFilterValues } from "./CommonFilterFields";
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
type Filters = {
  state: string;
  crop: string;
  normalised_crop: string;
  domain: string;
  status: string;
  dateRange: DateRange;
  userId: string;
};

const defaultFilters: Filters = {
  state: "all",
  crop: "all",
  normalised_crop: "all",
  domain: "all",
  status: "all",
  dateRange: {},
  userId: "all",
};
export const ReviewLevelComponent = () => {
  const { data: userNameReponse } = useGetAllUsers();
  const {key,ref} = useRestartOnView()
  const { reviewLevel: appliedFilter, setReviewLevelFilter, resetReviewLevelFilter } = useFilterStore();
  const [openFilter, setOpenFilter] = useState(false);
  const [draftFilters, setDraftFilters] = useState<Filters>(defaultFilters);

  let role = "moderator";
  const { data: reviewLevel, isLoading: isLoadingReviewLevel } =
    useGetReviewLevel({
      role,
      dateRange: appliedFilter.dateRange,
      state: appliedFilter.state,
      crop: appliedFilter.crop,
      normalised_crop: appliedFilter.normalised_crop,
      domain: appliedFilter.domain,
      status: appliedFilter.status,
      userId: appliedFilter.userId,
    });

  const draftFilterValues: CommonFilterValues = {
    state: draftFilters.state,
    normalised_crop: draftFilters.normalised_crop,
    domain: draftFilters.domain,
    status: draftFilters.status,
    user: draftFilters.userId,
    startTime: draftFilters.dateRange.startTime ?? null,
    endTime: draftFilters.dateRange.endTime ?? null,
  };

  const handleCommonFilterChange = (key: string, value: any) => {
    if (key === "user") {
      setDraftFilters((prev) => ({ ...prev, userId: value }));
    } else if (key === "startTime" || key === "endTime") {
      setDraftFilters((prev) => ({
        ...prev,
        dateRange: { ...prev.dateRange, [key]: value },
      }));
    } else {
      setDraftFilters((prev) => ({ ...prev, [key]: value }));
    }
  };

  const handleApplyFilters = () => {
    setReviewLevelFilter(draftFilters);
    setOpenFilter(false);
  };
  const handleClearFilters = () => {
    setDraftFilters(defaultFilters);
    resetReviewLevelFilter();
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

    if (appliedFilter.state !== "all") parts.push(`State: ${appliedFilter.state}`);
    if (appliedFilter.normalised_crop !== "all") parts.push(`Normalized Crop: ${appliedFilter.normalised_crop === '__NOT_SET__' ? 'Not Set' : appliedFilter.normalised_crop}`);
    if (appliedFilter.domain !== "all") parts.push(`Domain: ${appliedFilter.domain}`);
    if (appliedFilter.status !== "all") parts.push(`Status: ${appliedFilter.status}`);

    if (appliedFilter.userId !== "all") {
      const user = users.find((u) => u._id === appliedFilter.userId);
      if (user) parts.push(`User: ${user.userName}`);
    }

    if (appliedFilter.dateRange?.startTime || appliedFilter.dateRange?.endTime) {
      const start = appliedFilter.dateRange.startTime
        ? appliedFilter.dateRange.startTime.toLocaleDateString()
        : "Any";
      const end = appliedFilter.dateRange.endTime
        ? appliedFilter.dateRange.endTime.toLocaleDateString()
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

                <CommonFilterFields
                  values={draftFilterValues}
                  onChange={handleCommonFilterChange}
                  visibleFields={["state", "cropType", "domain", "status", "user", "dateRange"]}
                  cropTypeMode="single"
                />

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
