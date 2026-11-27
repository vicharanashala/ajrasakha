import { useId, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/atoms/badge";
import { Button } from "@/components/atoms/button";
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

export type CaseMetricKey =
  | "answerRelevancy"
  | "faithfulness"
  | "contextualRelevancy"
  | "gdbMatch"
  | "agriculturalAccuracy";

export interface CaseMetricDetail {
  score: number | null;
  status?: string | null;
  reason?: string | null;
  error?: string | null;
}

export type AgriculturalDimension =
  | "crop"
  | "region"
  | "cultivation_guidance";

export interface AgriculturalDimensionDetail extends CaseMetricDetail {
  applicable?: boolean | null;
}

export interface CaseProvenanceItem {
  label: string;
  value: string | number | boolean | null;
}

export interface EvaluationCase {
  id: string;
  question: string | null;
  domain: string | null;
  technicalStatus: "pass" | "fail" | "unavailable";
  qualitySummary: string | null;
  generatedAnswer: string | null;
  metrics?: Partial<Record<CaseMetricKey, CaseMetricDetail>>;
  agriculturalDimensions?: Partial<
    Record<AgriculturalDimension, AgriculturalDimensionDetail>
  >;
  provenance?: CaseProvenanceItem[];
}

interface CaseExplorerProps {
  cases: EvaluationCase[];
}

const metricDefinitions: { key: CaseMetricKey; label: string }[] = [
  { key: "answerRelevancy", label: "Answer Relevancy" },
  { key: "faithfulness", label: "Faithfulness" },
  { key: "contextualRelevancy", label: "Contextual Relevancy" },
  { key: "gdbMatch", label: "GDB Match" },
  { key: "agriculturalAccuracy", label: "Agricultural Accuracy" },
];

const dimensionDefinitions: {
  key: AgriculturalDimension;
  label: string;
}[] = [
  { key: "crop", label: "Crop" },
  { key: "region", label: "Region" },
  { key: "cultivation_guidance", label: "Cultivation guidance" },
];

function isUnavailable(value: string | null | undefined) {
  return value == null || value.trim() === "";
}

function UnavailableValue() {
  return <span className="text-muted-foreground">Unavailable</span>;
}

function MetricDetailCard({
  label,
  detail,
}: {
  label: string;
  detail: CaseMetricDetail | undefined;
}) {
  return (
    <div className="min-w-0 rounded-lg border p-3">
      <h4 className="text-sm font-semibold">{label}</h4>
      <dl className="mt-2 space-y-2 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Score</dt>
          <dd className="font-medium">
            {detail?.score == null ? (
              <UnavailableValue />
            ) : (
              detail.score.toFixed(2)
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Status</dt>
          <dd>
            {isUnavailable(detail?.status) ? (
              <UnavailableValue />
            ) : (
              detail?.status
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Reason</dt>
          <dd className="whitespace-pre-wrap break-words">
            {isUnavailable(detail?.reason) ? (
              <UnavailableValue />
            ) : (
              detail?.reason
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Error</dt>
          <dd className="whitespace-pre-wrap break-words">
            {isUnavailable(detail?.error) ? (
              <UnavailableValue />
            ) : (
              detail?.error
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function AgriculturalDimensionCard({
  label,
  detail,
}: {
  label: string;
  detail: AgriculturalDimensionDetail | undefined;
}) {
  const applicability =
    detail?.applicable == null
      ? "Unavailable"
      : detail.applicable
        ? "Applicable"
        : "Not applicable";

  return (
    <div className="min-w-0 rounded-lg border p-3">
      <h4 className="text-sm font-semibold">{label}</h4>
      <dl className="mt-2 space-y-2 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Score</dt>
          <dd className="font-medium">
            {detail?.score == null ? (
              <UnavailableValue />
            ) : (
              detail.score.toFixed(2)
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Applicability</dt>
          <dd className="text-muted-foreground">{applicability}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Reason</dt>
          <dd className="whitespace-pre-wrap break-words">
            {isUnavailable(detail?.reason) ? (
              <UnavailableValue />
            ) : (
              detail?.reason
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Error</dt>
          <dd className="whitespace-pre-wrap break-words">
            {isUnavailable(detail?.error) ? (
              <UnavailableValue />
            ) : (
              detail?.error
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function CaseExplorerRow({ caseData }: { caseData: EvaluationCase }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const detailsId = useId();
  const technicalStatus = {
    pass: {
      label: "PASS",
      className:
        "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300",
    },
    fail: {
      label: "FAIL",
      className:
        "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/60 dark:text-red-300",
    },
    unavailable: {
      label: "Unavailable",
      className: "text-muted-foreground",
    },
  }[caseData.technicalStatus];

  return (
    <>
      <TableRow>
        <TableCell className="min-w-64 max-w-xl whitespace-normal">
          <Button
            type="button"
            variant="ghost"
            className="h-auto w-full justify-between px-2 py-1 text-left whitespace-normal"
            aria-expanded={isExpanded}
            aria-controls={detailsId}
            onClick={() => setIsExpanded((expanded) => !expanded)}
          >
            <span className="line-clamp-3 break-words">
              {isUnavailable(caseData.question) ? (
                <UnavailableValue />
              ) : (
                caseData.question
              )}
            </span>
            {isExpanded ? (
              <ChevronUp aria-hidden="true" className="ml-2 size-4 shrink-0" />
            ) : (
              <ChevronDown
                aria-hidden="true"
                className="ml-2 size-4 shrink-0"
              />
            )}
          </Button>
        </TableCell>
        <TableCell>
          {isUnavailable(caseData.domain) ? (
            <UnavailableValue />
          ) : (
            caseData.domain
          )}
        </TableCell>
        <TableCell>
          <Badge variant="outline" className={technicalStatus.className}>
            {technicalStatus.label}
          </Badge>
        </TableCell>
        <TableCell className="min-w-48 max-w-md whitespace-normal">
          {isUnavailable(caseData.qualitySummary) ? (
            <UnavailableValue />
          ) : (
            caseData.qualitySummary
          )}
        </TableCell>
      </TableRow>

      <TableRow id={detailsId} hidden={!isExpanded}>
        <TableCell colSpan={4} className="whitespace-normal p-4">
          <div className="space-y-6">
            <section aria-label="Generated answer">
              <h3 className="mb-2 text-sm font-semibold">Generated Answer</h3>
              <p className="whitespace-pre-wrap break-words text-sm">
                {isUnavailable(caseData.generatedAnswer) ? (
                  <UnavailableValue />
                ) : (
                  caseData.generatedAnswer
                )}
              </p>
            </section>

            <section aria-label="Quality metric details">
              <h3 className="mb-2 text-sm font-semibold">Quality Metrics</h3>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {metricDefinitions.map(({ key, label }) => (
                  <MetricDetailCard
                    key={key}
                    label={label}
                    detail={caseData.metrics?.[key]}
                  />
                ))}
              </div>
            </section>

            <section aria-label="Agricultural accuracy dimensions">
              <h3 className="mb-2 text-sm font-semibold">
                Agricultural Accuracy Dimensions
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {dimensionDefinitions.map(({ key, label }) => (
                  <AgriculturalDimensionCard
                    key={key}
                    label={label}
                    detail={caseData.agriculturalDimensions?.[key]}
                  />
                ))}
              </div>
            </section>

            {caseData.provenance && caseData.provenance.length > 0 && (
              <section aria-label="Case provenance">
                <h3 className="mb-2 text-sm font-semibold">Provenance</h3>
                <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {caseData.provenance.map(({ label, value }) => (
                    <div key={label} className="min-w-0 rounded-lg border p-3">
                      <dt className="text-xs text-muted-foreground">
                        {label}
                      </dt>
                      <dd className="mt-1 whitespace-pre-wrap break-words text-sm">
                        {value === null || value === "" ? (
                          <UnavailableValue />
                        ) : (
                          String(value)
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
          </div>
        </TableCell>
      </TableRow>
    </>
  );
}

export function CaseExplorer({ cases }: CaseExplorerProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Case Explorer</CardTitle>
        <CardDescription>
          Inspect evaluation questions, outcomes, metric details, and provenance
        </CardDescription>
      </CardHeader>
      <CardContent>
        {cases.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No evaluation cases available.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Question</TableHead>
                <TableHead scope="col">Domain</TableHead>
                <TableHead scope="col">Technical Status</TableHead>
                <TableHead scope="col">Quality Summary</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cases.map((caseData) => (
                <CaseExplorerRow key={caseData.id} caseData={caseData} />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
