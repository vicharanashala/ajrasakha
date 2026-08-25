import { apiFetch } from "../api/api-fetch";
import { env } from "@/config/env";

const API_BASE_URL = env.apiBaseUrl();

export interface ITestersDashboardSummaryQuery {
    dateRange?: string;
    customStart?: string;
    customEnd?: string;
    type?: string;
    category?: string;
    build?: string;
    channel?: string;
    language?: string;
    tester?: string;
    status?: string;
    severity?: string;
    excludeFailures?: boolean;
    // Comma-separated list of dynamicSubBucketFor values (Weather, Mandi
    // Prices, Government Schemes) - see TestersDashboardValidators.ts's
    // dynamicSubTypes for the wire format. Independent of `type`.
    dynamicSubTypes?: string;
    // Dynamic/Static tree filter (whole-branch selection) - "Dynamic" or
    // "Static", independent of the legacy `type` param above. See
    // TestersDashboardValidators.ts's typeBranch.
    typeBranch?: string;
    // Comma-separated list of GDB/Unique/Outreach (multi-select OR, same
    // wire format as dynamicSubTypes above) - only meaningful when
    // typeBranch="Static". See TestersDashboardValidators.ts's
    // staticSubTypes.
    staticSubTypes?: string;
}

// Mirrors backend's KpiSummary (backend/src/modules/dashboard/testersDashboard/kpis.ts)
export interface ITestersDashboardKpiSummary {
    N: number;
    trustScore: number;
    trustBreakdown: {
        A_sci: number;
        A_dom: number;
        S_lnk: number;
        E_exp: number;
        Q_trn: number;
        C_chn: number;
        C_chn_sampleSize: number;
    };
    experienceScore: number;
    experienceBreakdown: {
        S_rsp: number;
        S_sla: number;
        V_io: number;
        Q_trn: number;
        N_exp: number;
    };
    avgResponseMinutes: number;
    avgResponseSampleCount: number;
    totalTests: number;
    passRate: number;
    totalPassed: number;
    failRate: number;
    totalFailed: number;
    sciCorrectCount: number;
    voiceSuccess: {
        score: number;
        sampleSize: number;
        inputAvg: number | null;
        inputCount: number;
        outputAvg: number | null;
        outputCount: number;
    };
    notificationSuccess: number;
    notificationSuccessOnTimeCount: number;
    notificationSuccessTotalCount: number;
    criticalFailuresToday: number;
    criticalBreakdown: {
        countIncorrect: number;
        countWeatherIncorrect: number;
        countMandiIncorrect: number;
        countSchemeIncorrect: number;
        countDbFailure: number;
        countNotifFailure: number;
        countDuplicateFailure: number;
        countCriticalBugs: number;
    };
    releaseHealth: number;
    releaseBreakdown: {
        passRate: number;
        criticalDefects: number;
        criticalDefectRate: number;
        dataIntegrityFailures: number;
        dataIntegrityRate: number;
    };
    slaBreakdown: {
        validRows: number;
        withinSlaCount: number;
        withinSlaPct: number;
        exceededSlaPct: number;
        breachedCount: number;
        breachedWithoutTimeCount: number;
        avgDelayMinutes: number;
    };
}

// Mirrors backend's PreviousPeriodStats
export interface ITestersDashboardPreviousPeriodStats {
    totalTests: number;
    passRate: number;
    failRate: number;
    avgResponseMinutes: number;
    scientificAccuracy: number;
    openCriticalDefects: number;
    // Critical-only previous-period count (mirrors kpis.criticalBreakdown.
    // countCriticalBugs's definition) - used for the "All Critical Defects"
    // card's trend arrow now that its headline number is Critical-only too,
    // instead of comparing against the wider openCriticalDefects above.
    countCriticalBugs: number;
    notificationSuccess: number;
    voiceSuccess: number;
    rangeLabel: string;
}

// Mirrors backend's ModulePerformanceMetric
// (backend/src/modules/dashboard/testersDashboard/diagnostics.ts)
export interface ITestersDashboardModulePerformanceMetric {
    value: number;
    applicable: number;
}

// Mirrors backend's ModulePerformanceEntry - one of the 6 Overall Module
// Performance buckets (GDB, Unique Questions, Outreach, and Dynamic's
// Weather/Mandi Prices/Government Schemes sub-types competing directly, not
// nested under a separate Dynamic-as-a-whole entry).
export interface ITestersDashboardModulePerformanceEntry {
    bucket: string;
    totalRows: number;
    eligible: boolean;
    passRate: ITestersDashboardModulePerformanceMetric | null;
    scientificAccuracy: ITestersDashboardModulePerformanceMetric | null;
    // Null for GDB/Unique Questions/Outreach (not applicable to those
    // buckets, never averaged in) - only real for the 3 Dynamic sub-types.
    domainAccuracy: ITestersDashboardModulePerformanceMetric | null;
    translationQuality: ITestersDashboardModulePerformanceMetric | null;
    voicePerformance: ITestersDashboardModulePerformanceMetric | null;
    slaCompliance: ITestersDashboardModulePerformanceMetric | null;
    notificationExperience: ITestersDashboardModulePerformanceMetric | null;
    criticalFailureRate: ITestersDashboardModulePerformanceMetric | null;
    overallScore: number | null;
    metricsUsedCount: number;
    // The 1-2 lowest-scoring applicable metrics behind overallScore, by
    // label - genuinely derived from this bucket's own numbers server-side,
    // not hardcoded here.
    weakestMetricLabels: string[];
}

