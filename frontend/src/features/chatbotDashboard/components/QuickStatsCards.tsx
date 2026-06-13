// ─── Quick Stats Cards Component ─────────────────────────────────────────────
import { motion } from "framer-motion";
import type { DateRange } from "react-day-picker";
import { WhatsAppAnalyticsCard } from "../WhatsAppAnalyticsCard";
import { WhatsAppUniqueUsersCard } from "../WhatsAppUniqueUsersCard";
import { ClosedInLastTwoHoursCard } from "../ClosedInLastTwoHoursCard";
import { ClosedQuestionsCard } from "../ClosedQuestionsCard";
import { CustomerNotificationsCard } from "../CustomerNotificationsCard";
import { containerVariants, itemVariants } from "../utils/constants";

export interface QuickStatsData {
  unqueWhatsAppUsers?: { totalUsers: number } | null;
  closed2hData?: {
    closedInLastTwoHours?: number;
    closedVsTotalQuestions?: {
      closedQuestions?: number;
    };
  };
  questionStatusData?: {
    closedVsTotalQuestions?: {
      closedQuestions?: number;
      totalQuestions?: number;
      inReviewQuestions?: number;
      pass?: number;
      avgCloseTimeMinutes?: number;
      previousMonthAvgCloseTimeMinutes?: number;
    };
    carryForward?: number;
  };
  customerNotificationsData?: {
    notifiedVsClosed?: {
      notified?: number;
      notNotified?: number;
      untrackedClosedQuestions?: number;
    };
  };
  dailyAnalytics?: Array<{
    period: string;
    queryCount: number;
    totalQuestions: number;
  }>;
  weeklyAnalytics?: Array<{
    period: string;
    queryCount: number;
    totalQuestions: number;
  }>;
  monthlyAnalytics?: Array<{
    period: string;
    queryCount: number;
    totalQuestions: number;
  }>;
}

export interface QuickStatsCardsProps {
  source: "annam" | "whatsapp";
  userType: string;
  data: QuickStatsData;
  isLoading?: boolean;
  isFetching?: boolean;
  // Closed In Last 2 Hours
  closed2hDateRange?: DateRange | undefined;
  onClosed2hDateRangeChange?: (range: DateRange | undefined) => void;
  isClosed2hFetching?: boolean;
  // Question Status
  questionStatusDateRange?: DateRange | undefined;
  onQuestionStatusDateRangeChange?: (range: DateRange | undefined) => void;
  isQuestionStatusFetching?: boolean;
  // Customer Notifications
  customerNotificationsDateRange?: DateRange | undefined;
  onCustomerNotificationsDateRangeChange?: (range: DateRange | undefined) => void;
  isCustomerNotificationsFetching?: boolean;
  // WhatsApp unique users
  isUniqueWhatsAppUsersLoading?: boolean;
  isUniqueWhatsAppUsersFetching?: boolean;
  onWhatsAppUsersClick?: () => void;
}

