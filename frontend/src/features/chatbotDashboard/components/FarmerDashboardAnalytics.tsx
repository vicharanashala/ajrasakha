import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Badge } from "@/components/atoms/badge";
import { Button } from "@/components/atoms/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/atoms/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/atoms/table";
import { env } from "@/config/env";
import { apiFetch } from "@/hooks/api/api-fetch";
import {
  AreaChart as AreaChartIcon,
  BarChart2,
  BarChart3,
  Info,
  MessageSquareText,
} from "lucide-react";
import type { DateRange } from "react-day-picker";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ClosedInLastTwoHoursCard } from "../ClosedInLastTwoHoursCard";
import { ClosedQuestionsCard } from "../ClosedQuestionsCard";
import { CustomerNotificationsCard } from "../CustomerNotificationsCard";
import { useClosedAndNotifedData } from "../hooks/useActiveUsersAnalytics";
import { getISOStringsForDateRange } from "../utils/dateUtils";
import {
  QuestionActivityModal,
  type QuestionActivityItem,
  type QuestionActivityViewType,
} from "./QuestionActivityModal";

type TrendGranularity = "daily" | "weekly" | "monthly";
type EngagementTrendType = "questions" | "messages";
type EngagementChartType = "area" | "bar";

type DashboardMessageEntry = {
  id: string;
  text: string;
  isCreatedByUser: boolean;
  createdAt?: string;
  messageId?: string;
};

type DashboardQuestion = {
  id: string;
  question: string;
  status?: string;
  crop?: string;
  category?: string;
  source?: string;
  createdAt?: string;
  closedAt?: string | null;
  isDuplicate?: boolean;
  conversationKey?: string;
  messages?: DashboardMessageEntry[];
};

type DashboardConversation = {
  conversationKey: string;
  threadId?: string;
  conversationDate?: string;
  messageCount: number;
  questionGenerated: boolean;
  latestMessage?: string;
  messages?: DashboardMessageEntry[];
};

type MessagingMetricKey =
  | "userMessages"
  | "conversations"
  | "averageMessagesPerConversation"
  | "longestConversation"
  | "lastMessageSentAt"
  | "questionsFromMessages";

type MessagingMetricCard = {
  key: MessagingMetricKey;
  label: string;
  value: any;
  tooltip: string;
  unit?: string;
  viewType: QuestionActivityViewType;
  summaryLabel?: string;
  modalSubtitle?: string;
  emptyMessage?: string;
};

type MetricDetailsResponse = {
  total: number;
  totalPages: number;
  currentPage: number;
  limit: number;
  items: QuestionActivityItem[];
};

const ACTIVITY_PAGE_SIZE = 10;

export type FarmerDashboardData = {
  questionMetrics?: Record<string, any>;
  messagingMetrics?: Record<string, any>;
  engagementTrends?: Record<TrendGranularity, {
    questions?: { date: string; count: number }[];
    messages?: { date: string; count: number }[];
  }>;
  recentQuestions?: DashboardQuestion[];
  recentConversations?: DashboardConversation[];
};

