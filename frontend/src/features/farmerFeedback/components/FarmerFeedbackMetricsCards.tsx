import React from "react";
import {
  ThumbsUp,
  ThumbsDown,
  MessageSquareHeart,
  TrendingUp,
  AlertTriangle,
  Database,
  Sparkles,
} from "lucide-react";
import type { IFarmerFeedbackStats } from "../types";
import CountUp from "react-countup";
import { motion, type TargetAndTransition } from "framer-motion";

interface Props {
  metrics?: IFarmerFeedbackStats;
  isLoading: boolean;
}

export const FarmerFeedbackMetricsCards: React.FC<Props> = ({ metrics, isLoading }) => {
  const helpfulness = metrics?.helpfulnessPercentage ?? 0;
  const isHealthy = helpfulness >= 75;
  const isWarning = helpfulness >= 60 && helpfulness < 75;

  const cardVariants = {
    hidden: { opacity: 0, y: 15 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: { delay: i * 0.08, duration: 0.4 },
    }),
  };


  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Total Responses Card */}
      <motion.div
        custom={0}
        initial="hidden"
        animate="visible"
        variants={cardVariants}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900/90 to-slate-800/80 border border-slate-700/60 p-5 shadow-lg backdrop-blur-xl"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Total Feedback Received
          </span>
          <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <MessageSquareHeart className="w-5 h-5" />
          </div>
        </div>
        <div className="mt-4 flex items-baseline gap-2">
          <span className="text-3xl font-bold text-white">
            {isLoading ? (
              <span className="animate-pulse">--</span>
            ) : (
              <CountUp end={metrics?.totalFeedbacks ?? 0} duration={1.5} separator="," />
            )}
          </span>
          <span className="text-xs text-slate-400">responses</span>
        </div>
        <div className="mt-3 flex items-center gap-3 text-xs text-slate-400 border-t border-slate-700/50 pt-2.5">
          <span className="flex items-center gap-1 text-emerald-400">
            <ThumbsUp className="w-3.5 h-3.5" />
            {metrics?.positiveCount ?? 0} Yes
          </span>
          <span className="text-slate-600">•</span>
          <span className="flex items-center gap-1 text-rose-400">
            <ThumbsDown className="w-3.5 h-3.5" />
            {metrics?.negativeCount ?? 0} No
          </span>
        </div>
      </motion.div>

      {/* Overall Satisfaction / Helpfulness % */}
      <motion.div
        custom={1}
        initial="hidden"
        animate="visible"
        variants={cardVariants}
        className={`relative overflow-hidden rounded-2xl border p-5 shadow-lg backdrop-blur-xl bg-gradient-to-br ${
          isHealthy
            ? "from-emerald-950/40 to-slate-900/90 border-emerald-500/30"
            : isWarning
            ? "from-amber-950/40 to-slate-900/90 border-amber-500/30"
            : "from-rose-950/40 to-slate-900/90 border-rose-500/30"
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Farmer Satisfaction
          </span>
          <div
            className={`p-2.5 rounded-xl border ${
              isHealthy
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : isWarning
                ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                : "bg-rose-500/10 text-rose-400 border-rose-500/20"
            }`}
          >
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>
        <div className="mt-4 flex items-baseline gap-2">
          <span
            className={`text-3xl font-bold ${
              isHealthy
                ? "text-emerald-400"
                : isWarning
                ? "text-amber-400"
                : "text-rose-400"
            }`}
          >
            {isLoading ? (
              <span className="animate-pulse">--</span>
            ) : (
              <>
                <CountUp
                  end={helpfulness}
                  decimals={1}
                  duration={1.5}
                />
                %
              </>
            )}
          </span>
          <span className="text-xs text-slate-400">helpful rating</span>
        </div>
        <div className="mt-3 text-xs text-slate-400 border-t border-slate-700/50 pt-2.5 flex items-center justify-between">
          <span>Target SLA: &gt; 80%</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
              isHealthy
                ? "bg-emerald-500/20 text-emerald-300"
                : isWarning
                ? "bg-amber-500/20 text-amber-300"
                : "bg-rose-500/20 text-rose-300"
            }`}
          >
            {isHealthy ? "Optimal" : isWarning ? "Watchlist" : "Critical Review"}
          </span>
        </div>
      </motion.div>

      {/* Evaluated GDB Entries Card */}
      <motion.div
        custom={2}
        initial="hidden"
        animate="visible"
        variants={cardVariants}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900/90 to-slate-800/80 border border-slate-700/60 p-5 shadow-lg backdrop-blur-xl"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            GDB Entries Evaluated
          </span>
          <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <Database className="w-5 h-5" />
          </div>
        </div>
        <div className="mt-4 flex items-baseline gap-2">
          <span className="text-3xl font-bold text-white">
            {isLoading ? (
              <span className="animate-pulse">--</span>
            ) : (
              <CountUp
                end={metrics?.totalGDBEntriesEvaluated ?? 0}
                duration={1.5}
                separator=","
              />
            )}
          </span>
          <span className="text-xs text-slate-400">unique Q&As</span>
        </div>
        <div className="mt-3 text-xs text-slate-400 border-t border-slate-700/50 pt-2.5 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-purple-400" />
          <span>Across 20,000+ Golden DB</span>
        </div>
      </motion.div>

      {/* Flagged for Review Card */}
      <motion.div
        custom={3}
        initial="hidden"
        animate="visible"
        variants={cardVariants}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-rose-950/20 to-slate-900/90 border border-rose-500/30 p-5 shadow-lg backdrop-blur-xl"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-rose-300">
            Flagged for Re-Review
          </span>
          <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>
        <div className="mt-4 flex items-baseline gap-2">
          <span className="text-3xl font-bold text-rose-400">
            {isLoading ? (
              <span className="animate-pulse">--</span>
            ) : (
              <CountUp
                end={metrics?.totalFlaggedEntries ?? 0}
                duration={1.5}
              />
            )}
          </span>
          <span className="text-xs text-slate-400">in expert queue</span>
        </div>
        <div className="mt-3 text-xs text-slate-400 border-t border-slate-700/50 pt-2.5 flex items-center justify-between">
          <span>Threshold: &lt; 60%</span>
          <span className="text-rose-400 text-[11px] font-medium">Auto-injected</span>
        </div>
      </motion.div>
    </div>
  );
};