export function QuickStatsCards({
  source,
  userType,
  data,
  isLoading = false,
  isFetching = false,
  closed2hDateRange,
  onClosed2hDateRangeChange,
  isClosed2hFetching = false,
  questionStatusDateRange,
  onQuestionStatusDateRangeChange,
  isQuestionStatusFetching = false,
  customerNotificationsDateRange,
  onCustomerNotificationsDateRangeChange,
  isCustomerNotificationsFetching = false,
  isUniqueWhatsAppUsersLoading = false,
  isUniqueWhatsAppUsersFetching = false,
  onWhatsAppUsersClick,
}: QuickStatsCardsProps) {
  const isWhatsApp = source === "whatsapp";

  return (
    <div
      className={`grid gap-4 mb-6 items-stretch ${
        isWhatsApp
          ? "grid-cols-1 lg:grid-cols-[0.6fr_1fr_1.4fr_1.4fr]"
          : "grid-cols-1 lg:grid-cols-[1fr_1.4fr_1.4fr]"
      }`}
    >
      {/* WhatsApp Unique Users Card - Only for WhatsApp */}
      {isWhatsApp && (
        <WhatsAppUniqueUsersCard
          totalUsers={data.unqueWhatsAppUsers}
          onClick={onWhatsAppUsersClick}
          isLoading={isUniqueWhatsAppUsersLoading || isUniqueWhatsAppUsersFetching}
        />
      )}

      {/* Closed In Last Two Hours */}
      <ClosedInLastTwoHoursCard
        source={source as "annam" | "whatsapp"}
        userType={userType}
        count={data.closed2hData?.closedInLastTwoHours}
        totalClosed={data.closed2hData?.closedVsTotalQuestions?.closedQuestions}
        dateRange={closed2hDateRange}
        onDateRangeChange={onClosed2hDateRangeChange}
        isLoading={isClosed2hFetching || isLoading}
      />

      {/* Closed Questions */}
      <ClosedQuestionsCard
        closedQuestions={data.questionStatusData?.closedVsTotalQuestions?.closedQuestions}
        totalQuestions={data.questionStatusData?.closedVsTotalQuestions?.totalQuestions}
        passedQuestions={data.questionStatusData?.closedVsTotalQuestions?.pass}
        dateRange={questionStatusDateRange}
        onDateRangeChange={onQuestionStatusDateRangeChange}
        isLoading={isQuestionStatusFetching || isLoading}
        carryForward={data.questionStatusData?.carryForward}
        avgCloseTimeMinutes={data.questionStatusData?.closedVsTotalQuestions?.avgCloseTimeMinutes}
        previousMonthAvgCloseTimeMinutes={
          data.questionStatusData?.closedVsTotalQuestions?.previousMonthAvgCloseTimeMinutes
        }
        statusBreakup={data.questionStatusData?.closedVsTotalQuestions}
        source={source as "annam" | "whatsapp"}
        userType={userType}
      />

      {/* Customer Notifications */}
      <CustomerNotificationsCard
        notified={data.customerNotificationsData?.notifiedVsClosed?.notified}
        notNotified={data.customerNotificationsData?.notifiedVsClosed?.notNotified}
        untrackedClosedQuestions={
          data.customerNotificationsData?.notifiedVsClosed?.untrackedClosedQuestions
        }
        dateRange={customerNotificationsDateRange}
        onDateRangeChange={onCustomerNotificationsDateRangeChange}
        isLoading={isCustomerNotificationsFetching || isLoading}
        source={source as "annam" | "whatsapp"}
        userType={userType}
      />
    </div>
  );
}

// ─── WhatsApp Analytics Row Component ────────────────────────────────────────

export interface WhatsAppAnalyticsRowProps {
  dailyAnalytics?: Array<{
    period: string;
    queryCount: number;
    totalQuestions: number;
  }>;
  weeklyAnalytics?: Array<{
    period: string;
    queryCount: number;
    totalQuestions: number;
  }>;
  monthlyAnalytics?: Array<{
    period: string;
    queryCount: number;
    totalQuestions: number;
  }>;
  isLoading?: boolean;
  isFetching?: boolean;
}

export function WhatsAppAnalyticsRow({
  dailyAnalytics = [],
  weeklyAnalytics = [],
  monthlyAnalytics = [],
  isLoading = false,
  isFetching = false,
}: WhatsAppAnalyticsRowProps) {
  return (
    <motion.div
      className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div variants={itemVariants}>
        <WhatsAppAnalyticsCard
          title="Daily Queries"
          analytics={dailyAnalytics}
          granularity="daily"
          isLoading={isFetching || isLoading}
        />
      </motion.div>

      <motion.div variants={itemVariants}>
        <WhatsAppAnalyticsCard
          title="Weekly Queries"
          analytics={weeklyAnalytics}
          granularity="weekly"
          isLoading={isFetching || isLoading}
        />
      </motion.div>

      <motion.div variants={itemVariants}>
        <WhatsAppAnalyticsCard
          title="Monthly Queries"
          analytics={monthlyAnalytics}
          granularity="monthly"
          isLoading={isFetching || isLoading}
        />
      </motion.div>
    </motion.div>
  );
}

export default QuickStatsCards;