export function FarmerDashboardAnalytics({
  dashboard,
  userId,
  afterEngagementTrends,
}: {
  dashboard?: FarmerDashboardData;
  userId?: string;
  afterEngagementTrends?: ReactNode;
}) {
  const navigate = useNavigate();
  const [trendGranularity, setTrendGranularity] =
    useState<TrendGranularity>("daily");
  const [engagementTrendType, setEngagementTrendType] =
    useState<EngagementTrendType>("questions");
  const [engagementChartType, setEngagementChartType] =
    useState<EngagementChartType>("area");
  const [selectedMessagingMetric, setSelectedMessagingMetric] =
    useState<MessagingMetricCard | null>(null);
  const [activityPage, setActivityPage] = useState(1);

  const messagingMetrics = dashboard?.messagingMetrics ?? {};
  const totalMessages = Number(messagingMetrics.totalMessagesSent ?? 0);
  const totalConversations = Number(messagingMetrics.conversationThreads ?? 0);
  const selectedTrend = dashboard?.engagementTrends?.[trendGranularity];
  const recentQuestions = (dashboard?.recentQuestions ?? []).slice(0, 10);
  const recentConversations = dashboard?.recentConversations ?? [];
  const allRecentMessages = recentConversations.flatMap((conversation) =>
    (conversation.messages ?? []).map((message) => ({
      ...message,
      conversationKey: conversation.conversationKey,
      conversationDate: conversation.conversationDate,
      threadId: conversation.threadId,
    })),
  );
  const recentMessages = allRecentMessages.slice(0, 10);
  const lastUserMessageAt = messagingMetrics.latestUserMessageDate;

  const messagingMetricCards: MessagingMetricCard[] = [
    {
      key: "userMessages",
      label: "User messages",
      value: messagingMetrics.userMessages,
      tooltip: "Messages sent by this farmer to the chatbot.",
      viewType: "messages",
      summaryLabel: "User messages",
      modalSubtitle: "Messages sent by this farmer to the chatbot.",
      emptyMessage: "No user messages found for this farmer.",
    },
    {
      key: "conversations",
      label: "Conversations",
      value: messagingMetrics.conversationThreads,
      tooltip: "Distinct conversation threads found for this farmer.",
      viewType: "messages",
      summaryLabel: "Conversations",
      modalSubtitle: "Conversation threads for this farmer.",
      emptyMessage: "No conversations found for this farmer.",
    },
    {
      key: "averageMessagesPerConversation",
      label: "Avg. messages / conversation",
      value: messagingMetrics.averageMessagesPerConversation,
      unit: "messages/conversation",
      tooltip: "Total messages divided by conversation threads.",
      viewType: "messages",
      summaryLabel: "Avg. messages / conversation",
      modalSubtitle: `${formatMetricValue(totalMessages)} messages / ${formatMetricValue(totalConversations)} conversations = ${formatMetricValue(messagingMetrics.averageMessagesPerConversation)} messages per conversation.`,
      emptyMessage: "No conversations found to calculate the average.",
    },
    {
      key: "longestConversation",
      label: "Longest conversation",
      value: messagingMetrics.longestConversation,
      unit: "messages",
      tooltip: "Highest message count recorded in a single conversation.",
      viewType: "messages",
      summaryLabel: "Longest conversation",
      modalSubtitle: "Messages from the longest available conversation.",
      emptyMessage: "No longest conversation data found.",
    },
    {
      key: "lastMessageSentAt",
      label: "Last message sent time",
      value: formatDate(
        lastUserMessageAt || messagingMetrics.latestConversationDate,
      ),
      tooltip: "Most recent time this farmer sent a message.",
      viewType: "messages",
      summaryLabel: "Last message sent time",
      modalSubtitle: "Most recent message sent by this farmer.",
      emptyMessage: "No last user message found.",
    },
    {
      key: "questionsFromMessages",
      label: "Questions from messages",
      value: messagingMetrics.questionsDerivedFromMessages,
      tooltip: "Questions created from this farmer's chat messages.",
      viewType: "questions",
      summaryLabel: "Questions from messages",
      modalSubtitle: "Questions created from this farmer's chat messages.",
      emptyMessage: "No questions from messages found for this farmer.",
    },
  ];
  const metricDetailsQuery = useQuery({
    queryKey: [
      "user-message-metric-details",
      userId,
      selectedMessagingMetric?.key,
      activityPage,
      ACTIVITY_PAGE_SIZE,
    ],
    enabled: Boolean(userId && selectedMessagingMetric?.key),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("userId", String(userId));
      params.set("metric", String(selectedMessagingMetric?.key));
      params.set("page", String(activityPage));
      params.set("limit", String(ACTIVITY_PAGE_SIZE));

      return apiFetch<MetricDetailsResponse>(
        `${env.apiBaseUrl()}/analytics/user-message-metric-details?${params.toString()}`,
      );
    },
  });
  const metricDetails = metricDetailsQuery.data;
  const activityItems = metricDetails?.items ?? [];
  const activityTotalCount = selectedMessagingMetric?.unit
    ? `${formatMetricValue(selectedMessagingMetric.value)} ${selectedMessagingMetric.unit}`
    : formatMetricValue(selectedMessagingMetric?.value ?? 0);
  const activityTotalPages = metricDetails?.totalPages ?? 1;

  return (
    <div className="space-y-8">
      <UserQuestionMetricsCards userId={userId} />

      <div className="grid gap-6">
        <DashboardSection
          icon={<MessageSquareText className="h-5 w-5" />}
          title="Messaging Metrics"
        >
          <MetricGrid
            metrics={messagingMetricCards}
            onMetricClick={(metric) => {
              setActivityPage(1);
              setSelectedMessagingMetric(metric);
            }}
          />
        </DashboardSection>
      </div>

      <QuestionActivityModal
        open={Boolean(selectedMessagingMetric)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedMessagingMetric(null);
            setActivityPage(1);
          }
        }}
        title={selectedMessagingMetric?.label ?? "Messaging activity"}
        subtitle={selectedMessagingMetric?.modalSubtitle}
        mode="activity"
        viewType={selectedMessagingMetric?.viewType ?? "messages"}
        activityItems={activityItems}
        isLoading={metricDetailsQuery.isFetching}
        totalCount={activityTotalCount}
        totalLabel={selectedMessagingMetric?.summaryLabel}
        totalPages={activityTotalPages}
        currentPage={activityPage}
        onPageChange={activityTotalPages > 1 ? setActivityPage : undefined}
        emptyMessage={selectedMessagingMetric?.emptyMessage}
      />

      <DashboardSection
        icon={<BarChart3 className="h-5 w-5" />}
        title="Engagement Trends"
      >
        <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            {(["questions", "messages"] as EngagementTrendType[]).map(
              (trendType) => (
                <Button
                  key={trendType}
                  className="h-9 rounded-md px-4"
                  variant={
                    engagementTrendType === trendType ? "default" : "outline"
                  }
                  onClick={() => setEngagementTrendType(trendType)}
                >
                  {trendType === "questions"
                    ? "Question activity"
                    : "Message trending"}
                </Button>
              ),
            )}
          </div>
          <div className="flex flex-wrap gap-2 xl:justify-end">
            {(["daily", "weekly", "monthly"] as TrendGranularity[]).map(
              (granularity) => (
                <Button
                  key={granularity}
                  className="h-9 rounded-md px-4"
                  variant={
                    trendGranularity === granularity ? "default" : "outline"
                  }
                  onClick={() => setTrendGranularity(granularity)}
                >
                  {toTitleCase(granularity)}
                </Button>
              ),
            )}
            <div className="flex rounded-md border border-border/60 bg-muted/60 p-1">
              <Button
                className="h-7 gap-1.5 px-3 text-xs"
                variant={engagementChartType === "area" ? "default" : "ghost"}
                onClick={() => setEngagementChartType("area")}
              >
                <AreaChartIcon className="h-3.5 w-3.5" />
                Area
              </Button>
              <Button
                className="h-7 gap-1.5 px-3 text-xs"
                variant={engagementChartType === "bar" ? "default" : "ghost"}
                onClick={() => setEngagementChartType("bar")}
              >
                <BarChart2 className="h-3.5 w-3.5" />
                Bar
              </Button>
            </div>
          </div>
        </div>
        <EngagementTrendChart
          chartType={engagementChartType}
          granularity={trendGranularity}
          trendType={engagementTrendType}
          data={
            engagementTrendType === "questions"
              ? selectedTrend?.questions ?? []
              : selectedTrend?.messages ?? []
          }
        />
      </DashboardSection>

      {afterEngagementTrends}

      <RecentActivitySection
        questions={recentQuestions}
        messages={recentMessages}
        onQuestionClick={(questionId) =>
          navigate({
            to: "/home",
            search: {
              question: questionId,
              questionType: undefined,
            },
            replace: true,
          })
        }
      />
    </div>
  );
}

