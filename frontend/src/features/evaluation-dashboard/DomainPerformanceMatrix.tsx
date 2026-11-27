import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/atoms/table";
import type {
  MetricAggregate,
  QualityMetricKey,
} from "./MetricCards";

export type EvaluationDomain =
  | "Weather"
  | "Market"
  | "Soil"
  | "Schemes"
  | "GDB"
  | "Greetings";

export type DomainPerformanceData = Partial<
  Record<EvaluationDomain, Partial<Record<QualityMetricKey, MetricAggregate>>>
>;

interface DomainPerformanceMatrixProps {
  data: DomainPerformanceData;
}

const domains: EvaluationDomain[] = [
  "Weather",
  "Market",
  "Soil",
  "Schemes",
  "GDB",
  "Greetings",
];

const metrics: { key: QualityMetricKey; label: string }[] = [
  { key: "answerRelevancy", label: "Answer Relevancy" },
  { key: "faithfulness", label: "Faithfulness" },
  { key: "contextualRelevancy", label: "Contextual Relevancy" },
  { key: "gdbMatch", label: "GDB Match" },
  { key: "agriculturalAccuracy", label: "Agricultural Accuracy" },
];

export function DomainPerformanceMatrix({
  data,
}: DomainPerformanceMatrixProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Domain Performance</CardTitle>
        <CardDescription>
          Average quality scores and valid sample counts by domain
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Domain</TableHead>
              {metrics.map((metric) => (
                <TableHead
                  key={metric.key}
                  scope="col"
                  className="min-w-32 whitespace-normal"
                >
                  {metric.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {domains.map((domain) => (
              <TableRow key={domain}>
                <TableHead scope="row" className="font-medium">
                  {domain}
                </TableHead>
                {metrics.map(({ key, label }) => {
                  const metric = data[domain]?.[key];
                  const isUnavailable = metric?.average == null;

                  return (
                    <TableCell key={key}>
                      <div
                        className={
                          isUnavailable
                            ? "font-medium text-muted-foreground"
                            : "font-medium text-foreground"
                        }
                        aria-label={
                          isUnavailable
                            ? `${domain}, ${label}: unavailable`
                            : undefined
                        }
                      >
                        {metric?.average == null
                          ? "N/A"
                          : metric.average.toFixed(2)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {isUnavailable
                          ? `Unavailable · ${(
                              metric?.sampleCount ?? 0
                            ).toLocaleString()} samples`
                          : metric
                          ? `${metric.sampleCount.toLocaleString()} ${
                              metric.sampleCount === 1 ? "sample" : "samples"
                            }`
                          : "0 samples"}
                      </div>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
