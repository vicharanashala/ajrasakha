import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";

export type QualityMetricKey =
  | "answerRelevancy"
  | "faithfulness"
  | "contextualRelevancy"
  | "gdbMatch"
  | "agriculturalAccuracy";

export interface MetricAggregate {
  average: number | null;
  sampleCount: number;
}

export type MetricAggregates = Partial<
  Record<QualityMetricKey, MetricAggregate>
>;

interface MetricCardsProps {
  metrics: MetricAggregates;
}

const metricDefinitions: {
  key: QualityMetricKey;
  label: string;
}[] = [
  { key: "answerRelevancy", label: "Answer Relevancy" },
  { key: "faithfulness", label: "Faithfulness" },
  { key: "contextualRelevancy", label: "Contextual Relevancy" },
  { key: "gdbMatch", label: "GDB Match" },
  { key: "agriculturalAccuracy", label: "Agricultural Accuracy" },
];

export function MetricCards({ metrics }: MetricCardsProps) {
  return (
    <section aria-label="Aggregate quality metrics">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {metricDefinitions.map(({ key, label }) => {
          const metric = metrics[key];
          const isUnavailable = metric?.average == null;

          return (
            <Card key={key}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  className={`text-2xl font-bold ${
                    isUnavailable
                      ? "text-muted-foreground"
                      : "text-foreground"
                  }`}
                  aria-label={
                    isUnavailable ? `${label}: unavailable` : undefined
                  }
                >
                  {metric?.average == null
                    ? "N/A"
                    : metric.average.toFixed(2)}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {isUnavailable
                    ? `Unavailable · ${(
                        metric?.sampleCount ?? 0
                      ).toLocaleString()} valid samples`
                    : metric
                    ? `${metric.sampleCount.toLocaleString()} valid ${
                        metric.sampleCount === 1 ? "sample" : "samples"
                      }`
                    : "0 valid samples"}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