function UserQuestionMetricsCards({ userId }: { userId?: string }) {
  const [questionStatusDateRange, setQuestionStatusDateRange] =
    useState<DateRange | undefined>(undefined);
  const [closed2hDateRange, setClosed2hDateRange] =
    useState<DateRange | undefined>(undefined);
  const [customerNotificationsDateRange, setCustomerNotificationsDateRange] =
    useState<DateRange | undefined>(undefined);

  const questionStatusRange = useMemo(
    () => getISOStringsForDateRange(questionStatusDateRange),
    [questionStatusDateRange],
  );
  const closed2hRange = useMemo(
    () => getISOStringsForDateRange(closed2hDateRange),
    [closed2hDateRange],
  );
  const customerNotificationsRange = useMemo(
    () => getISOStringsForDateRange(customerNotificationsDateRange),
    [customerNotificationsDateRange],
  );

  const { data: questionStatusData, isFetching: isQuestionStatusFetching } =
    useClosedAndNotifedData(
      "annam",
      "all",
      questionStatusRange.startTime,
      questionStatusRange.endTime,
      Boolean(userId),
      userId,
    );
  const { data: closed2hData, isFetching: isClosed2hFetching } =
    useClosedAndNotifedData(
      "annam",
      "all",
      closed2hRange.startTime,
      closed2hRange.endTime,
      Boolean(userId),
      userId,
    );
  const {
    data: customerNotificationsData,
    isFetching: isCustomerNotificationsFetching,
  } = useClosedAndNotifedData(
    "annam",
    "all",
    customerNotificationsRange.startTime,
    customerNotificationsRange.endTime,
    Boolean(userId),
    userId,
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <ClosedQuestionsCard
        closedQuestions={
          questionStatusData?.closedVsTotalQuestions?.closed?.count
        }
        totalQuestions={
          questionStatusData?.closedVsTotalQuestions?.totalQuestions
        }
        dateRange={questionStatusDateRange}
        onDateRangeChange={setQuestionStatusDateRange}
        isLoading={!userId || isQuestionStatusFetching}
        isFetching={isQuestionStatusFetching}
        carryForward={questionStatusData?.carryForward}
        avgCloseTimeMinutes={
          questionStatusData?.closedVsTotalQuestions?.closed?.avgTimeMinutes
        }
        previousMonthAvgCloseTimeMinutes={
          questionStatusData?.closedVsTotalQuestions
            ?.previousMonthAvgCloseTimeMinutes
        }
        statusBreakup={questionStatusData?.closedVsTotalQuestions}
        source="annam"
        userType="all"
        passedQuestions={
          questionStatusData?.closedVsTotalQuestions?.statuses?.pass
        }
        avgPassTimeMinutes={
          questionStatusData?.closedVsTotalQuestions?.pass?.avgTimeMinutes
        }
        combinedCount={
          questionStatusData?.closedVsTotalQuestions?.combined?.count
        }
        combinedAvgTime={
          questionStatusData?.closedVsTotalQuestions?.combined?.avgTimeMinutes
        }
      />

      <ClosedInLastTwoHoursCard
        source="annam"
        userType="all"
        closedInLastTwoHours={
          closed2hData?.closedInLastTwoHours?.closedInTwoHoursCount
        }
        totalClosed={closed2hData?.closedInLastTwoHours?.totalClosedCount}
        dateRange={closed2hDateRange}
        onDateRangeChange={setClosed2hDateRange}
        isLoading={!userId || isClosed2hFetching}
        isFetching={isClosed2hFetching}
        passedInLastTwoHours={
          closed2hData?.closedInLastTwoHours?.passInTwoHoursCount
        }
        totalPassed={closed2hData?.closedInLastTwoHours?.totalPassCount}
      />

      <CustomerNotificationsCard
        notified={customerNotificationsData?.notifiedVsClosed?.notified}
        notNotified={
          customerNotificationsData?.notifiedVsClosed?.notNotified
        }
        untrackedClosedQuestions={
          customerNotificationsData?.notifiedVsClosed
            ?.untrackedClosedQuestions
        }
        dateRange={customerNotificationsDateRange}
        onDateRangeChange={setCustomerNotificationsDateRange}
        isLoading={!userId || isCustomerNotificationsFetching}
        isFetching={isCustomerNotificationsFetching}
        source="annam"
        userType="all"
      />
    </div>
  );
}

function DashboardSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="rounded-md bg-card/80 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-3 text-base font-semibold uppercase tracking-wide text-muted-foreground">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}

function RecentActivitySection({
  questions,
  messages,
  onQuestionClick,
}: {
  questions: DashboardQuestion[];
  messages: (DashboardMessageEntry & {
    conversationKey?: string;
    conversationDate?: string;
    threadId?: string;
  })[];
  onQuestionClick: (questionId: string) => void;
}) {
  return (
    <DashboardSection
      icon={<MessageSquareText className="h-5 w-5" />}
      title="Recent Activity"
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(340px,0.7fr)]">
        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Recent Questions
            </h3>
          </div>
          <div className="h-[520px] overflow-y-auto overflow-x-hidden rounded-md border">
            <Table className="w-full table-fixed" containerClassName="overflow-visible">
              <TableHeader>
                <TableRow className="sticky top-0 z-10 border-border/70 bg-background hover:bg-background">
                  <TableHead className="w-[34%] bg-background px-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Question
                  </TableHead>
                  <TableHead className="w-[12%] bg-background px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Status
                  </TableHead>
                  <TableHead className="w-[12%] bg-background px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Source
                  </TableHead>
                  <TableHead className="w-[21%] bg-background px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Created At
                  </TableHead>
                  <TableHead className="w-[21%] bg-background px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Closed At
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {questions.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-6 text-center text-sm text-muted-foreground"
                    >
                      No recent questions found.
                    </TableCell>
                  </TableRow>
                ) : (
                  questions.map((question) => (
                    <TableRow key={question.id} className="border-border/70">
                      <TableCell className="overflow-hidden whitespace-normal px-4 py-3 align-top">
                        <button
                          type="button"
                          title={question.question || "Not provided"}
                          className="block w-full overflow-hidden text-left text-sm font-medium leading-snug text-foreground hover:text-[#8174e8] hover:underline"
                          style={{
                            display: "-webkit-box",
                            WebkitBoxOrient: "vertical",
                            WebkitLineClamp: 2,
                            whiteSpace: "normal",
                            overflowWrap: "anywhere",
                          }}
                          onClick={() => onQuestionClick(question.id)}
                        >
                          {question.question || "Not provided"}
                        </button>
                      </TableCell>
                      <TableCell className="px-2 py-3 align-top">
                        <StatusPill status={question.status} />
                      </TableCell>
                      <TableCell className="truncate px-2 py-3 align-top text-sm font-medium text-muted-foreground">
                        {question.source || "N/A"}
                      </TableCell>
                      <TableCell className="px-2 py-3 align-top text-xs font-medium text-muted-foreground">
                        {formatDate(question.createdAt)}
                      </TableCell>
                      <TableCell className="px-2 py-3 align-top text-xs font-medium text-muted-foreground">
                        {formatDate(question.closedAt)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Recent Messages
            </h3>
          </div>
          <div className="h-[520px] overflow-y-auto overflow-x-hidden rounded-md border">
            {messages.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No recent messages found.
              </p>
            ) : (
              <div className="divide-y">
                {messages.map((message) => (
                  <div
                    key={`${message.conversationKey ?? "message"}-${message.id}`}
                    className="p-3"
                  >
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <Badge
                        variant={message.isCreatedByUser ? "default" : "secondary"}
                      >
                        {message.isCreatedByUser ? "User" : "Bot"}
                      </Badge>
                      <span className="text-xs font-medium text-muted-foreground">
                        {formatDate(message.createdAt || message.conversationDate)}
                      </span>
                    </div>
                    <p className="line-clamp-3 whitespace-pre-wrap text-sm text-foreground/90">
                      {getMessageDisplayText(message)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardSection>
  );
}

function MetricGrid({
  metrics,
  onMetricClick,
}: {
  metrics: MessagingMetricCard[];
  onMetricClick: (metric: MessagingMetricCard) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {metrics.map((metric) => (
        <button
          key={metric.key}
          type="button"
          className="group rounded-md border bg-background/80 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-background hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/30"
          onClick={() => onMetricClick(metric)}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex max-w-full items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <span className="truncate">{metric.label}</span>
                <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-64">
              <p>{metric.tooltip}</p>
            </TooltipContent>
          </Tooltip>
          <p
            className={`mt-3 break-words text-2xl font-semibold tracking-tight ${getMetricValueClass(metric.key)}`}
          >
            {formatMetricValue(metric.value)}
          </p>
          {metric.unit ? (
            <p className="mt-1 text-xs font-medium text-muted-foreground">
              {metric.unit}
            </p>
          ) : null}
        </button>
      ))}
    </div>
  );
}

function getMessageDisplayText(message: Pick<DashboardMessageEntry, "text" | "isCreatedByUser">) {
  const text = message.text?.trim();
  if (text) return text;
  return message.isCreatedByUser
    ? "User message content not available"
    : "Bot response content not available";
}

function EngagementTrendChart({
  chartType,
  data,
  granularity,
  trendType,
}: {
  chartType: EngagementChartType;
  data: { date: string; count: number }[];
  granularity: TrendGranularity;
  trendType: EngagementTrendType;
}) {
  const trendLabel =
    trendType === "questions" ? "Question activity" : "Message trending";
  const color = trendType === "questions" ? "#10b981" : "#8174e8";
  const gradientId =
    trendType === "questions"
      ? "engagementQuestionGradient"
      : "engagementMessageGradient";
  const chartData = data.map((item) => ({
    ...item,
    label: formatTrendDateLabel(item.date, granularity),
  }));

  const formatYAxis = (value: number) => {
    if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
    return String(value);
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const item = payload[0];

    return (
      <div className="space-y-1.5 rounded-md border border-border/70 bg-background/95 p-3 text-xs shadow-lg backdrop-blur">
        <p className="font-semibold text-foreground">
          {formatTrendDateLabel(item.payload.date, granularity, true)}
        </p>
        <div className="flex items-center justify-between gap-5">
          <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: color }}
            />
            {trendLabel}
          </span>
          <span className="font-semibold text-foreground">
            {Number(item.value ?? 0).toLocaleString()}
          </span>
        </div>
      </div>
    );
  };

  if (chartData.length === 0) {
    return (
      <div className="flex h-[320px] items-center justify-center rounded-md border border-dashed border-border/70 bg-muted/20">
        <p className="text-sm text-muted-foreground">
          No engagement trend data available.
        </p>
      </div>
    );
  }

  return (
    <div className="h-[360px] rounded-md border border-border/60 bg-background/70 px-3 pb-4 pt-6 shadow-sm">
      <ResponsiveContainer width="100%" height="100%">
        {chartType === "area" ? (
          <AreaChart
            data={chartData}
            margin={{ top: 8, right: 14, left: -12, bottom: 8 }}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.28} />
                <stop offset="95%" stopColor={color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid
              stroke="hsl(var(--border))"
              strokeDasharray="3 3"
              vertical={false}
              opacity={0.45}
            />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              minTickGap={18}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            />
            <YAxis
              tickFormatter={formatYAxis}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              width={44}
            />
            <RechartsTooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="count"
              stroke={color}
              strokeWidth={2.5}
              fill={`url(#${gradientId})`}
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        ) : (
          <BarChart
            data={chartData}
            margin={{ top: 8, right: 14, left: -12, bottom: 8 }}
          >
            <CartesianGrid
              stroke="hsl(var(--border))"
              strokeDasharray="3 3"
              vertical={false}
              opacity={0.45}
            />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              minTickGap={18}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            />
            <YAxis
              tickFormatter={formatYAxis}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              width={44}
            />
            <RechartsTooltip content={<CustomTooltip />} />
            <Bar
              dataKey="count"
              fill={color}
              maxBarSize={28}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

function StatusPill({ status }: { status?: string }) {
  const normalized = String(status || "N/A").trim().toLowerCase();
  const label = normalized === "closed"
    ? "Closed"
    : normalized === "pending"
      ? "Pending"
      : normalized === "review" || normalized === "in_review"
        ? "Review"
        : status || "N/A";
  const classes =
    normalized === "closed"
      ? "border-[#b9ef8d] bg-[#ecffd8] text-[#245c16]"
      : normalized === "pending"
        ? "border-[#ffb8b8] bg-[#ffe8e8] text-[#7d1f1f]"
        : "border-[#c7c3ff] bg-[#ecebff] text-[#3f3a8a]";

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${classes}`}
    >
      {label}
    </span>
  );
}

function formatMetricValue(value: any) {
  if (value === undefined || value === null || value === "") return "0";
  return String(value);
}

function getMetricValueClass(label: string) {
  const colorByLabel: Record<string, string> = {
    "Questions Closed": "text-[#2f7d12]",
    "Questions in Review": "text-[#d88416]",
    "Questions Pending": "text-[#c63a3a]",
  };

  return colorByLabel[label] ?? "text-foreground";
}

function formatDate(value?: string | null) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString();
}

function formatTrendDateLabel(
  value: string,
  granularity: TrendGranularity,
  includeYear = false,
) {
  if (!value) return "N/A";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  if (granularity === "monthly") {
    return date.toLocaleDateString("en-IN", {
      month: "short",
      year: includeYear ? "numeric" : "2-digit",
    });
  }

  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    ...(includeYear ? { year: "numeric" as const } : {}),
  });
}

function toTitleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
