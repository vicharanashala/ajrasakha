import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import { ListTodo, Award, ThumbsDown, Loader2, Trophy,Clock ,Target,CheckCircle} from "lucide-react";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { useGetReviewLevel } from "@/hooks/api/user/useGetReviewLevel";
import { useGetAllExperts } from "@/hooks/api/user/useGetAllUsers";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./atoms/table";
import { DashboardClock } from "./dashboard/dashboard-clock";
import { Button } from "./atoms/button";
import { DateRangeFilter } from "./DateRangeFilter";
interface ExpertDashboardProps {
  expertId?: string | null;
  goBack?: () => void;
  rankPosition?: number;
  expertDetailsList?: any;
}
interface DateRange {
  startTime?: Date;
  endTime?: Date;
}

export const ExpertDashboard = ({
  expertId,
  goBack,
  rankPosition,
  expertDetailsList,
}: ExpertDashboardProps) => {
  const shouldFetch = !expertDetailsList;
  const [expertDate, setExpertDate] = useState<DateRange>({
    startTime: undefined,
    endTime: undefined,
  });

  const { data: user, isLoading } = useGetCurrentUser({enabled: shouldFetch });
  let userId: string | undefined;

  if (expertId) {
    userId = expertId.toString();
  } else {
    userId = user?._id?.toString();
  }
  const { data: reviewLevel, isLoading: isLoadingReviewLevel } =
    useGetReviewLevel(userId,{ startTime: expertDate.startTime, endTime: expertDate.endTime });
  const levels = reviewLevel || [];
  const totalPending = levels.reduce((sum, item) => sum + item.pendingcount, 0);
  const totalCompleted = levels.reduce(
    (sum, item) => sum + item.completedcount,
    0
  );
  const totalapproved = levels.reduce((sum, item) => sum + item.approvedCount, 0);
  const totalrejected = levels.reduce((sum, item) => sum + item.rejectedCount, 0);
  const totalmodified = levels.reduce((sum, item) => sum + item.modifiedCount, 0);
  const [search, setSearch] = useState("");

  const [filter, setFilter] = useState("");

  const [selectedSort, setSelectedSort] = useState("");
  const [page, setPage] = useState(1);
  const LIMIT = 500;
  
  const { data: expertDetails, isLoading: isloadingRank } = useGetAllExperts(
    page,
    LIMIT,
    search,
    selectedSort,
    filter,
     {enabled: shouldFetch }
  );
  const [userDetails, setUserDetails] = useState<any[]>([]);
  const [totalUsers, setTotalUsers] = useState<number>(0);
  const expertArr = expertDetailsList || expertDetails;
  useEffect(() => {
    if (!expertArr || !expertArr.experts) return; // safety check
    const filteredUsers = expertArr.experts.filter((ele: any) => {
      return ele._id === userId; // optional chaining for user
    });
    setTotalUsers(expertArr.totalExperts);
    setUserDetails(filteredUsers);
  }, [expertArr, user?.email]);
  
  const handleDateChange = (key: string, value?: Date) => {
    setExpertDate((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  return (
    <main
      className={`min-h-screen bg-background ${isLoading ? "opacity-40" : ""}`}
    >
      {expertId ? (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            className="inline-flex items-center justify-center gap-1 whitespace-nowrap p-2"
            onClick={goBack}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-4 h-4"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17 8l4 4m0 0l-4 4m4-4H3"
              />
            </svg>
            <span className="leading-none">Exit</span>
          </Button>
        </div>
      ) : null}

      <div className="mx-auto p-6">
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              Expert {expertId ? "Performance": "Dashboard"}
            </h1>
            <p className="text-muted-foreground mt-1">
              Monitor expert performance of : {userDetails?.[0]?.firstName}
            </p>
          </div>

          <DashboardClock />
        </div>
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Rank</p>
                  <p className="text-3xl font-bold text-foreground">
                    {userDetails?.[0]?.rankPosition ?? 0}
                  </p>
                  <p className="text-xs text-green-600 mt-2 font-medium">
                    Leaderboard position among {totalUsers} experts
                  </p>
                </div>
                <Trophy className="w-8 h-8 text-chart-2 opacity-60 text-green-400" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Reputation Score
                  </p>
                  <p className="text-3xl font-bold text-foreground">
                    {totalPending || 0}
                  </p>
                  <p className="text-xs text-green-600 mt-2 font-medium">
                    Pending Questions To Review
                  </p>
                </div>
                <ListTodo className="w-8 h-8 text-chart-1 opacity-60 text-green-400" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Incentive Points
                  </p>
                  <p className="text-3xl font-bold text-foreground">
                    {user?.incentive || 0}
                  </p>
                  <p className="text-xs text-green-600 mt-2 font-medium">
                    Total Approved Answers
                  </p>
                </div>
                <Award className="w-8 h-8 text-chart-2 opacity-60 text-green-400" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Penality</p>
                  <p className="text-3xl font-bold text-foreground">
                    {user?.penalty || 0}
                  </p>
                  <p className="text-xs text-green-600 mt-2 font-medium">
                    Total Rejected Answers
                  </p>
                </div>
                <ThumbsDown className="w-8 h-8 text-chart-3 opacity-60 text-green-400" />
              </div>
            </CardContent>
          </Card>
          {/*Working hours card */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Working Hours</p>
                  <p className="text-3xl font-bold text-foreground">
                    { 'N/A'}
                  </p>
                  <p className="text-xs text-green-600 mt-2 font-medium">
                    Total Working Hours Per Week
                  </p>
                </div>
                <Clock className="w-8 h-8 text-chart-3 opacity-60 text-green-400" />
              </div>
            </CardContent>
          </Card>
          {/*QA Target*/}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">QA Target</p>
                  <p className="text-3xl font-bold text-foreground">
                    { 'N/A'}
                  </p>
                  <p className="text-xs text-green-600 mt-2 font-medium">
                    Target For 1 month
                  </p>
                </div>
                <Target className="w-8 h-8 text-chart-3 opacity-60 text-green-400" />
              </div>
            </CardContent>
          </Card>
          {/*QA Complete*/}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">QA Completed</p>
                  <p className="text-3xl font-bold text-foreground">
                    { 'N/A'}
                  </p>
                  <p className="text-xs text-green-600 mt-2 font-medium">
                    Completed Task
                  </p>
                </div>
                <CheckCircle className="w-8 h-8 text-chart-3 opacity-60 text-green-400" />
              </div>
            </CardContent>
          </Card>

        </div>
        {/*summary of review level */}
        <Card className="mt-10">
          <div className="flex justify-between  ml-5 mr-5">
          <h1 className="text-1xl font-bold text-foreground mt-0 mb-3">
            Summary of Pending Tasks by Review Level
          </h1>
          <DateRangeFilter
                    advanceFilter={expertDate}
                    handleDialogChange={handleDateChange}
                  />
                  </div>

          <div className="rounded-lg border bg-card overflow-x-auto min-h-[55vh] ml-5 mr-5">
            <Table className="min-w-[800px]">
              <TableHeader className="bg-card sticky top-0 z-10">
                <TableRow>
                  <TableHead className="text-center w-12">Sl.No</TableHead>
                  <TableHead className="w-[35%] text-center w-52">
                    Review Level
                  </TableHead>
                  <TableHead className="text-center w-52">
                     Pending Tasks({totalPending})
                  </TableHead>
                  <TableHead className="text-center w-52">
                    Approved Answers({totalapproved})
                  </TableHead>
                  <TableHead className="text-center w-52">
                    Rejected Answers({totalrejected})
                  </TableHead>
                  <TableHead className="text-center w-52">
                    Modified Answers({totalmodified})
                  </TableHead>
                  <TableHead className="text-center w-52">
                     Completed Tasks({totalCompleted})
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
                        {level.pendingcount}
                      </TableCell>
                      <TableCell className="align-middle w-36">
                        {ind===0?'N/A':level.approvedCount}
                      </TableCell>
                      <TableCell className="align-middle w-36">
                        {ind===0?'N/A':level.rejectedCount}
                      </TableCell>
                      <TableCell className="align-middle w-36">
                        {ind===0?'N/A':level.modifiedCount}
                      </TableCell>
                      <TableCell className="align-middle w-36">
                        {level.completedcount}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </main>
  );
};
