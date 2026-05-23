import { Card, CardContent, CardHeader } from "@/components/atoms/card";

type AnalyticsItem = {
  queryCount: number;
  totalQuestions: number;
  closedQuestions: number;
  period: string;
  averageCloseTimeMinutes: number;
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
  const totalQueries = latest?.queryCount || 0;

  const maxPoint = Math.max(...analytics.map((item) => item.queryCount), 1);

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
    daily: "Current Day Queries",
    weekly: "Current Week Queries",
    monthly: "Current Month Queries",
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
            text-5xl
            font-bold
            tracking-tight
          "
        >
          {totalQueries}
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
            const height = (item.queryCount / maxPoint) * 100;

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
                {/* Bar */}
                <div
                  className="
                      w-full
                      bg-green-500
                      hover:bg-green-400
                      rounded-t-xl
                      transition-all
                      duration-200
                      cursor-pointer
                      relative
                      group
                    "
                  style={{
                    height: `${Math.max(height, 8)}%`,
                  }}
                >
                  {/* Tooltip */}
                  <div
                    className="
                        absolute
                        bottom-[110%]
                        left-1/2
                        -translate-x-1/2
                        hidden
                        group-hover:block
                        z-50
                        min-w-[100px]
                        rounded-xl
                        border
                        bg-black/95
                        px-3
                        py-2
                        text-xs
                        shadow-xl
                      "
                  >
                    <div
                      className="
                          mb-2
                          font-semibold
                          text-white
                        "
                    >
                      {formatLabel(item.period)}
                    </div>

                    <div
                      className="
                          flex
                          justify-between
                          gap-4
                          text-neutral-300
                        "
                    >
                      <span>Queries</span>

                      <span>{item.queryCount}</span>
                    </div>

                    <div
                      className="
                          flex
                          justify-between
                          gap-4
                          text-neutral-300
                        "
                    >
                      <span>Questions</span>

                      <span>{item.totalQuestions}</span>
                    </div>

                    <div
                      className="
                          flex
                          justify-between
                          gap-4
                          text-neutral-300
                        "
                    >
                      <span>Closed</span>

                      <span>{item.closedQuestions}</span>
                    </div>

                    <div
                      className="
                          flex
                          justify-between
                          gap-4
                          text-neutral-300
                        "
                    >
                      <span>Avg Close</span>

                      <span>{item.averageCloseTimeMinutes}m</span>
                    </div>
                  </div>
                </div>

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
