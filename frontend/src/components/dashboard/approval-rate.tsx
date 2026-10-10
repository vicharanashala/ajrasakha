import { CheckCircle2, Clock, GraduationCap, Layers } from "lucide-react";
import CountUp from "react-countup";
import { motion } from "framer-motion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../atoms/card";
import { Badge } from "../atoms/badge";
import { useRestartOnView } from "@/hooks/ui/useRestartView";

export interface ModeratorApprovalRate {
  approved: number;
  pending: number;
  pendingTraining?: number;
  pendingOther?: number;
  approvedTraining?: number;
  approvedOther?: number;
  approvalRate: number;
}

interface ApprovalRateCardProps {
  data: ModeratorApprovalRate;
  isAdmin?: boolean;
}

export const ApprovalRateCard: React.FC<ApprovalRateCardProps> = ({
  data,
  isAdmin = false,
}) => {
  const { ref, key } = useRestartOnView();

  const pendingTraining = data.pendingTraining ?? 0;
  const pendingOther =
    data.pendingOther ??
    (data.pending != null ? Math.max(0, data.pending - pendingTraining) : 0);
  const totalPending = data.pending ?? (pendingTraining + pendingOther);
  const approved = data.approved ?? 0;
  const approvalRate = data.approvalRate ?? 0;

  const trainingPct =
    totalPending > 0 ? Math.round((pendingTraining / totalPending) * 100) : 0;
  const otherPct = totalPending > 0 ? 100 - trainingPct : 0;

  return (
    <Card ref={ref} className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Moderator Approval Rate</CardTitle>
            <CardDescription>
              Based on pending and approved answers
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
            {totalPending + approved} total reviews
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-0 flex-1 flex flex-col justify-between">
        {/* Approval Rate Progress */}
        <div className="rounded-xl border bg-muted/30 p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">
              Approval Rate
            </span>
            <span className="text-2xl font-bold text-primary">
              <CountUp
                key={`approvalRate-${key}`}
                end={Math.floor(approvalRate)}
                duration={1.5}
                suffix="%"
                preserveValue
              />
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-primary to-primary/70 rounded-full"
              key={`approvalRate-bar-${key}`}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, Math.max(0, Math.floor(approvalRate)))}%` }}
              transition={{ duration: 1.2, ease: "easeInOut" }}
            />
          </div>
        </div>

        {/* Primary Stats: Approved & Total Pending */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-3 rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/20">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground font-medium">Approved</p>
              <p className="text-xl font-bold text-foreground truncate">
                <CountUp
                  key={`approved-${key}`}
                  end={approved}
                  duration={1.5}
                  preserveValue
                />
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-amber-200/80 bg-amber-50/50 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
              <Clock className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground font-medium">
                {isAdmin ? "Total Pending" : "Pending"}
              </p>
              <p className="text-xl font-bold text-foreground truncate">
                <CountUp
                  key={`pending-${key}`}
                  end={totalPending}
                  duration={1.5}
                  preserveValue
                />
              </p>
            </div>
          </div>
        </div>

        {/* Admin View: Pending Questions Bifurcation Breakdown */}
        {isAdmin ? (
          <div className="rounded-xl border bg-card p-3 space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Pending Breakdown
              </span>
              <span className="text-xs text-muted-foreground">
                Main Module vs Training Module
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Main Module */}
              <div className="rounded-lg border border-sky-200/70 bg-sky-50/40 p-2.5 dark:border-sky-900/50 dark:bg-sky-950/20">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300">
                    <Layers className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-xs font-medium text-foreground truncate">
                    Main Module
                  </span>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-lg font-bold text-foreground">
                    <CountUp
                      key={`pending-other-${key}`}
                      end={pendingOther}
                      duration={1.5}
                      preserveValue
                    />
                  </span>
                  {totalPending > 0 && (
                    <span className="text-[11px] font-medium text-sky-600 dark:text-sky-400">
                      {otherPct}%
                    </span>
                  )}
                </div>
              </div>

              {/* Training Module */}
              <div className="rounded-lg border border-violet-200/70 bg-violet-50/40 p-2.5 dark:border-violet-900/50 dark:bg-violet-950/20">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300">
                    <GraduationCap className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-xs font-medium text-foreground truncate">
                    Training Module
                  </span>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-lg font-bold text-foreground">
                    <CountUp
                      key={`pending-training-${key}`}
                      end={pendingTraining}
                      duration={1.5}
                      preserveValue
                    />
                  </span>
                  {totalPending > 0 && (
                    <span className="text-[11px] font-medium text-violet-600 dark:text-violet-400">
                      {trainingPct}%
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Ratio bar */}
            {totalPending > 0 ? (
              <div className="space-y-1">
                <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
                  <motion.div
                    className="bg-sky-500 dark:bg-sky-600 h-full"
                    key={`other-bar-${key}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${otherPct}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                  />
                  <motion.div
                    className="bg-violet-500 dark:bg-violet-600 h-full"
                    key={`training-bar-${key}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${trainingPct}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground px-0.5">
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                    Main Module
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
                    Training Module
                  </span>
                </div>
              </div>
            ) : (
              <div className="py-1 text-center text-xs text-muted-foreground">
                No pending questions in queue
              </div>
            )}
          </div>
        ) : (
          /* Moderator View: Queue & Review Distribution Overview */
          <div className="rounded-xl border bg-card p-3.5 space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Queue & Review Distribution
              </span>
              <span className="text-xs font-medium text-muted-foreground">
                {totalPending + approved} total reviews
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
                <motion.div
                  className="bg-emerald-500 dark:bg-emerald-600 h-full"
                  key={`moderator-approved-bar-${key}`}
                  initial={{ width: 0 }}
                  animate={{
                    width: `${
                      totalPending + approved > 0
                        ? Math.round((approved / (totalPending + approved)) * 100)
                        : 0
                    }%`,
                  }}
                  transition={{ duration: 1, ease: "easeOut" }}
                />
                <motion.div
                  className="bg-amber-500 dark:bg-amber-600 h-full"
                  key={`moderator-pending-bar-${key}`}
                  initial={{ width: 0 }}
                  animate={{
                    width: `${
                      totalPending + approved > 0
                        ? Math.round(
                            (totalPending / (totalPending + approved)) * 100
                          )
                        : 0
                    }%`,
                  }}
                  transition={{ duration: 1, ease: "easeOut" }}
                />
              </div>

              <div className="flex justify-between text-xs text-muted-foreground px-0.5">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Approved (
                  {totalPending + approved > 0
                    ? Math.round((approved / (totalPending + approved)) * 100)
                    : 0}
                  %)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  Pending (
                  {totalPending + approved > 0
                    ? Math.round(
                        (totalPending / (totalPending + approved)) * 100
                      )
                    : 0}
                  %)
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-xs">
              <span className="text-muted-foreground">Moderation Queue</span>
              <span className="font-medium">
                {totalPending === 0 ? (
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                    ✓ All Caught Up
                  </span>
                ) : (
                  <span className="text-amber-600 dark:text-amber-400 font-semibold">
                    {totalPending} Awaiting Review
                  </span>
                )}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