// Mirrors backend's DiagnosticsResult
// (backend/src/modules/dashboard/testersDashboard/diagnostics.ts)
export interface ITestersDashboardDiagnostics {
    stageStats: { name: string; avg: number }[];
    bottleneckName: string;
    bottleneckTime: number;
    // All 6 buckets in the fixed grouping order (GDB, Unique Questions,
    // Outreach, then Dynamic's 3 sub-types together) - NOT sorted by score.
    // weakestModule below is independent of this array's order.
    modulePerformance: ITestersDashboardModulePerformanceEntry[];
    weakestModule: string;
    weakestModuleRowCount: number;
    // The weakest eligible bucket's overallScore - the headline number the
    // Weakest Module card shows, replacing the old Scientific-Accuracy-only
    // percentage.
    weakestModuleScore: number | null;
    // The weakest eligible bucket's weakestMetricLabels - kept for API
    // completeness, but the card's headline text no longer reads from this
    // (it shows a fixed methodology explanation instead, the same for every
    // module - see TestersDashboard.tsx).
    weakestModuleReason: string[];
    criticalDefectCount: number;
    openTickets: { id: string; url: string; severity: string }[];
}

// Mirrors backend's ChartData
// (backend/src/modules/dashboard/testersDashboard/chartData.ts)
export interface ITestersDashboardScoreTrendPoint {
    date: string;
    trust: number;
    // False when this day has no real applicable data behind Trust Score
    // (only A_dom's empty-rows-defaults-to-100 default, with every other
    // sub-metric at a genuine 0) - the chart nulls out `trust` for these
    // points so the line renders a gap instead of the misleading ~20% floor.
    trustHasData: boolean;
    experience: number;
    // Same distinction as trustHasData, for Farmer Experience Score.
    experienceHasData: boolean;
    avgLatency: number;
    // Count of rows this day with a parseable Response Time reading - used
    // to tell "0min, genuinely no readings" apart from "0min, real fast
    // readings" (avgLatency alone can't distinguish the two).
    avgLatencySampleCount: number;
    avgReviewTat: number;
    // Same distinction as avgLatencySampleCount, for Review TAT.
    avgReviewTatSampleCount: number;
}

export interface ITestersDashboardChartData {
    scoreTrend: ITestersDashboardScoreTrendPoint[];
}

export interface ITestersDashboardSummaryResponse {
    success: boolean;
    totalRecords: number;
    kpis: ITestersDashboardKpiSummary;
    diagnostics: ITestersDashboardDiagnostics;
    chartData: ITestersDashboardChartData;
    previousPeriodStats: ITestersDashboardPreviousPeriodStats | null;
    filterOptions: Record<string, string[]>;
    lastSyncedAt: string | null;
}

export class TestersDashboardSummaryService {
    private _baseUrl = `${API_BASE_URL}/dashboard/testers`;

    async getSummary(query: ITestersDashboardSummaryQuery): Promise<ITestersDashboardSummaryResponse> {
        const params = new URLSearchParams();
        if (query.dateRange) params.append("dateRange", query.dateRange);
        if (query.customStart) params.append("customStart", query.customStart);
        if (query.customEnd) params.append("customEnd", query.customEnd);
        if (query.type) params.append("type", query.type);
        if (query.category) params.append("category", query.category);
        if (query.build) params.append("build", query.build);
        if (query.channel) params.append("channel", query.channel);
        if (query.language) params.append("language", query.language);
        if (query.tester) params.append("tester", query.tester);
        if (query.status) params.append("status", query.status);
        if (query.severity) params.append("severity", query.severity);
        if (query.dynamicSubTypes) params.append("dynamicSubTypes", query.dynamicSubTypes);
        if (query.typeBranch) params.append("typeBranch", query.typeBranch);
        if (query.staticSubTypes) params.append("staticSubTypes", query.staticSubTypes);
        // Backend expects the literal string "true" (see
        // TestersDashboardValidators.ts's @IsBooleanString() - query params
        // are always strings, not real booleans), so "false"/omitted both
        // mean "don't exclude" and are left unsent.
        if (query.excludeFailures) params.append("excludeFailures", "true");

        const response = await apiFetch<ITestersDashboardSummaryResponse>(
            `${this._baseUrl}/summary?${params.toString()}`,
        );

        if (!response) {
            throw new Error("Failed to fetch testers dashboard summary: No response received");
        }

        return response;
    }
}

export const testersDashboardSummaryService = new TestersDashboardSummaryService();
