import React, { useState } from "react";
import {
  useFarmerFeedbackMetrics,
  useFarmerFeedbackBreakdowns,
  useFarmerFeedbackGDBTable,
  useFarmerFeedbackWeeklyDigest,
  useTriggerAutoFlagging,
  useManualFlagGDB,
} from "./hooks/useFarmerFeedback";
import type { IFeedbackFilterState } from "./types";
import { FarmerFeedbackMetricsCards } from "./components/FarmerFeedbackMetricsCards";

import { FarmerFeedbackFilters } from "./components/FarmerFeedbackFilters";
import { FarmerFeedbackBreakdownCharts } from "./components/FarmerFeedbackBreakdownCharts";
import { FarmerFeedbackGDBTable } from "./components/FarmerFeedbackGDBTable";
import { WeeklyDigestModal } from "./components/WeeklyDigestModal";
import { SimulateFeedbackModal } from "./components/SimulateFeedbackModal";
import { MessageSquareHeart, ShieldCheck, Sparkles, Activity } from "lucide-react";

export const FarmerFeedbackDashboard: React.FC = () => {
  const [filters, setFilters] = useState<IFeedbackFilterState>({
    page: 1,
    limit: 15,
  });

  const [isDigestOpen, setIsDigestOpen] = useState(false);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [selectedQuestionForSimulation, setSelectedQuestionForSimulation] = useState<string>("");

  // Data Queries
  const metricsQuery = useFarmerFeedbackMetrics(filters);
  const breakdownsQuery = useFarmerFeedbackBreakdowns(filters);
  const gdbTableQuery = useFarmerFeedbackGDBTable(filters);
  const weeklyDigestQuery = useFarmerFeedbackWeeklyDigest();

  // Mutations
  const autoFlagMutation = useTriggerAutoFlagging();
  const manualFlagMutation = useManualFlagGDB();

  const handleFilterChange = (newFilters: Partial<IFeedbackFilterState>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  };

  const handleRefresh = () => {
    metricsQuery.refetch();
    breakdownsQuery.refetch();
    gdbTableQuery.refetch();
  };

  const handleTriggerFlagging = () => {
    autoFlagMutation.mutate({ threshold: 60, minResponses: 10 });
  };

  const handleFlagEntry = (questionId: string) => {
    manualFlagMutation.mutate({
      questionId,
      reason: "Manual flag from Farmer Feedback Dashboard",
    });
  };

  const handleQuickSimulate = (questionId: string) => {
    setSelectedQuestionForSimulation(questionId);
    setIsSimulatorOpen(true);
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8 flex flex-col gap-6">
      {/* Top Banner & Title */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-slate-800/80">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-lg shadow-emerald-900/30">
            <MessageSquareHeart className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white">
                Farmer Answer Feedback Loop
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Project 5
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              Continuous WhatsApp feedback capture, GDB quality scoring, and automated reviewer re-allocation
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300">
            <Activity className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span>Reviewer Loop: Active</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
            <span>SLA Threshold: &lt;60% Auto-Flag</span>
          </div>
        </div>
      </div>

      {/* KPI Metrics Cards */}
      <FarmerFeedbackMetricsCards
        metrics={metricsQuery.data}
        isLoading={metricsQuery.isLoading}
      />

      {/* Filter and Action Toolbar */}
      <FarmerFeedbackFilters
        filters={filters}
        onChange={handleFilterChange}
        onRefresh={handleRefresh}
        onOpenDigest={() => setIsDigestOpen(true)}
        onOpenSimulator={() => {
          setSelectedQuestionForSimulation("");
          setIsSimulatorOpen(true);
        }}
        onTriggerFlagging={handleTriggerFlagging}
        isFlagging={autoFlagMutation.isPending}
      />

      {/* Breakdown Visual Charts */}
      <FarmerFeedbackBreakdownCharts
        domains={breakdownsQuery.data?.domains}
        languages={breakdownsQuery.data?.languages}
        states={breakdownsQuery.data?.states}
        isLoading={breakdownsQuery.isLoading}
      />

      {/* GDB Leaderboard Table */}
      <FarmerFeedbackGDBTable
        summaries={gdbTableQuery.data?.summaries || []}
        pagination={
          gdbTableQuery.data?.pagination || {
            page: 1,
            limit: 15,
            total: 0,
            totalPages: 1,
            hasNextPage: false,
            hasPrevPage: false,
          }
        }
        isLoading={gdbTableQuery.isLoading}
        onPageChange={(page) => handleFilterChange({ page })}
        onFlagEntry={handleFlagEntry}
        onQuickSimulate={handleQuickSimulate}
      />

      {/* Weekly Digest Modal */}
      <WeeklyDigestModal
        isOpen={isDigestOpen}
        onClose={() => setIsDigestOpen(false)}
        digest={weeklyDigestQuery.data || undefined}
        isLoading={weeklyDigestQuery.isLoading}
      />


      {/* WhatsApp Feedback Simulator Modal */}
      <SimulateFeedbackModal
        isOpen={isSimulatorOpen}
        onClose={() => setIsSimulatorOpen(false)}
        defaultQuestionId={selectedQuestionForSimulation}
      />
    </div>
  );
};

export default FarmerFeedbackDashboard;
