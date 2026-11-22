import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";

export interface SummaryStatsData {
  totalCases: number;
  technicalPassRate: {
    percent: number | null;
    sampleCount: number;
  };
  qualityEvaluatedCases: number;
  evaluationErrors: number;
}

interface SummaryStatsProps {
  data: SummaryStatsData;
}

const formatCount = (value: number) => value.toLocaleString();

export function SummaryStats({ data }: SummaryStatsProps) {
  const stats = [
    {
      label: "Total Cases",
      value: formatCount(data.totalCases),
      description: "Parsed evaluation cases",
      unavailable: false,
    },
    {
      label: "Technical Pass Rate",
      value:
        data.technicalPassRate.percent === null
          ? "N/A"
          : `${data.technicalPassRate.percent.toFixed(1)}%`,
      description:
        data.technicalPassRate.percent === null
          ? "Unavailable: no valid technical outcomes"
          : `${formatCount(data.technicalPassRate.sampleCount)} valid outcomes`,
      unavailable: data.technicalPassRate.percent === null,
    },
    {
      label: "Quality-Evaluated Cases",
      value: formatCount(data.qualityEvaluatedCases),
      description: "Cases with at least one valid quality score",
      unavailable: false,
    },
    {
      label: "Evaluation Errors",
      value: formatCount(data.evaluationErrors),
      description: "Cases with one or more evaluation errors",
      unavailable: false,
    },
  ];

  return (
    <section aria-label="Evaluation summary">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className={`text-2xl font-bold ${
                  stat.unavailable ? "text-muted-foreground" : "text-foreground"
                }`}
                aria-label={
                  stat.unavailable ? `${stat.label}: unavailable` : undefined
                }
              >
                {stat.value}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
