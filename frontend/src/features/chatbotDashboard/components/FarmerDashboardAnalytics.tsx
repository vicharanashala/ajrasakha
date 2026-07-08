import type { ReactNode } from "react";
import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import SarvamTranslateDropdown from "@/components/SarvamTranslateDropdown";
import { env } from "@/config/env";
import { apiFetch } from "@/hooks/api/api-fetch";
import { BarChart3, Info, MessageSquareText } from "lucide-react";
import type { DateRange } from "react-day-picker";
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
  const [trendGranularity, setTrendGranularity] =
    useState<TrendGranularity>("daily");
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(
    null,
  );
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
        <div className="mb-6 flex flex-wrap gap-2 sm:justify-end">
          {(["daily", "weekly", "monthly"] as TrendGranularity[]).map(
            (granularity) => (
              <Button
                key={granularity}
                className="h-10 rounded-md px-5"
                variant={
                  trendGranularity === granularity ? "default" : "outline"
                }
                onClick={() => setTrendGranularity(granularity)}
              >
                {toTitleCase(granularity)}
              </Button>
            ),
          )}
        </div>
        <div className="grid gap-8 lg:grid-cols-2">
          <TrendBars
            title="Question activity"
            data={selectedTrend?.questions ?? []}
            tone="primary"
          />
          <TrendBars
            title="Messaging trend"
            data={selectedTrend?.messages ?? []}
            tone="success"
          />
        </div>
      </DashboardSection>

      {afterEngagementTrends}

      <DashboardSection
        icon={<MessageSquareText className="h-5 w-5" />}
        title="Recent Questions"
      >
        <div className="overflow-x-auto">
          <Table className="min-w-[1180px]">
            <TableHeader>
              <TableRow className="border-border/70 hover:bg-transparent">
                <TableHead className="w-[30%] px-6 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Question
                </TableHead>
                <TableHead className="w-[9%] text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Status
                </TableHead>
                <TableHead className="w-[9%] text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Crop
                </TableHead>
                <TableHead className="w-[12%] text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Category
                </TableHead>
                <TableHead className="w-[10%] text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Source
                </TableHead>
                <TableHead className="w-[12%] text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Created Date
                </TableHead>
                <TableHead className="w-[12%] text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Closed Date
                </TableHead>
                <TableHead className="w-[6%] text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Duplicate
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentQuestions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-6 text-center text-muted-foreground">
                    No recent questions found.
                  </TableCell>
                </TableRow>
              ) : (
                recentQuestions.map((question) => {
                  const expanded = expandedQuestionId === question.id;
                  return (
                    <Fragment key={question.id}>
                      <TableRow className="border-border/70">
                        <TableCell className="min-w-[300px] max-w-[420px] px-6 py-4 whitespace-normal">
                          <button
                            type="button"
                            className="line-clamp-2 text-left text-sm font-semibold leading-snug text-foreground hover:text-[#8174e8]"
                            onClick={() =>
                              setExpandedQuestionId(expanded ? null : question.id)
                            }
                          >
                            {question.question || "Not provided"}
                          </button>
                          <div className="mt-2 max-w-md">
                            <TranslatableText text={question.question} />
                          </div>
                        </TableCell>
                        <TableCell className="py-4">
                          <StatusPill status={question.status} />
                        </TableCell>
                        <TableCell className="py-4 text-sm font-semibold text-muted-foreground">
                          {question.crop || "N/A"}
                        </TableCell>
                        <TableCell className="py-4 text-sm font-semibold text-muted-foreground">
                          {question.category || "N/A"}
                        </TableCell>
                        <TableCell className="py-4 text-sm font-semibold text-muted-foreground">
                          {question.source || "N/A"}
                        </TableCell>
                        <TableCell className="py-4 text-sm font-semibold text-muted-foreground">
                          {formatDate(question.createdAt)}
                        </TableCell>
                        <TableCell className="py-4 text-sm font-semibold text-muted-foreground">
                          {formatDate(question.closedAt)}
                        </TableCell>
                        <TableCell className="py-4">
                          <DuplicatePill isDuplicate={question.isDuplicate} />
                        </TableCell>
                      </TableRow>
                      {expanded && (
                        <TableRow key={`${question.id}-conversation`}>
                          <TableCell colSpan={8} className="bg-muted/30 px-6">
                            <ConversationMessages
                              messages={question.messages ?? []}
                              emptyText="No conversation messages linked to this question."
                            />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </DashboardSection>

      {recentMessages.length > 0 && (
        <DashboardSection title="Recent Messages">
          <div className="space-y-3">
            {recentMessages.map((message) => (
              <div
                key={`${message.conversationKey}-${message.id}`}
                className="rounded-md border bg-background p-3"
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={message.isCreatedByUser ? "default" : "secondary"}
                    >
                      {message.isCreatedByUser ? "User" : "Bot"}
                    </Badge>
                    {message.threadId ? (
                      <span className="max-w-[220px] truncate text-xs text-muted-foreground">
                        {message.threadId}
                      </span>
                    ) : null}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(message.createdAt || message.conversationDate)}
                  </span>
                </div>
                <TranslatableText text={message.text} />
              </div>
            ))}
          </div>
        </DashboardSection>
      )}
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

function TrendBars({
  title,
  data,
  tone = "primary",
}: {
  title: string;
  data: { date: string; count: number }[];
  tone?: "primary" | "success";
}) {
  const max = Math.max(...data.map((item) => item.count), 0);
  const barClass = tone === "success" ? "bg-[#20a986]" : "bg-[#8174e8]";

  return (
    <div>
      <p className="mb-5 text-base font-semibold text-muted-foreground">{title}</p>
      <div className="space-y-4">
        {data.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No activity in this view.
          </p>
        ) : (
          data.slice(-12).map((item) => (
            <div
              key={item.date}
              className="grid grid-cols-[110px_1fr_42px] items-center gap-3 text-sm"
            >
              <span className="truncate text-sm font-medium text-muted-foreground">
                {item.date}
              </span>
              <div className="h-3 rounded-full bg-background">
                <div
                  className={`h-3 rounded-full ${barClass}`}
                  style={{
                    width: `${max > 0 ? Math.max((item.count / max) * 100, 4) : 0}%`,
                  }}
                />
              </div>
              <span className="text-right text-sm font-semibold">{item.count}</span>
            </div>
          ))
        )}
      </div>
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

function DuplicatePill({ isDuplicate }: { isDuplicate?: boolean }) {
  const classes = isDuplicate
    ? "border-[#ffb8b8] bg-[#ffe8e8] text-[#7d1f1f]"
    : "border-border bg-background text-muted-foreground";

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${classes}`}
    >
      {isDuplicate ? "Yes" : "No"}
    </span>
  );
}

function ConversationMessages({
  messages,
  emptyText,
}: {
  messages: DashboardMessageEntry[];
  emptyText: string;
}) {
  if (messages.length === 0) {
    return <p className="py-3 text-sm text-muted-foreground">{emptyText}</p>;
  }

  return (
    <div className="space-y-3 py-2">
      {messages.map((message) => (
        <div key={message.id} className="rounded-md border bg-background p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <Badge variant={message.isCreatedByUser ? "default" : "secondary"}>
              {message.isCreatedByUser ? "User" : "Bot"}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {formatDate(message.createdAt)}
            </span>
          </div>
          <TranslatableText text={getMessageDisplayText(message)} />
        </div>
      ))}
    </div>
  );
}

function TranslatableText({ text }: { text?: string }) {
  const [translatedText, setTranslatedText] = useState("");
  const displayText = translatedText || text || "Not provided";

  return (
    <div className="space-y-2">
      <p className="whitespace-pre-wrap text-sm text-foreground/90">
        {displayText}
      </p>
      {text ? (
        <SarvamTranslateDropdown
          query={text}
          onTranslate={(result) => setTranslatedText(result)}
        />
      ) : null}
    </div>
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

function toTitleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
