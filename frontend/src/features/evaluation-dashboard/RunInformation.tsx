import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import type { DashboardRunInformation } from "./aggregate";

interface RunInformationProps {
  info: DashboardRunInformation;
}

function MetricValue({ value }: { value: string | number | null }) {
  if (value === null || value === "") {
    return <span className="text-muted-foreground">Unavailable</span>;
  }
  return <>{String(value)}</>;
}

/**
 * Phase 4: run information cards. `selected_case_count` is deliberately shown
 * as *reported* metadata, next to (but separate from) the parsed case count.
 */
export function RunInformation({ info }: RunInformationProps) {
  const entries = [
    {
      label: "Run ID",
      value: info.runId,
      description: "From run_metadata",
    },
    {
      label: "Run started at",
      value: info.runStartedAt,
      description: "From run_metadata",
    },
    {
      label: "Reported case count",
      value: info.selectedCaseCount,
      description: "selected_case_count metadata (not Total Cases)",
    },
    {
      label: "Parsed cases",
      value: info.totalCases,
      description: "Rows with record_type=case",
    },
  ];

  const classificationLabel =
    info.classification === "metadata_only"
      ? "Metadata-only report"
      : "Case report";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Run Information</CardTitle>
        <CardDescription>
          {classificationLabel} · {info.metadataRowCount} run_metadata{" "}
          {info.metadataRowCount === 1 ? "row" : "rows"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {entries.map((entry) => (
            <div key={entry.label} className="min-w-0 rounded-lg border p-3">
              <dt className="text-xs font-medium text-muted-foreground">
                {entry.label}
              </dt>
              <dd className="mt-1 break-words text-lg font-semibold">
                <MetricValue value={entry.value} />
              </dd>
              <p className="mt-1 text-xs text-muted-foreground">
                {entry.description}
              </p>
            </div>
          ))}
        </dl>
        {info.metadataRowCount === 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            No run_metadata row was present in this report. Any run fields on
            individual case rows are shown with each case's details.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
