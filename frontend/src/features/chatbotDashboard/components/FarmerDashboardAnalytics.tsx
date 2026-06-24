import type { ReactNode } from "react";
import { Fragment, useState } from "react";
import { Badge } from "@/components/atoms/badge";
import { Button } from "@/components/atoms/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/atoms/table";
import SarvamTranslateDropdown from "@/components/SarvamTranslateDropdown";
import { BarChart3, MessageSquareText } from "lucide-react";

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
}: {
  dashboard?: FarmerDashboardData;
}) {
  const [trendGranularity, setTrendGranularity] =
    useState<TrendGranularity>("daily");
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(
    null,
  );

  const questionMetrics = dashboard?.questionMetrics ?? {};
  const messagingMetrics = dashboard?.messagingMetrics ?? {};
  const selectedTrend = dashboard?.engagementTrends?.[trendGranularity];
  const recentQuestions = (dashboard?.recentQuestions ?? []).slice(0, 10);
  const recentConversations = dashboard?.recentConversations ?? [];
  const recentMessages = recentConversations.flatMap((conversation) =>
    (conversation.messages ?? []).map((message) => ({
      ...message,
      conversationKey: conversation.conversationKey,
      conversationDate: conversation.conversationDate,
      threadId: conversation.threadId,
    })),
  ).slice(0, 10);

  const questionMetricCards: [string, any][] = [
    ["Total Questions Asked", questionMetrics.totalQuestionsAsked],
    ["Questions Closed", questionMetrics.questionsClosed],
    ["Questions in Review", questionMetrics.questionsInReview],
    ["Questions Pending", questionMetrics.questionsPending],
    ["Duplicate Questions", questionMetrics.duplicateQuestions],
    ["Non-Duplicate Questions", questionMetrics.nonDuplicateQuestions],
    [
      "Questions Closed Within 2 Hours",
      questionMetrics.questionsClosedWithin2Hours,
    ],
    ["Carry-Forward Questions", questionMetrics.carryForwardQuestions],
    ["Questions Awaiting Review", questionMetrics.questionsAwaitingReview],
  ];
  const messagingMetricCards: [string, any][] = [
    ["Total Messages Sent", messagingMetrics.totalMessagesSent],
    ["User Messages", messagingMetrics.userMessages],
    ["Bot Responses Received", messagingMetrics.botResponsesReceived],
    ["Conversation Threads", messagingMetrics.conversationThreads],
    [
      "Average Messages per Conversation",
      messagingMetrics.averageMessagesPerConversation,
    ],
    ["Longest Conversation", messagingMetrics.longestConversation],
    ["Latest Conversation Date", formatDate(messagingMetrics.latestConversationDate)],
    [
      "Questions Derived from Messages",
      messagingMetrics.questionsDerivedFromMessages,
    ],
  ];

  return (
    <div className="space-y-8">
      <div className="grid gap-6 xl:grid-cols-2">
        <DashboardSection
          icon={<BarChart3 className="h-5 w-5" />}
          title="Question Metrics"
        >
          <MetricGrid metrics={questionMetricCards} />
        </DashboardSection>

        <DashboardSection
          icon={<MessageSquareText className="h-5 w-5" />}
          title="Messaging Metrics"
        >
          <MetricGrid metrics={messagingMetricCards} />
        </DashboardSection>
      </div>

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

function MetricGrid({ metrics }: { metrics: [string, any][] }) {
  const primaryMetrics = metrics.slice(0, 4);
  const secondaryMetrics = metrics.slice(4);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {primaryMetrics.map(([label, value]) => (
          <div key={label} className="rounded-md bg-background/80 p-4 shadow-sm">
            <p className="text-xs font-semibold text-muted-foreground">
              {shortMetricLabel(label)}
            </p>
            <p
              className={`mt-3 text-2xl font-semibold tracking-tight ${getMetricValueClass(label)}`}
            >
              {formatMetricValue(value)}
            </p>
          </div>
        ))}
      </div>

      {secondaryMetrics.length > 0 && (
        <div className="max-h-32 overflow-y-auto border-t pt-3 pr-1">
          <div className="space-y-2">
            {secondaryMetrics.map(([label, value]) => (
              <div
                key={label}
                className="flex items-center justify-between gap-4 text-sm"
              >
                <span className="min-w-0 truncate font-semibold text-muted-foreground">
                  {shortMetricLabel(label)}
                </span>
                <span className="shrink-0 font-semibold text-foreground">
                  {formatMetricValue(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
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
          <TranslatableText text={message.text} />
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

function shortMetricLabel(label: string) {
  const labels: Record<string, string> = {
    "Total Questions Asked": "Total asked",
    "Questions Closed": "Closed",
    "Questions in Review": "In review",
    "Questions Pending": "Pending",
    "Duplicate Questions": "Duplicates",
    "Non-Duplicate Questions": "Non-duplicates",
    "Questions Closed Within 2 Hours": "Closed within 2h",
    "Carry-Forward Questions": "Carry-forward",
    "Questions Awaiting Review": "Awaiting review",
    "Total Messages Sent": "Total messages",
    "User Messages": "User messages",
    "Bot Responses Received": "Bot responses",
    "Conversation Threads": "Conversations",
    "Average Messages per Conversation": "Avg. per conversation",
    "Longest Conversation": "Longest conversation",
    "Latest Conversation Date": "Latest conversation",
    "Questions Derived from Messages": "Questions from messages",
  };

  return labels[label] ?? label;
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
