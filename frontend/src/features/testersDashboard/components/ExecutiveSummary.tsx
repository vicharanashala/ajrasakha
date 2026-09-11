import { ShieldCheck, Clock, AlertTriangle, Bell, Mic, CheckCircle2, XCircle, ClipboardList } from "lucide-react";
import { KpiCard, type KpiCardProps } from "./KpiCard";
import type {
  ITestersDashboardKpiSummary,
  ITestersDashboardPreviousPeriodStats,
} from "@/hooks/services/testersDashboardSummaryService";

export interface ExecutiveSummaryProps {
  kpis: ITestersDashboardKpiSummary;
  previousPeriodStats: ITestersDashboardPreviousPeriodStats | null;
}

export function ExecutiveSummary({ kpis, previousPeriodStats }: ExecutiveSummaryProps) {
  const executiveSummaryCards: KpiCardProps[] = [
    {
      title: "Total Tests Executed",
      infoAlign: "start",
      infoContent: (
        <>
          <p>Count of all test rows matching the current filters.</p>
          <div className="flex justify-between pt-1 border-t"><span>Total</span><span className="font-medium">{kpis.totalTests.toLocaleString()}</span></div>
        </>
      ),
      value: kpis.totalTests.toLocaleString(),
      icon: <ClipboardList className="h-5 w-5 text-blue-600" />,
      iconBgClass: "bg-blue-100",
      currentValue: kpis.totalTests,
      previousValue: previousPeriodStats?.totalTests,
      lowerIsBetter: false,
    },
    {
      title: "Pass Rate",
      infoContent: (
        <>
          <p>Based on Critical Failures, not just "Overall Test Status" - a row is a failure if it trips ANY Critical Failure category (Incorrect Answers, Not Saved in DB, SLA Breached, etc.), a success otherwise.</p>
          <p>Rows with Zero Failures ÷ Total Tests × 100</p>
          <div className="flex justify-between"><span>Zero Failures</span><span className="font-medium">{kpis.totalPassed.toLocaleString()}</span></div>
          <div className="flex justify-between"><span>Total</span><span className="font-medium">{kpis.totalTests.toLocaleString()}</span></div>
          <div className="flex justify-between pt-1 border-t"><span>Result</span><span className="font-medium">{kpis.passRate}%</span></div>
        </>
      ),
      value: `${kpis.passRate}%`,
      icon: <CheckCircle2 className="h-5 w-5 text-emerald-600" />,
      iconBgClass: "bg-emerald-100",
      currentValue: kpis.passRate,
      previousValue: previousPeriodStats?.passRate,
      lowerIsBetter: false,
    },
    {
      title: "Fail Rate",
      infoContent: (
        <>
          <p>Based on Critical Failures, not just "Overall Test Status" - a row is a failure if it trips ANY Critical Failure category (Incorrect Answers, Not Saved in DB, SLA Breached, etc.).</p>
          <p>Rows with At Least One Failure ÷ Total Tests × 100 - derived as 100% − Pass Rate, so the two always sum to exactly 100%.</p>
          <div className="flex justify-between"><span>Rows with a Failure</span><span className="font-medium">{kpis.totalFailed.toLocaleString()}</span></div>
          <div className="flex justify-between"><span>Total</span><span className="font-medium">{kpis.totalTests.toLocaleString()}</span></div>
          <div className="flex justify-between pt-1 border-t"><span>Result</span><span className="font-medium">{kpis.failRate}%</span></div>
        </>
      ),
      value: `${kpis.failRate}%`,
      icon: <XCircle className="h-5 w-5 text-red-600" />,
      iconBgClass: "bg-red-100",
      currentValue: kpis.failRate,
      previousValue: previousPeriodStats?.failRate,
      lowerIsBetter: true,
    },
    {
      title: "Avg Response Time",
      infoContent: (
        <>
          <p>Average of "Response Time (mins)" across valid readings</p>
          <div className="flex justify-between"><span>Valid readings</span><span className="font-medium">{kpis.avgResponseSampleCount.toLocaleString()}</span></div>
          <div className="flex justify-between pt-1 border-t"><span>Average</span><span className="font-medium">{kpis.avgResponseMinutes} min</span></div>
        </>
      ),
      value: kpis.avgResponseMinutes,
      suffix: "min",
      icon: <Clock className="h-5 w-5 text-amber-600" />,
      iconBgClass: "bg-amber-100",
      currentValue: kpis.avgResponseMinutes,
      previousValue: previousPeriodStats?.avgResponseMinutes,
      lowerIsBetter: true,
    },
    {
      title: "Scientific Accuracy",
      infoContent: (
        <>
          <p>Same calculation as Trust Score's Sci Accuracy: Correct ÷ Applicable × 100 (GDB/Unique/Outreach/Dynamic rows with a real answer; "Correct"/"Yes" count as correct)</p>
          <div className="flex justify-between"><span>Correct</span><span className="font-medium">{kpis.sciCorrectCount.toLocaleString()}</span></div>
          <div className="flex justify-between"><span>Applicable</span><span className="font-medium">{kpis.scientificAccuracyApplicableCount.toLocaleString()}</span></div>
          <div className="flex justify-between pt-1 border-t"><span>Result</span><span className="font-medium">{kpis.scientificAccuracyAllRows}%</span></div>
        </>
      ),
      value: `${kpis.scientificAccuracyAllRows}%`,
      icon: <ShieldCheck className="h-5 w-5 text-indigo-600" />,
      iconBgClass: "bg-indigo-100",
      currentValue: kpis.scientificAccuracyAllRows,
      previousValue: previousPeriodStats?.scientificAccuracy,
      lowerIsBetter: false,
    },
    {
      title: "Critical Defects",
      infoContent: (
        <>
          <p>Count of rows where Defect Severity is Critical. Feeds Release Health's Critical Defect Health / Critical Severity Bug Health metrics.</p>
          <div className="flex justify-between pt-1 border-t"><span>Count</span><span className="font-medium">{kpis.criticalBreakdown.countCriticalBugs.toLocaleString()}</span></div>
        </>
      ),
      value: kpis.criticalBreakdown.countCriticalBugs,
      icon: <AlertTriangle className="h-5 w-5 text-red-600" />,
      iconBgClass: "bg-red-100",
      currentValue: kpis.criticalBreakdown.countCriticalBugs,
      previousValue: previousPeriodStats?.countCriticalBugs,
      lowerIsBetter: true,
    },
    {
      title: "Notification Success",
      infoContent: (
        <>
          <p>"Notification Received?" = On Time ÷ rows with a result logged × 100</p>
          <div className="flex justify-between"><span>Received on Time</span><span className="font-medium">{kpis.notificationSuccessOnTimeCount.toLocaleString()}</span></div>
          <div className="flex justify-between"><span>Notification Results</span><span className="font-medium">{kpis.notificationSuccessTotalCount.toLocaleString()}</span></div>
          <div className="flex justify-between pt-1 border-t"><span>Result</span><span className="font-medium">{kpis.notificationSuccess}%</span></div>
        </>
      ),
      value: `${kpis.notificationSuccess}%`,
      icon: <Bell className="h-5 w-5 text-purple-600" />,
      iconBgClass: "bg-purple-100",
      currentValue: kpis.notificationSuccess,
      previousValue: previousPeriodStats?.notificationSuccess,
      lowerIsBetter: false,
    },
    {
      title: "Voice Success",
      infoAlign: "end",
      infoContent: (
        <>
          <p>Average of "Voice Input Quality" and "Voice Output Quality"</p>
          <div className="grid grid-cols-2 gap-x-2 pt-1 border-t">
            <span>Clear: 10</span><span>Good: 8</span>
            <span>Low Volume: 4</span><span>Distorted: 3</span>
            <span className="col-span-2">No Output/Input: 0</span>
          </div>
          <div className="flex justify-between pt-1 border-t"><span>Valid scores</span><span className="font-medium">{kpis.voiceSuccess.sampleSize.toLocaleString()}</span></div>
          <div className="flex justify-between"><span>Average</span><span className="font-medium">{kpis.voiceSuccess.score}/10</span></div>
        </>
      ),
      value: kpis.voiceSuccess.score,
      suffix: "/10",
      icon: <Mic className="h-5 w-5 text-cyan-600" />,
      iconBgClass: "bg-cyan-100",
      currentValue: kpis.voiceSuccess.score,
      previousValue: previousPeriodStats?.voiceSuccess,
      lowerIsBetter: false,
    },
  ];

  return (
    <>
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Executive Summary</h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        {executiveSummaryCards.map((card) => (
          <KpiCard key={card.title} {...card} />
        ))}
      </div>
    </>
  );
}
