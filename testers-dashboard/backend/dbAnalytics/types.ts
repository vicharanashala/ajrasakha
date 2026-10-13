// Response types for Database Logs Analytics' DB-native summary. Shaped like
// the dashboard cards' existing summary contract (frontend
// ITestersDashboardSummaryResponse) so the shared cards render it unchanged,
// but defined here rather than imported from the Google Sheet modules.

import type { DbFilterOptions } from '../services/dbFilterOptions.js';

export interface DbTrustScoreWeights {
    A_sci: number;
    A_dom: number | null;
    S_lnk: number;
    Q_frm: number;
    Q_trn: number;
    S_sla: number;
}

export interface DbTrustBreakdown {
    A_sci: number;
    // Null when no Weather/Mandi/Scheme entry has a recorded domain check.
    A_dom: number | null;
    S_lnk: number;
    Q_frm: number;
    Q_trn: number;
    S_sla: number;
    weights: DbTrustScoreWeights;
}

export interface DbExperienceBreakdown {
    S_rsp: number;
    S_sla: number;
    V_io: number;
    Q_trn: number;
    N_exp: number;
}

export interface DbVoiceSuccess {
    // 0-10 (10 = every recorded voice quality reading was good).
    score: number;
    sampleSize: number;
    inputAvg: number | null;
    inputCount: number;
    outputAvg: number | null;
    outputCount: number;
}

export interface DbCriticalFailureCategory {
    key: string;
    label: string;
    successLabel: string;
    failureCount: number;
    successCount: number;
    applicableCount: number;
    // Tester-entered Test IDs of the failing entries (entries without a
    // Test ID are counted but not listed). Never the MongoDB _id.
    failureTestIds: string[];
}

export interface DbCriticalFailureCategories {
    categories: DbCriticalFailureCategory[];
    failuresTotal: number;
    successesTotal: number;
    // Entries failing at least one category.
    distinctFailureRows: number;
    // Entries succeeding in at least one category.
    distinctSuccessRows: number;
    // Entries failing no category (N - distinctFailureRows) - the Critical
    // Failures card's "Successes" headline for DB Analytics.
    noFailureRows: number;
}

export interface DbReleaseHealthMetric {
    key: string;
    label: string;
    weight: number;
    value: number;
}

export interface DbReleaseHealthBucket {
    key: string;
    label: string;
    weight: number;
    score: number;
    metrics: DbReleaseHealthMetric[];
    // False when none of the bucket's metrics had applicable data - the
    // bucket then shows 0 and is left out of the overall score.
    hasData: boolean;
}

export type DbReleaseHealthDecision = 'GO' | 'GO_WITH_CONDITIONS' | 'NO_GO';

export interface DbReleaseHealth {
    score: number;
    buckets: DbReleaseHealthBucket[];
    decision: DbReleaseHealthDecision;
}

export interface DbSlaBreakdown {
    validRows: number;
    withinSlaCount: number;
    withinSlaPct: number;
    exceededSlaPct: number;
    breachedCount: number;
    breachedWithoutTimeCount: number;
    avgDelayMinutes: number;
}

export interface DbKpiSummary {
    N: number;
    trustScore: number;
    trustBreakdown: DbTrustBreakdown;
    experienceScore: number;
    experienceBreakdown: DbExperienceBreakdown;
    avgResponseMinutes: number;
    avgResponseSampleCount: number;
    totalTests: number;
    // Pass/Fail - see passFail() in kpis.ts for the rule.
    passRate: number;
    totalPassed: number;
    failRate: number;
    totalFailed: number;
    totalPartial: number;
    // Entries with a recorded Overall Test Status (the Pass/Fail denominator).
    statusRecordedCount: number;
    sciCorrectCount: number;
    scientificAccuracyApplicableCount: number;
    scientificAccuracyAllRows: number;
    voiceSuccess: DbVoiceSuccess;
    notificationSuccess: number;
    notificationSuccessOnTimeCount: number;
    notificationSuccessTotalCount: number;
    criticalDefectsPct: number;
    criticalDefectsCriticalCount: number;
    criticalDefectsHighCount: number;
    criticalDefectsApplicableCount: number;
    criticalDefectsNoSeverityCount: number;
    criticalFailureCategories: DbCriticalFailureCategories;
    releaseHealth: number;
    releaseHealthBreakdown: DbReleaseHealth;
    slaBreakdown: DbSlaBreakdown;
}

export interface DbPreviousPeriodStats {
    totalTests: number;
    passRate: number;
    failRate: number;
    avgResponseMinutes: number;
    scientificAccuracy: number;
    openCriticalDefects: number;
    countCriticalBugs: number;
    criticalDefectsPct: number;
    notificationSuccess: number;
    voiceSuccess: number;
    rangeLabel: string;
}

export interface DbChannelStat {
    channel: string;
    tests: number;
    passRate: number;
    avgResponse: number;
}

export interface DbLanguageStat {
    language: string;
    tests: number;
    translationAcc: number;
}

export interface DbTatStageStat {
    name: string;
    avg: number;
}

export interface DbAceSubMetric {
    key: string;
    label: string;
    value: number | null;
    applicable: number;
}

export interface DbAceModule {
    key: string;
    label: string;
    subMetrics: DbAceSubMetric[];
    applicableRowCount: number;
    eligible: boolean;
    overallScore: number | null;
    weakestMetricLabels: string[];
}

export interface DbTicket {
    id: string;
    url: string;
    severity: string;
}

export interface DbDiagnostics {
    stageStats: DbTatStageStat[];
    bottleneckName: string;
    bottleneckTime: number;
    modulePerformance: DbAceModule[];
    comingSoonModules: { key: string; label: string }[];
    weakestModule: string;
    weakestModuleRowCount: number;
    weakestModuleScore: number | null;
    weakestModuleReason: string[];
    criticalDefectCount: number;
    openTickets: DbTicket[];
    allTickets: DbTicket[];
}

export interface DbScoreTrendPoint {
    date: string;
    trust: number;
    trustHasData: boolean;
    experience: number;
    experienceHasData: boolean;
    avgLatency: number;
    avgLatencySampleCount: number;
    avgReviewTat: number;
    avgReviewTatSampleCount: number;
}

export interface DbChartData {
    scoreTrend: DbScoreTrendPoint[];
}

export interface DbAnalyticsSummaryResponse {
    success: boolean;
    // Which pipeline produced this response - always 'db-native' here.
    calculation: 'db-native';
    totalRecords: number;
    // Entries in the selected filters/date range (= kpis.N).
    matchedRecords: number;
    kpis: DbKpiSummary;
    diagnostics: DbDiagnostics;
    chartData: DbChartData;
    previousPeriodStats: DbPreviousPeriodStats | null;
    filterOptions: Record<string, string[]>;
    dbFilterOptions: DbFilterOptions;
    lastSyncedAt: string | null;
    channelStats: DbChannelStat[];
    languageStats: DbLanguageStat[];
    error?: string;
}
