import { Card, CardContent, CardHeader } from "@/components/atoms/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/atoms/tooltip";

type AnalyticsItem = {
  queryCount: number;
  totalQuestions: number;
  closedQuestions: number;
  period: string;
  averageCloseTimeMinutes: number;
  closedInPeriod?: number;
  delayed?: number;
  draft?: number;
  duplicate?: number;
  hold?: number;
  inReview?: number;
  open?: number;
  paeSubmitted?: number;
  pass?: number;
  rerouted?: number;
  carryForward?: number;
};

type WhatsAppAnalyticsCardProps = {
  title: string;
  analytics: AnalyticsItem[];
  granularity: "daily" | "weekly" | "monthly";
};

export function WhatsAppAnalyticsCard({
  title,
  analytics,
  granularity,
}: WhatsAppAnalyticsCardProps) {
  const latest = analytics.at(-1);
  const totalQueries = latest?.totalQuestions || 0;
  const maxPoint = Math.max(...analytics.map((item) => item.totalQuestions), 1);

  const formatLabel = (period: string) => {
    if (granularity === "daily") {
      const date = new Date(period);

      return date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
      });
    }

    if (granularity === "weekly") {
      return period.replace("2026-", "");
    }

    if (granularity === "monthly") {
      const [year, month] = period.split("-");

      return new Date(Number(year), Number(month) - 1).toLocaleDateString(
        "en-IN",
        {
          month: "short",
        },
      );
    }

    return period;
  };

  const currentLabelMap = {
    daily: "Current Day Questions",
    weekly: "Current Week Questions",
    monthly: "Current Month Questions",
  };

  const formatCloseTime = (minutes: number) => {
    if (minutes < 60) {
      return `${minutes}m`;
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (remainingMinutes === 0) {
      return `${hours}h`;
    }

    return `${hours}h ${remainingMinutes.toFixed(0)}m`;
  };

  return (
    <Card
      className="
        border
        border-border
        rounded-2xl
        bg-background/80
        backdrop-blur
        overflow-x-auto
         h-fit
      "
    >
      <CardHeader className="pb-2">
        <div
          className="
            text-sm
            text-muted-foreground
          "
        >
          {currentLabelMap[granularity]}
        </div>
        <div
          className="
    flex
    items-center
    gap-2
    text-sm
    text-muted-foreground
    justify-between
  "
        >
          <div
            className="
            text-5xl
            font-bold
            tracking-tight
          "
          >
            {totalQueries}
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="
            flex h-4 w-4 cursor-pointer
            items-center justify-center
            rounded-full border text-[10px]
          "
                >
                  i
                </span>
              </TooltipTrigger>

              <TooltipContent className="max-w-[260px]">
                <p>Displays questions metrics for {granularity} granularity</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardHeader>

      <CardContent>
        {/* Chart */}
        <div
          className="
            flex
            items-end
            gap-2
            h-52
            mb-5
          "
        >
          {analytics.map((item, index) => {
            const height = (item.totalQuestions / maxPoint) * 100;

            return (
              <div
                key={index}
                className="
                    flex
                    flex-col
                    items-center
                    flex-1
                    h-full
                    justify-end
                  "
              >
                {/* Tooltip */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className="
                          w-full
                          bg-primary
                          hover:opacity-90
                          rounded-t-xl
                          transition-all
                          duration-200
                          cursor-pointer
                        "
                      style={{
                        height: `${Math.max(height, 8)}%`,
                      }}
                    />
                  </TooltipTrigger>

                  <TooltipContent
                    side="top"
                    className="
                        min-w-[240px]
                        rounded-xl
                        p-4
                        max-h-[35vh]
                        overflow-y-auto
                        scrollbar-thin
                        scrollbar-track-transparent
                        scrollbar-thumb-emerald-700
                        hover:scrollbar-thumb-emerald-600
                      "
                  >
                    <div className="space-y-2">
                      <div className="font-semibold">
                        {formatLabel(item.period)}
                      </div>

                      <div className="flex justify-between gap-6">
                        <span className="text-muted-foreground">
                          Total Questions opened
                        </span>

                        <span className="font-medium">
                          {item.totalQuestions}
                        </span>
                      </div>

                      <div className="flex justify-between gap-6">
                        <span className="text-muted-foreground">
                          Questions closed
                        </span>

                        <span className="font-medium">
                          {item.closedQuestions}
                        </span>
                      </div>

                      <div className="flex justify-between gap-6">
                        <span className="text-muted-foreground">
                          Questions Delayed
                        </span>

                        <span className="font-medium">{item.delayed}</span>
                      </div>

                      <div className="flex justify-between gap-6">
                        <span className="text-muted-foreground">
                          Questions in draft
                        </span>

                        <span className="font-medium">{item.draft}</span>
                      </div>

                      <div className="flex justify-between gap-6">
                        <span className="text-muted-foreground">
                          Duplicate Questions
                        </span>

                        <span className="font-medium">{item.duplicate}</span>
                      </div>

                      <div className="flex justify-between gap-6">
                        <span className="text-muted-foreground">
                          Questions in hold
                        </span>

                        <span className="font-medium">{item.hold}</span>
                      </div>

                      <div className="flex justify-between gap-6">
                        <span className="text-muted-foreground">
                          Questions in Review
                        </span>

                        <span className="font-medium">{item.inReview}</span>
                      </div>

                      <div className="flex justify-between gap-6">
                        <span className="text-muted-foreground">
                          Questions open
                        </span>

                        <span className="font-medium">{item.open}</span>
                      </div>

                      <div className="flex justify-between gap-6">
                        <span className="text-muted-foreground">
                          Questions paeSubmitted
                        </span>

                        <span className="font-medium">{item.paeSubmitted}</span>
                      </div>

                      <div className="flex justify-between gap-6">
                        <span className="text-muted-foreground">
                          Questions pass
                        </span>

                        <span className="font-medium">{item.pass}</span>
                      </div>
                      <div className="flex justify-between gap-6">
                        <span className="text-muted-foreground">
                          Questions rerouted
                        </span>

                        <span className="font-medium">{item.rerouted}</span>
                      </div>
                      {index == analytics.length - 1 &&
                        granularity === "daily" && (
                          <div className="flex justify-between gap-6">
                            <span className="text-muted-foreground">
                              Questions CarryForward
                            </span>

                            <span className="font-medium">
                              {item.carryForward}
                            </span>
                          </div>
                        )}
                      <div className="flex justify-between gap-6">
                        <span className="text-muted-foreground">
                          Avg Closure time
                        </span>

                        <span className="font-medium">
                          {formatCloseTime(item.averageCloseTimeMinutes)}
                        </span>
                      </div>

                      <div className="flex justify-between gap-6">
                        <span className="text-muted-foreground">
                          Total Questions closed(For selected time)
                        </span>

                        <span className="font-medium">
                          {item?.closedInPeriod}
                        </span>
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>

                {/* X-axis label */}
                <div
                  className="
                      mt-2
                      text-[11px]
                      text-muted-foreground
                    "
                >
                  {formatLabel(item.period)}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
