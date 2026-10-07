import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/atoms/card";
import { useTestersDashboardSummary } from "../hooks/useTestersDashboardSummary";
import { useAnalyticsFilterState } from "../hooks/useAnalyticsFilterState";
import { useAnalyticsViewState } from "../hooks/useAnalyticsViewState";
import { AnalyticsDashboardBody } from "./AnalyticsDashboardBody";
import { AnalyticsSectionHeader, formatLastUpdated } from "./AnalyticsSectionHeader";
import {
  parseCsvTextToRecords,
  saveRecordsToBrowserStorage,
  clearBrowserStorage,
  syncAndCacheSheetsFromBackend,
} from "../analytics/clientSheetAnalytics.js";

export interface SheetAnalyticsSectionProps {
  title?: string;
  description?: string;
  sourceBadge?: string;
}

// Google Sheet Analytics - computed entirely in the browser from sheet rows
// cached in IndexedDB (see analytics/clientSheetAnalytics.ts). Owns the
// sheet-only controls: Exclude Failures, Sync Live Data, CSV upload, and
// Clear Cache.
export function SheetAnalyticsSection({
  title = "Testers Dashboard",
  description = "Quality Assurance Performance Analytics",
  sourceBadge,
}: SheetAnalyticsSectionProps) {
  const filterState = useAnalyticsFilterState();
  const [excludeFailures, setExcludeFailures] = useState(false);

  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFileUpload = async (file: File) => {
    try {
      setIsUploading(true);
      setUploadError(null);
      const text = await file.text();
      const records = parseCsvTextToRecords(text);
      if (records.length === 0) {
        setUploadError("The selected CSV file could not be parsed or contains no test records. Ensure it contains a 'Test ID' column.");
        setIsUploading(false);
        return;
      }
      await saveRecordsToBrowserStorage(records, new Date().toISOString());
      await queryClient.invalidateQueries({ queryKey: ["testers-dashboard-summary", "sheet"] });
      setIsUploading(false);
    } catch (err: any) {
      setUploadError(err?.message || "Failed to parse and store CSV file.");
      setIsUploading(false);
    }
  };

  const handleClearCache = async () => {
    if (confirm("Are you sure you want to remove the cached QA Sheet records from this browser?")) {
      await clearBrowserStorage();
      await queryClient.invalidateQueries({ queryKey: ["testers-dashboard-summary", "sheet"] });
    }
  };

  const [isSyncing, setIsSyncing] = useState(false);

  const handleSyncLatestData = async () => {
    try {
      setIsSyncing(true);
      setUploadError(null);
      const res = await syncAndCacheSheetsFromBackend();
      if (!res) {
        setUploadError("Could not automatically fetch sheets from backend. Ensure TESTERS_DASHBOARD_SHEETS and SERVICE_ACCOUNT are configured.");
      } else {
        await queryClient.invalidateQueries({ queryKey: ["testers-dashboard-summary", "sheet"] });
      }
      setIsSyncing(false);
    } catch (err: any) {
      setUploadError(err?.message || "Failed to sync sheet data.");
      setIsSyncing(false);
    }
  };

  const summaryQuery = useTestersDashboardSummary(
    filterState.filters,
    excludeFailures,
    filterState.customStart,
    filterState.customEnd,
    filterState.dynamicSubTypes,
    filterState.typeBranch,
    filterState.staticSubTypes,
    "sheet",
  );

  const viewState = useAnalyticsViewState(summaryQuery.data?.diagnostics);

  if (summaryQuery.isLoading || !summaryQuery.data) {
    return <div className="p-6 text-muted-foreground">Loading {title.toLowerCase()} data...</div>;
  }

  if (summaryQuery.data?.syncing) {
    return (
      <div className="p-12 flex flex-col items-center justify-center space-y-4 text-center border rounded-lg bg-card shadow-sm my-6">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <div>
          <h3 className="text-base font-semibold">Synchronizing Google Sheet Data...</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            The initial dataset is being fetched and prepared in the background. The dashboard will automatically update once ready.
          </p>
        </div>
      </div>
    );
  }

  if (summaryQuery.data?.needClientData || !summaryQuery.data?.success) {
    return (
      <div className="space-y-6">
        <AnalyticsSectionHeader title={title} description={description} sourceBadge={sourceBadge} />

        <Card className="border-dashed border-2 p-10 text-center flex flex-col items-center justify-center space-y-4 bg-muted/10 hover:bg-muted/20 transition-colors">
          <input
            type="file"
            ref={fileInputRef}
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
            }}
          />
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary text-2xl font-bold">
            📊
          </div>
          <div>
            <h3 className="text-lg font-semibold">Google Sheet QA Analytics</h3>
            <p className="text-sm text-muted-foreground max-w-lg mt-1">
              Data could not be automatically streamed from Google Sheets. You can retry auto-syncing directly or upload an offline CSV export.
            </p>
          </div>

          {uploadError && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded max-w-md">
              {uploadError}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              disabled={isSyncing}
              onClick={handleSyncLatestData}
              className="px-5 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-md shadow hover:bg-primary/90 transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-2"
            >
              {isSyncing ? "Syncing from Google..." : "🔄 Retry Auto-Sync"}
            </button>
            <button
              type="button"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2.5 border border-input bg-background hover:bg-accent hover:text-accent-foreground text-sm font-medium rounded-md shadow-sm transition-colors cursor-pointer"
            >
              {isUploading ? "Processing CSV..." : "Upload CSV Manually"}
            </button>
          </div>
          <p className="text-xs text-muted-foreground pt-1">
            Data is processed 100% in your browser using 0 server RAM & 0 heap memory.
          </p>
        </Card>
      </div>
    );
  }

  if (summaryQuery.isError || !summaryQuery.data.success) {
    const errorDetail = summaryQuery.data?.error;
    return (
      <div className="p-6 text-destructive">
        <p className="font-semibold">Failed to load {title.toLowerCase()} data.</p>
        <p className="text-sm mt-1 text-muted-foreground">
          {errorDetail || "Check that the client CSV source is loaded."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AnalyticsSectionHeader title={title} description={description} sourceBadge={sourceBadge}>
        <div className="flex items-start gap-3 text-sm">
          <div
            className="flex items-center gap-2 cursor-pointer pt-0.5 select-none"
            onClick={() => setExcludeFailures((v) => !v)}
          >
            <button
              type="button"
              role="switch"
              aria-checked={excludeFailures}
              onClick={(e) => e.stopPropagation()}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors pointer-events-none ${
                excludeFailures ? "bg-primary" : "bg-muted-foreground/30"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                  excludeFailures ? "translate-x-[18px]" : "translate-x-1"
                }`}
              />
            </button>
            Exclude Failures
          </div>
          <div className="flex flex-col text-left">
            <span className="text-muted-foreground">
              {excludeFailures
                ? `Showing ${summaryQuery.data.kpis.N} clean of ${summaryQuery.data.totalRecords} records.`
                : `Loaded ${summaryQuery.data.totalRecords} records.`}
            </span>
            <span className="text-muted-foreground">
              Last synced: {formatLastUpdated(summaryQuery.data.lastSyncedAt ?? null)}
            </span>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="file"
                ref={fileInputRef}
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
              />
              <button
                type="button"
                disabled={isSyncing}
                onClick={handleSyncLatestData}
                className="text-xs text-primary hover:underline font-medium cursor-pointer flex items-center gap-1 disabled:opacity-50"
                title="Stream freshest live data directly from Google Sheets (0 server RAM used)"
              >
                {isSyncing ? "Syncing..." : "🔄 Sync Live Data"}
              </button>
              <span className="text-xs text-muted-foreground">•</span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs text-muted-foreground hover:text-foreground font-medium cursor-pointer"
                title="Upload an updated QA CSV export manually"
              >
                Upload CSV
              </button>
              <span className="text-xs text-muted-foreground">•</span>
              <button
                type="button"
                onClick={handleClearCache}
                className="text-xs text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                title="Clear locally cached CSV data"
              >
                Clear Cache
              </button>
            </div>
          </div>
        </div>
      </AnalyticsSectionHeader>

      <AnalyticsDashboardBody data={summaryQuery.data} filterState={filterState} viewState={viewState} />
    </div>
  );
}
