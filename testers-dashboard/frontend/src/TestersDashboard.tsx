import { useState } from "react";
import { TestersDashboardSection } from "./components/TestersDashboardSection";
import { FileSpreadsheet, Database } from "lucide-react";

export type TestersDashboardViewMode = "sheet" | "db";

export function TestersDashboard() {
  const [viewMode, setViewMode] = useState<TestersDashboardViewMode>("sheet");

  return (
    <div className="p-4 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold">Admin Testers Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Quality Assurance Performance Analytics from Google Sheet and Database Logs
          </p>
        </div>

        <div className="flex items-center bg-muted p-1 rounded-lg border gap-1 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setViewMode("sheet")}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all ${
              viewMode === "sheet"
                ? "bg-background text-foreground shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            Google Sheet Analytics
          </button>
          <button
            type="button"
            onClick={() => setViewMode("db")}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all ${
              viewMode === "db"
                ? "bg-background text-foreground shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Database className="h-4 w-4 text-primary" />
            Database Logs Analytics
          </button>
        </div>
      </div>

      {viewMode === "sheet" && (
        <TestersDashboardSection
          key="sheet-section"
          source="sheet"
          title="Google Sheet Analytics"
          description="Analytics derived from Google Sheet test records (updated.csv)"
          sourceBadge="Source: Google Sheet"
        />
      )}

      {viewMode === "db" && (
        <TestersDashboardSection
          key="db-section"
          source="db"
          title="Database Logs Analytics"
          description="Analytics computed live from tester_test_cases collection in database"
          sourceBadge="Source: MongoDB (tester_test_cases)"
        />
      )}
    </div>
  );
}
