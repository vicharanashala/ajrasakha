import { useState, type ReactNode } from "react";
import { AlertCircle, AlertTriangle, Info, ShieldAlert } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import {
  buildDashboardView,
  type DashboardState,
  type DashboardViewModel,
} from "./aggregate";
import { CaseExplorer } from "./CaseExplorer";
import { DomainPerformanceMatrix } from "./DomainPerformanceMatrix";
import { MetricCards } from "./MetricCards";
import { parseReport, type ReportParseError } from "./parseReport";
import { RunInformation } from "./RunInformation";
import { SummaryStats } from "./SummaryStats";
import { UploadSection } from "./UploadSection";

function ErrorBanner({
  error,
  hasReport,
}: {
  error: ReportParseError;
  hasReport: boolean;
}) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
    >
      <AlertCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0 space-y-1">
        <p className="font-semibold">Could not load this report</p>
        <p className="break-words">
          {error.message}
          {error.rowNumber != null ? ` (row ${error.rowNumber})` : ""}
        </p>
        <p className="text-xs">
          {hasReport
            ? "The previously loaded report is still displayed below."
            : "Choose a different CSV file to continue."}
        </p>
      </div>
    </div>
  );
}

function WarningsNotice({
  warnings,
}: {
  warnings: DashboardViewModel["warnings"];
}) {
  return (
    <div className="rounded-lg border border-amber-300/70 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
      <div className="flex items-center gap-2 font-semibold">
        <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
        {warnings.length} parser{" "}
        {warnings.length === 1 ? "warning" : "warnings"}
      </div>
      <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto pr-1 text-xs">
        {warnings.map((warning, index) => (
          <li
            key={`${warning.code}-${warning.rowNumber ?? "file"}-${index}`}
            className="break-words"
          >
            {warning.rowNumber != null ? `Row ${warning.rowNumber}: ` : ""}
            {warning.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Notice({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-3 rounded-lg border bg-muted/40 p-4 text-sm">
      <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 space-y-1">
        <p className="font-medium">{title}</p>
        <div className="text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

function ProvenanceDisclaimer() {
  return (
    <aside
      aria-label="Provenance disclaimer"
      className="flex gap-3 rounded-lg border border-amber-300/70 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200"
    >
      <ShieldAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <p className="max-w-4xl">
        Evaluation results depend on the reference data available for this run.
        Synthetic/manual references should not be interpreted as ACE GDB expert
        validation.
      </p>
    </aside>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>No report loaded</CardTitle>
        <CardDescription>
          Upload a CSV evaluation report to see KPIs, quality metrics, domain
          performance, and individual cases.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">Required:</span> a{" "}
            <code className="font-mono">record_type</code> column. Rows must be
            either <code className="font-mono">case</code> or{" "}
            <code className="font-mono">run_metadata</code>.
          </li>
          <li>
            <span className="font-medium text-foreground">Optional:</span>{" "}
            query, technical outcome, domains, answers, metric scores/statuses,
            and agricultural dimensions. Missing fields show as unavailable.
          </li>
          <li>
            A metadata-only report and a report with no quality scores are both
            valid; invalid uploads never replace the current dashboard.
          </li>
        </ul>
      </CardContent>
    </Card>
  );
}

function DashboardContent({
  dashboard,
}: {
  dashboard: DashboardViewModel;
}) {
  const isMetadataOnly = dashboard.runInformation.classification === "metadata_only";
  const hasCasesButNoScores =
    dashboard.summary.totalCases > 0 &&
    dashboard.summary.qualityEvaluatedCases === 0;

  return (
    <div className="space-y-6">
      <RunInformation info={dashboard.runInformation} />

      {dashboard.warnings.length > 0 && (
        <WarningsNotice warnings={dashboard.warnings} />
      )}

      {isMetadataOnly && (
        <Notice title="Metadata-only report">
          This report contains run information but no evaluation case rows.
          Case counts are zero and all case-dependent values show as N/A.
        </Notice>
      )}

      {hasCasesButNoScores && (
        <Notice title="No quality scores available">
          Case rows were loaded successfully, but none contain a valid quality
          score. Technical outcomes and case details are still shown below.
        </Notice>
      )}

      <SummaryStats data={dashboard.summary} />

      <section aria-labelledby="quality-metrics-heading" className="space-y-3">
        <h2
          id="quality-metrics-heading"
          className="text-lg font-semibold tracking-tight"
        >
          Quality Metrics
        </h2>
        <MetricCards metrics={dashboard.metricAggregates} />
      </section>

      <DomainPerformanceMatrix data={dashboard.domainPerformance} />

      {dashboard.unknownDomains.length > 0 && (
        <Notice title="Unmapped domains">
          These domain labels do not map to the six matrix rows and are not
          assigned to a known domain. Their cases still appear in the case
          explorer and in overall metric averages:{" "}
          {dashboard.unknownDomains
            .map(({ domain, caseCount }) => `${domain} (${caseCount})`)
            .join(", ")}
          .
        </Notice>
      )}

      <CaseExplorer cases={dashboard.cases} />
    </div>
  );
}

/**
 * Phase 4: working dashboard container. Parsing and aggregation run on
 * successful uploads only; rejected uploads keep the previously loaded report.
 */
export function DashboardView() {
  const [state, setState] = useState<DashboardState | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<ReportParseError | null>(null);

  const handleFileSelected = async (file: File) => {
    setIsProcessing(true);
    setError(null);

    try {
      const result = await parseReport(file);
      if (!result.ok) {
        // Keep the previous report (if any) untouched.
        setError(result.error);
        return;
      }

      setState({
        report: result.report,
        dashboard: buildDashboardView(result.report),
      });
      setFileName(file.name);
    } catch (caught) {
      setError({
        code: "file_read_error",
        message:
          caught instanceof Error
            ? `The report could not be processed: ${caught.message}`
            : "The report could not be processed.",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto max-w-7xl px-4 py-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            Evaluation Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Client-side analysis of AjraSakha evaluation reports. All parsing
            happens in your browser.
          </p>
          <div className="mt-4">
            <ProvenanceDisclaimer />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        <UploadSection
          onFileSelected={handleFileSelected}
          isProcessing={isProcessing}
          fileName={fileName}
          hasReport={state !== null}
        />

        {error && (
          <ErrorBanner error={error} hasReport={state !== null} />
        )}

        {state ? (
          <DashboardContent dashboard={state.dashboard} />
        ) : (
          <EmptyState />
        )}
      </main>
    </div>
  );
}
