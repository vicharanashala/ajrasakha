import { useState, useMemo, useEffect } from "react";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { MessageSquarePlus, BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./atoms/card";
import {
  PieChart,
  Pie,
  Tooltip as ChartTooltip,
  Cell,
  ResponsiveContainer,
} from "recharts";
import {
  CROPS,
  STATES,
  AdvanceFilterDialog,
  type AdvanceFilterValues,
  type QuestionDateRangeFilter,
  type QuestionFilterStatus,
  type QuestionPriorityFilter,
  type QuestionSourceFilter,
} from "./advanced-question-filter";
import { useGetAllDetailedQuestions } from "@/hooks/api/question/useGetAllDetailedQuestions";
import { useGetFinalizedAnswers } from "@/hooks/api/answer/useGetFinalizedAnswers";
import { useGetAllUsers } from "@/hooks/api/user/useGetAllUsers";

import type { IMyPreference } from "@/types";
import { ScrollArea } from "./atoms/scroll-area";
import PreferenceFilter from "./PreferenceFilter";
import HeatMap from "./HeatMap";
import { useGetWorkLoad } from "@/hooks/api/performance/useGetWorkLoad";
export const PerformanceMatrics = () => {
  type BaseStatusItem = {
    status: string;
    details: {
      state?: string;
      crop?: string;
      domain?: string;
    };
  };
  const [advanceFilter, setAdvanceFilterValues] = useState<AdvanceFilterValues>(
    {
      status: "all",
      source: "all",
      state: "all",
      answersCount: [0, 100],
      dateRange: "all",
      crop: "all",
      priority: "all",
      domain: "all",
      user: "all",
    }
  );
  const [selectedUser, setSelectedUser] = useState("all");
  const [date, setDate] = useState("all");
  const [status, setStatus] = useState("all");
  const filter = useMemo(() => advanceFilter, [advanceFilter]);

  const currentPage = 1;
  const LIMIT = 2000;
  const search = "";
  const { data: questionData, isLoading: isLoadingQuestions } =
    useGetAllDetailedQuestions(currentPage, LIMIT, filter, search);
  const { data: finalizedAnswers, refetch } = useGetFinalizedAnswers(
    selectedUser,
    date,
    status
  );
  const { data: WorkLoad } = useGetWorkLoad();

  const finalized = finalizedAnswers?.finalizedSubmissions || [];
  const currentUserAnswers = WorkLoad?.currentUserAnswers || [];
  const totalQuestionsCount = WorkLoad?.totalQuestionsCount || 0;
  const approvedCount = currentUserAnswers.length;
  const heatMapResults = finalizedAnswers?.heatMapResults || [];
  const approvalPercentage =
    totalQuestionsCount > 0
      ? ((approvedCount / totalQuestionsCount) * 100).toFixed(2)
      : 0;
  useEffect(() => {
    //refetch();
  }, [selectedUser, date, status]);

  const { data: userNameReponse, isLoading: isLoadingUsers } = useGetAllUsers();
  const { data: user, isLoading } = useGetCurrentUser();
  /*const safeCurrentUser = user  
  ? {
      _id: '',
      userName: user.firstName + user.lastName, 
      role: user.role,
      email: user.email,
      preference: user.preference
    }
  : null;*/

  const otherModerators = (userNameReponse?.users || [])
    .filter((u) => u.role === "moderator") // ✅ keep only moderators
    .sort((a, b) => a.userName.localeCompare(b.userName));
  const users = [
    // ...(safeCurrentUser ? [safeCurrentUser] : []),
    ...otherModerators,
  ];

  const total = questionData?.totalCount || 0;
  const questions = questionData?.questions;

  function groupWithCount<T extends { status?: any; details?: any }>(
    data: T[],
    field: "status" | "state" | "crop"
  ) {
    const grouped = data.reduce<Record<string, number>>((acc, item) => {
      let value;

      if (field === "status") {
        value = item.status;
      } else {
        value = item.details?.[field];
      }

      // ✅ Ensure value is always a safe string
      if (value === undefined || value === null) {
        value = "unknown";
      } else if (typeof value !== "string") {
        value = String(value); // Convert numbers/objects safely
      }

      const key = value.toLowerCase();
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    // ✅ Convert to chart-friendly format
    return Object.entries(grouped).map(([name, value]) => ({
      name: `${name} (${value})`,
      value,
    }));
  }

  function PieBox({ title, data }: { title: string; data: any[] }) {
    const getColor = (name: string) => {
      if (!name) return "#8884d8";

      const label = name.toLowerCase();

      if (label.includes("approved")) return "#52C41A"; // green
      if (label.includes("rejected")) return "#FF4D4F"; // red
      if (label.includes("review")) return "#FAAD14"; // yellow

      // For other pie charts — auto-generate consistent colors
      const palette = [
        "#8884d8",
        "#82ca9d",
        "#ffc658",
        "#8dd1e1",
        "#a4de6c",
        "#d0ed57",
        "#ffa07a",
        "#ff8042",
        "#a28cff",
        "#4cc9f0",
        "#f72585",
        "#b5179e",
        "#7209b7",
        "#3a0ca3",
        "#4361ee",
        "#4895ef",
        "#4cc9f0",
        "#90be6d",
        "#43aa8b",
        "#577590",
        "#f9c74f",
        "#f9844a",
        "#e63946",
      ];
      return palette[Math.abs(label.length) % palette.length];
    };
    return (
      <Card className="shadow-sm min-w-0">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">{title}</CardTitle>
        </CardHeader>

        <CardContent className="flex flex-col gap-4 min-h-[260px]">
          {/* Chart */}
          <div className="w-full min-w-0 h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={100}
                  dataKey="value"
                  label={{ position: "inside", fill: "#fff" }}
                  labelLine={false}
                >
                  {data.map((entry, i) => (
                    <Cell key={i} fill={getColor(entry.name)} />
                  ))}
                </Pie>
                <ChartTooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <ScrollArea className="max-h-[150px] w-full rounded-md px-3">
            <div className="space-y-1 pr-2">
              {data.map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span
                    className="w-3 h-3 rounded-sm"
                    style={{ background: getColor(item.name) }}
                  />
                  <span className="truncate">{item.name}</span>
                  <span className="ml-auto font-medium">{item.value}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    );
  }

  const statusData = groupWithCount(questions ?? [], "status");
  const cropData = groupWithCount(questions ?? [], "crop");
  const stateData = groupWithCount(questions ?? [], "state");
  const AnswerData = groupWithCount(finalized ?? [], "status");
  const answerCropData = groupWithCount(finalized ?? [], "crop");
  const answerStateData = groupWithCount(finalized ?? [], "state");
  const COLORS = [
    "#8884d8",
    "#82ca9d",
    "#ffc658",
    "#ff8042",
    "#a4de6c",
    "#d0ed57",
    "#8dd1e1",
  ];

  const quickActions = [
    {
      title: "Current Workload",
      value: `${WorkLoad?.totalInreviewQuestionsCount}` || 0,
      description: "Pending assignments",
      icon: <MessageSquarePlus />,
      //path: `${getBasePath()}/review-queue`,
    },
    {
      title: "Approval Rate",
      value: `${approvalPercentage}%`,
      description: `Of ${totalQuestionsCount} reviews`,
      icon: <BarChart3 />,
      // path: `${getBasePath()}/performance?data=${encodeURIComponent(JSON.stringify(performance))}`,
    },
  ];
  const handleDialogChange = (key: string, value: any) => {
    setAdvanceFilterValues((prev) => ({ ...prev, [key]: value }));
  };
  const onChange = (next: {
    status?: QuestionFilterStatus;
    source?: QuestionSourceFilter;
    priority?: QuestionPriorityFilter;
    state?: string;
    crop?: string;
    domain?: string;
    user?: string;
    answersCount?: [number, number];
    dateRange?: QuestionDateRangeFilter;
  }) => {
    setAdvanceFilterValues((prev) => ({
      ...prev,
      ...next,
    }));
  };

  const handleApplyFilters = (myPreference?: IMyPreference) => {
    onChange({
      status: advanceFilter.status,
      source: advanceFilter.source,
      state: myPreference?.state || advanceFilter.state,
      crop: myPreference?.crop || advanceFilter.crop,
      answersCount: advanceFilter.answersCount,
      dateRange: advanceFilter.dateRange,
      priority: advanceFilter.priority,
      domain: myPreference?.domain || advanceFilter.domain,
      user: advanceFilter.user,
    });
  };
  const activeFiltersCount = Object.values(advanceFilter).filter(
    (v) => v !== "all" && !(Array.isArray(v) && v[0] === 0 && v[1] === 100)
  ).length;
  const onReset = () => {
    setAdvanceFilterValues({
      status: "all",
      source: "all",
      state: "all",
      answersCount: [0, 100],
      dateRange: "all",
      crop: "all",
      priority: "all",
      user: "all",
      domain: "all",
    });
  };
  const handleApplyAnswerFilters = () => {
    refetch();
  };

  return (
    <div >
      {isLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm mx-12">
          <div className="w-full max-w-sm p-6 bg-card rounded-lg shadow-lg flex flex-col items-center justify-center gap-4">
            <h3 className="text-lg font-semibold text-center">
              Fetching user details...
            </h3>

            <div className="flex items-center justify-center">
              <svg
                className="animate-spin h-10 w-10 text-green-500"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                />
              </svg>
            </div>

            <p className="text-sm text-muted-foreground text-center">
              Please wait while we fetch your profile, preferences, and
              authorizations.
            </p>
          </div>
        </div>
      )}

      <div
        className="grid gap-6 place-content-center  p-4"
        style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {quickActions?.map((action, ind) => (
          <Card
            key={ind}
            className="
        w-full 
        max-w-full 
        box-border 
        shadow-sm 
        hover:shadow-md 
        transition-shadow 
        overflow-hidden 
        flex flex-col 
        min-w-0
        w-[85vw]
      "
          >
            {/* HEADER */}
            <CardHeader className="flex justify-between items-center text-sm text-muted-foreground px-4 sm:px-5 md:px-6">
              <h1>{action.title}</h1>
              <div>{action.icon}</div>
            </CardHeader>

            {/* CONTENT */}
            <CardContent className="flex flex-col gap-2 text-sm px-4 sm:px-5 md:px-6 min-w-0">
              <div className="font-semibold text-start break-words leading-snug">
                {action.value}
              </div>
              <div>{action.description}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      {/**to get finalized Answers */}
      <div className="space-y-6 p-6  ">
        <div className="flex flex-row">
          <Card className="border border-muted shadow-sm w-full lg:w-auto flex-1">
            <CardHeader>
              <CardTitle className="text-xl font-semibold">
                Answers Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col md:justify-between md:flex-row w-max-fit">
              <p className="text-lg mb-2 ">
                Total Answers:{" "}
                <span className="font-bold text-primary">
                  {finalized.length}
                </span>
              </p>
              <div className="w-max-fit">
                <PreferenceFilter
                  selectedUser={selectedUser}
                  setSelectedUser={setSelectedUser}
                  date={date}
                  setDate={setDate}
                  status={status}
                  setStatus={setStatus}
                  users={users}
                  isLoading={isLoading}
                  handleApplyFilters={handleApplyAnswerFilters}
                />
              </div>
            </CardContent>
          </Card>

          {/* Example second card (optional) */}
          {/* <Card className="border border-muted shadow-sm w-full lg:w-auto flex-1">...</Card> */}
        </div>
        {finalized && finalized?.length >= 1 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <PieBox title="Answers by Status" data={AnswerData} />
            <PieBox title="Answers by Crop" data={answerCropData} />
            <PieBox title="Answers by Region" data={answerStateData} />
          </div>
        ) : (
          ""
        )}
      </div>
      {/**
      <div className="space-y-6 p-6  ">
        <div className="flex flex-col  lg:flex-row gap-4 w-full">
          <Card className="border border-muted shadow-sm w-full lg:w-auto flex-1">
            <CardHeader>
              <CardTitle className="text-xl font-semibold">
                Questions Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col md:justify-between md:flex-row w-max-fit">
              <p className="text-lg mb-2 ">
                Total Questions:{" "}
                <span className="font-bold text-primary">{total}</span>
              </p>
              <div className="w-max-fit">
                <AdvanceFilterDialog
                  advanceFilter={advanceFilter}
                  setAdvanceFilterValues={setAdvanceFilterValues}
                  handleDialogChange={handleDialogChange}
                  handleApplyFilters={handleApplyFilters}
                  normalizedStates={STATES}
                  crops={CROPS}
                  activeFiltersCount={activeFiltersCount}
                  onReset={onReset}
                  isForQA={false}
                />
              </div>
            </CardContent>
          </Card>

         
        </div>
        {questionData && questionData?.totalCount >= 1 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <PieBox title="Questions by Status" data={statusData} />
            <PieBox title="Questions by Crop" data={cropData} />
            <PieBox title="Questions by Region" data={stateData} />
          </div>
        ) : (
          ""
        )}
      </div>
    */}
      <div className="space-y-6 p-6  hidden md:block">
        <Card className="border border-muted shadow-sm w-full lg:w-auto flex-1">
          <CardHeader>
            <CardTitle className="text-xl font-semibold">
              Heat Map Of Reviewers
            </CardTitle>
          </CardHeader>
        </Card>
        <HeatMap />
      </div>
    </div>
  );
};
