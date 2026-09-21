import { apiFetch } from "@/hooks/api/api-fetch";
import { env } from "@/config/env";

const API_BASE_URL = env.apiBaseUrl();

export interface ITestersDashboardSummaryQuery {
    source?: 'sheet' | 'db';
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

// Mirrors backend's ReleaseHealthMetric/ReleaseHealthBucket/ReleaseHealthResult
// (testers-dashboard/backend/testersDashboard/kpis.ts)
export interface ITestersDashboardReleaseHealthMetric {
    key: string;
    label: string;
    // This metric's weight within its own bucket (0-1).
    weight: number;
    // 0-100 health score.
    value: number;
}

export interface ITestersDashboardReleaseHealthBucket {
    key: string;
    label: string;
    // This bucket's weight within the overall Release Health score (0-1).
    weight: number;
    // 0-100, the weighted average of this bucket's own metrics.
    score: number;
    metrics: ITestersDashboardReleaseHealthMetric[];
}

// Mirrors backend's ReleaseHealthDecision.
export type ITestersDashboardReleaseHealthDecision = "GO" | "GO_WITH_CONDITIONS" | "NO_GO";

export interface ITestersDashboardReleaseHealthResult {
    score: number;
    buckets: ITestersDashboardReleaseHealthBucket[];
    // Score-only GO / GO WITH CONDITIONS / NO-GO call (>=95 / >=90 / below
    // 90) - see backend's releaseHealthDecision() for the important caveat:
    // the business plan's full rule also requires all mandatory release
    // gates (rollback tested, monitoring active, backup available, no
    // critical blocking defect, etc.) to PASS, which the test sheet has no
    // data for yet - this is score-only until that data exists.
    decision: ITestersDashboardReleaseHealthDecision;
}

// Mirrors backend's TrustScoreWeights - the weight (0-1) each Trust Score
// component carries for the current typeBranch, driven by the same table
// backend's calculateTrustScore scores with, so these labels can't drift
// from the actual scoring math. A_dom is null only for the 'Static' branch
// (not part of its weight table at all - Static's fixed 35/20/15/15/15
// table has no Dynamic Accuracy slot to redistribute).
export interface ITestersDashboardTrustScoreWeights {
    A_sci: number;
    A_dom: number | null;
    S_lnk: number;
    Q_frm: number;
    Q_trn: number;
    S_sla: number;
}

// Mirrors backend's KpiSummary (testers-dashboard/backend/testersDashboard/kpis.ts)
export interface ITestersDashboardKpiSummary {
    N: number;
    trustScore: number;
    trustBreakdown: {
        A_sci: number;
        // Null when all 3 domains (Weather/Mandi Prices/Government Schemes)
        // have zero applicable rows (e.g. filtered to the Static branch) -
        // excluded from Trust Score's weighted average in that case, its
        // 30% weight redistributed across the other 5 components, rather
        // than defaulted to a misleading 100%. Render "No data", not "null%".
        A_dom: number | null;
        S_lnk: number;
        Q_frm: number;
        Q_trn: number;
        S_sla: number;
        weights: ITestersDashboardTrustScoreWeights;
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
    scientificAccuracyApplicableCount: number;
    scientificAccuracyAllRows: number;
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
    // Executive Summary's "Critical Defects" tile: (Critical + High severity
    // rows) ÷ N (ALL rows, including rows with no severity recorded) × 100 -
    // a separate, wider metric from criticalBreakdown.countCriticalBugs
    // above (Critical only), which still feeds Release Health's Critical
    // Defect Health sub-metric unchanged.
    criticalDefectsPct: number;
    criticalDefectsCriticalCount: number;
    criticalDefectsHighCount: number;
    criticalDefectsNoSeverityCount: number;
    // Critical Failures card v2 (Failures/Successes tabs) - mirrors backend's
    // CriticalFailureCategoriesResult (kpis.ts).
    criticalFailureCategories: {
        categories: {
            key: string;
            label: string;
            successLabel: string;
            failureCount: number;
            successCount: number;
            // Rows where this category's underlying field(s) actually had a
            // recorded (non-blank/NA) value - see backend's
            // CriticalFailureCategory (kpis.ts) for why this isn't always
            // failureCount + successCount. Optional (not just `number`)
            // defensively - the backend always populates it today, but this
            // crosses a network boundary (an API response, possibly served
            // from a stale cache or an older backend build during a
            // mid-deploy version skew), so the type shouldn't promise more
            // than a TS type can actually guarantee at runtime. Render
            // accordingly - see AdditionalMetrics.tsx.
            applicableCount?: number;
        }[];
        failuresTotal: number;
        successesTotal: number;
        distinctFailureRows: number;
        distinctSuccessRows: number;
    };
    releaseHealth: number;
    // Mirrors backend's ReleaseHealthResult - the 6-bucket weighted model
    // (25/20/20/15/10/10%) replacing the old Pass Rate - Critical Defect
    // Rate - Data Integrity Rate formula.
    releaseHealthBreakdown: ITestersDashboardReleaseHealthResult;
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
    // countCriticalBugs's definition) - kept for API completeness, but no
    // longer what the "Critical Defects" tile's trend arrow compares
    // against (see criticalDefectsPct below).
    countCriticalBugs: number;
    // (Critical + High) ÷ total × 100 for the previous period - what the
    // "Critical Defects" tile's trend arrow actually compares against, so
    // it's percentage-vs-percentage, Critical+High-vs-Critical+High.
    criticalDefectsPct: number;
    notificationSuccess: number;
    voiceSuccess: number;
    rangeLabel: string;
}

// Mirrors backend's AceModuleSubMetric
// (testers-dashboard/backend/testersDashboard/diagnostics.ts)
export interface ITestersDashboardAceModuleSubMetric {
    key: string;
    label: string;
    // Null when this sub-metric had zero applicable (non-blank/NA, per its
    // own scoping) rows - skipped from the module's overallScore average
    // entirely server-side, never treated as a 0.
    value: number | null;
    applicable: number;
}

// Mirrors backend's AceModuleEntry - one of the 6 ACE modules (Farmer
// Interaction, Agri Advisory, Knowledge & GDB, Dynamic Advisory,
// Multilingual & Voice, Communication & Notifications), each scored from its
// own related columns rather than a Type-of-Question row grouping.
export interface ITestersDashboardAceModuleEntry {
    key: string;
    label: string;
    subMetrics: ITestersDashboardAceModuleSubMetric[];
    // Distinct rows applicable to at least one of this module's sub-metrics
    // - what MIN_ROWS_FOR_WEAKEST_MODULE eligibility is gated on server-side.
    applicableRowCount: number;
    eligible: boolean;
    overallScore: number | null;
    // The 1-2 lowest-scoring applicable sub-metrics behind overallScore, by
    // label - genuinely derived from this module's own numbers server-side,
    // not hardcoded here.
    weakestMetricLabels: string[];
}

// Mirrors backend's AceComingSoonModule - one of modules 8-10 (Review &
// Quality, Farmer Context, ACE Platform & Integrations), built but not yet
// scoreable with the sheet's current columns. No score/row-count fields -
// the card renders these as "Coming soon" instead.
export interface ITestersDashboardComingSoonModule {
    key: string;
    label: string;
}

// Mirrors backend's DiagnosticsResult
// (testers-dashboard/backend/testersDashboard/diagnostics.ts)
export interface ITestersDashboardDiagnostics {
    stageStats: { name: string; avg: number }[];
    bottleneckName: string;
    bottleneckTime: number;
    // All 6 ACE modules in the fixed ACE_MODULE_KEYS order - NOT sorted by
    // score. weakestModule below is independent of this array's order.
    modulePerformance: ITestersDashboardAceModuleEntry[];
    // Modules 8-10, unscored - rendered after modulePerformance as "Coming
    // soon", never eligible/considered for weakestModule.
    comingSoonModules: ITestersDashboardComingSoonModule[];
    weakestModule: string;
    weakestModuleRowCount: number;
    // The weakest eligible module's overallScore - the headline number the
    // Weakest Module card shows.
    weakestModuleScore: number | null;
    // The weakest eligible module's weakestMetricLabels - kept for API
    // completeness, but the card's headline text no longer reads from this
    // (it shows a fixed methodology explanation instead, the same for every
    // module - see TestersDashboard.tsx).
    weakestModuleReason: string[];
    criticalDefectCount: number;
    // Critical/High severity only - feeds the "Critical Defect Tickets" card
    // view's Open/Closed/On Hold/Escalated tabs.
    openTickets: { id: string; url: string; severity: string }[];
    // Every linked ticket regardless of severity or status - feeds the
    // card's "All Tickets" view alone. Superset of openTickets.
    allTickets: { id: string; url: string; severity: string }[];
}

// Mirrors backend's ChartData
// (testers-dashboard/backend/testersDashboard/chartData.ts)
export interface ITestersDashboardScoreTrendPoint {
    date: string;
    trust: number;
    // False when this day has no real applicable data behind Trust Score
    // (A_dom is null, excluded, on a day with none; every other sub-metric
    // falls back to a genuine 0) - the chart nulls out `trust` for these
    // points so the line renders a gap instead of a misleading flat 0.
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

// Mirrors backend's ChannelPerformanceStat/LanguagePerformanceStat
// (testers-dashboard/backend/testersDashboard/kpis.ts) - the Channel-wise
// Performance / Language Performance cards, computed server-side over the
// same filtered row set as kpis/diagnostics/chartData above (including the
// Dynamic/Static tree filter), no longer as a separate client-side calc.
export interface ITestersDashboardChannelStat {
    channel: string;
    tests: number;
    passRate: number;
    avgResponse: number;
}

export interface ITestersDashboardLanguageStat {
    language: string;
    tests: number;
    translationAcc: number;
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
    channelStats: ITestersDashboardChannelStat[];
    languageStats: ITestersDashboardLanguageStat[];
}

export class TestersDashboardSummaryService {
    private _baseUrl = `${API_BASE_URL}/dashboard/testers`;

    async getSummary(query: ITestersDashboardSummaryQuery): Promise<ITestersDashboardSummaryResponse> {
        const params = new URLSearchParams();
        if (query.source) params.append("source", query.source);
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
