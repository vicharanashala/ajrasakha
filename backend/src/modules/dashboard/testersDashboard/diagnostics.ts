// Diagnostics for the Testers Dashboard - Biggest Bottleneck (TAT stage
// averages), Overall Module Performance / Weakest Module (6 buckets: GDB,
// Unique Questions, Outreach, and Dynamic's Weather/Mandi Prices/Government
// Schemes sub-types competing directly, not nested under a separate
// Dynamic-as-a-whole entry), and the Open Critical Defects ticket list.
//
// Ported near-verbatim from frontend/src/features/testersDashboard/TestersDashboard.tsx
// (Phase 4 of moving KPI/diagnostics/chart calculation server-side - see
// normalize.ts (Phase 1), filters.ts (Phase 2), and kpis.ts (Phase 3), which
// this composes rather than duplicates).
//
// This ports the CURRENT frontend versions of moduleGroupFor and
// dynamicSubBucketFor, which already include two fixes landed directly in
// the frontend earlier:
//   - moduleGroupFor matches any Type of Question value containing
//     "dynamic" (case-insensitive), not just the exact string "Dynamic" -
//     this is what correctly buckets Test Log 2.0's "WEATHER DYNAMIC" /
//     "MANDI DYNAMIC" / "SCHEME DYNAMIC" rows (~550 rows that an exact-match
//     check was previously silently excluding). "STATIC DYNAMIC" rows are
//     deliberately excluded from this "contains dynamic" match (see
//     moduleGroupFor below) - per Hemanth's later confirmation ("You can
//     remove static dynamic category"), they don't belong in the plain
//     Dynamic bucket either, so they're routed to null/unmatched instead.
//   - dynamicSubBucketFor falls back to reading the sub-bucket signal
//     directly from Type of Question when Question Category doesn't
//     resolve it - Test Log 2.0 rows often leave Question Category
//     blank/unclear but carry the sub-bucket in Type of Question instead
//     (e.g. "WEATHER DYNAMIC" -> Weather).
//
// Deliberately excludes live Zoho ticket-status matching - that stays a
// frontend-only concern (it calls a separate Zoho endpoint on a timer).
// This only ports "which tickets exist and what's their severity."

import type { TestersDashboardRecord } from '../interfaces/ITestersDashboardService.js';
import {
    timeToMinutes,
    pct,
    matchesAny,
    normalize,
    isNAlike,
    isYes,
    normalizeTestStatus,
    normalizeDefectSeverity,
    normalizeTypeOfQuestion,
    translationQualityPct,
    calculateSlaCompliance,
    calculateVoiceSuccess,
    calculateNotificationExperience,
} from './normalize.js';

export interface TatStage {
    name: string;
    key: string;
}

// Column order matches the frontend's Biggest Bottleneck card.
export const TAT_STAGES: TatStage[] = [
    { name: 'Authoring', key: 'Author TAT (mins) [Auto]' },
    { name: 'Review 1', key: 'Review1 TAT (mins) [Auto]' },
    { name: 'Review 2', key: 'Review2 TAT (mins) [Auto]' },
    { name: 'Review 3', key: 'Review3 TAT (mins) [Auto]' },
    { name: 'Review 4', key: 'Review4 TAT (mins) [Auto]' },
    { name: 'Review 5', key: 'Review5 TAT (mins) [Auto]' },
    { name: 'Moderator', key: 'Moderator TAT (mins) [Auto]' },
];

export type ModuleGroup = 'GDB' | 'Dynamic' | 'Unique Questions' | 'Outreach';
export type DynamicSubBucket = 'Weather' | 'Mandi Prices' | 'Government Schemes';

// Maps a row's Type of Question into one of the four top-level Weakest
// Module buckets. GDP/Dynmic/Uniuqe typos are already collapsed by
// normalizeTypeOfQuestion() above, so this only needs to match the
// canonical spellings. "Quality Checking" isn't mapped to any bucket yet -
// pending clarification from Hemanth/team. Returning null for unmapped
// values keeps them out of the buckets rather than silently mis-grouping
// them.
//
// Test Log 2.0 introduced compound Type of Question values ("WEATHER
// DYNAMIC", "MANDI DYNAMIC", "SCHEME DYNAMIC", "STATIC DYNAMIC") that
// normalizeTypeOfQuestion() title-cases but doesn't collapse to plain
// "Dynamic". Matching "contains dynamic" (case-insensitive) catches the
// WEATHER/MANDI/SCHEME_DYNAMIC compound values and the plain "Dynamic"/
// "Dynmic" rows alike - an exact `=== "Dynamic"` check was previously
// silently excluding all ~550 of the compound-value rows.
//
// "STATIC DYNAMIC" is a deliberate exception to that "contains dynamic"
// match: Hemanth first had it promoted to its own top-level module, then
// later explicitly reversed that ("You can remove static dynamic
// category") - so rather than falling into the general Dynamic bucket (its
// value DOES contain the substring "dynamic") or keeping its own bucket, it
// must return null here, same as any other unrecognized value. This check
// has to run before the general "contains dynamic" check below, since that
// substring also matches "static dynamic" - without this exclusion, static
// dynamic rows would silently get absorbed into plain Dynamic instead of
// being excluded from every module entirely. The rows themselves are not
// dropped or reassigned anywhere upstream (normalizeTypeOfQuestion,
// applyNonDateFilters, N/total counts) - they simply form no ModuleGroup,
// so Weakest Modules shows their absence rather than a phantom bucket.
export function moduleGroupFor(typeOfQuestion?: string): ModuleGroup | null {
    const t = normalizeTypeOfQuestion(typeOfQuestion);
    if (t === 'GDB') return 'GDB';
    if (t.toLowerCase().includes('static dynamic')) return null;
    if (t.toLowerCase().includes('dynamic')) return 'Dynamic';
    if (t === 'Unique') return 'Unique Questions';
    if (t === 'Outreach') return 'Outreach';
    return null;
}

// Maps a Dynamic-type row into one of Dynamic's three sub-buckets: Weather,
// Mandi Prices, and Government Schemes. Static Dynamic rows never reach
// this function - moduleGroupFor already excludes them (returns null)
// before this is called, so they can't leak in through the Dynamic bucket
// either. "Market information" and "Sowing time & weather" are folded
// into their closest obvious parent (Mandi Prices / Weather) as a working
// default - flag to Nandan if these should be kept separate instead.
//
// Question Category (Sheet 1.0's signal) is checked first and is
// unchanged. Test Log 2.0 rows often leave Question Category blank/unclear
// but carry the sub-bucket directly in Type of Question instead (e.g.
// "WEATHER DYNAMIC" -> Weather) - typeOfQuestion is only consulted as a
// fallback when category didn't already resolve to a bucket, so Sheet
// 1.0's existing behavior is untouched.
export function dynamicSubBucketFor(category?: string, typeOfQuestion?: string): DynamicSubBucket | null {
    const c = normalize(category);
    if (c) {
        if (c.includes('climate') || c.includes('weather')) return 'Weather';
        if (c.includes('market')) return 'Mandi Prices';
        if (c.includes('scheme')) return 'Government Schemes';
    }

    const t = normalize(typeOfQuestion);
    if (t) {
        if (t.includes('weather')) return 'Weather';
        if (t.includes('mandi') || t.includes('market')) return 'Mandi Prices';
        if (t.includes('scheme')) return 'Government Schemes';
    }

    return null;
}

// Require a minimum sample size before a bucket is eligible to "win" the
// weakest-module title - otherwise a bucket with just 1-2 rows can look
// artificially bad purely by chance, not because it's a meaningful signal
// at that sample size.
export const MIN_ROWS_FOR_WEAKEST_MODULE = 10;

export interface TatStageStat {
    name: string;
    avg: number;
}

export interface OpenTicket {
    id: string;
    url: string;
    severity: string;
}

// Overall Module Performance - replaces the old single-metric ("Answer
// Scientifically Correct?" only, ÷ all rows including blank/NA - a real,
// unfixed NA-exclusion bug the rest of this codebase's other metrics had
// already been fixed for) Weakest Module logic with an 8-sub-metric blend,
// validated against live data before this was wired in (see this session's
// prototype investigation). Dynamic is no longer a single competing bucket
// - per that investigation's finding, blending Weather/Mandi
// Prices/Government Schemes together hid Mandi Prices' real weakness behind
// Weather and Government Schemes' much stronger numbers - so the 3 Dynamic
// sub-types compete directly alongside GDB/Unique Questions/Outreach, 6
// buckets total, not 4.
export type ModulePerformanceBucket =
    | 'GDB'
    | 'Unique Questions'
    | 'Outreach'
    | 'Dynamic - Weather'
    | 'Dynamic - Mandi Prices'
    | 'Dynamic - Government Schemes';

export const MODULE_PERFORMANCE_BUCKETS: ModulePerformanceBucket[] = [
    'GDB',
    'Unique Questions',
    'Outreach',
    'Dynamic - Weather',
    'Dynamic - Mandi Prices',
    'Dynamic - Government Schemes',
];

// Domain Accuracy's single source field per bucket - deliberately NOT the
// blended 3-field average calculateTrustScore's A_dom uses at the
// whole-Dynamic level (that blend is what hid Mandi Prices' weakness).
// GDB/Unique Questions/Outreach have no entry here - Domain Accuracy is
// structurally not applicable to them, not merely absent data, so they
// never compute or average in this metric at all (see
// buildModulePerformanceEntry below).
const MODULE_PERFORMANCE_DOMAIN_FIELD: Partial<Record<ModulePerformanceBucket, string>> = {
    'Dynamic - Weather': 'Weather Q Answered Correctly?',
    'Dynamic - Mandi Prices': 'Mandi Price Q Correct?',
    'Dynamic - Government Schemes': 'Scheme Q Correct?',
};

export interface ModulePerformanceMetric {
    value: number;
    // Row count the metric's own denominator was computed over - NOT
    // necessarily the bucket's total row count, since every metric here
    // (except Critical Failure Rate) excludes blank/NA rows from its own
    // denominator. Reported alongside value so a metric backed by a thin
    // sample is visibly distinguishable from one backed by most of the
    // bucket.
    applicable: number;
}

// One label per metric, used both for display and to derive
// weakestMetricLabels below - kept as a single ordered list so the pairing
// between a metric's key and its display label can't drift apart.
const MODULE_PERFORMANCE_METRIC_LABELS: { key: keyof ModulePerformanceMetrics; label: string }[] = [
    { key: 'passRate', label: 'Pass Rate' },
    { key: 'scientificAccuracy', label: 'Scientific Accuracy' },
    { key: 'domainAccuracy', label: 'Domain Accuracy' },
    { key: 'translationQuality', label: 'Translation Quality' },
    { key: 'voicePerformance', label: 'Voice Performance' },
    { key: 'slaCompliance', label: 'SLA Compliance' },
    { key: 'notificationExperience', label: 'Notification Experience' },
    { key: 'criticalFailureRate', label: 'Critical Failure Rate' },
];

interface ModulePerformanceMetrics {
    passRate: ModulePerformanceMetric | null;
    scientificAccuracy: ModulePerformanceMetric | null;
    domainAccuracy: ModulePerformanceMetric | null;
    translationQuality: ModulePerformanceMetric | null;
    voicePerformance: ModulePerformanceMetric | null;
    slaCompliance: ModulePerformanceMetric | null;
    notificationExperience: ModulePerformanceMetric | null;
    criticalFailureRate: ModulePerformanceMetric | null;
}

export interface ModulePerformanceEntry extends ModulePerformanceMetrics {
    bucket: ModulePerformanceBucket;
    totalRows: number;
    eligible: boolean;
    // Average of only the metrics with real applicable data for this bucket
    // - a metric that's null (zero applicable rows, or structurally not
    // applicable like Domain Accuracy on non-Dynamic buckets) is skipped
    // entirely, never treated as a 0. Null only when NO metric had any
    // applicable data at all (degenerate/empty bucket).
    overallScore: number | null;
    // How many of the 8 metrics actually fed into overallScore - lets a
    // consumer tell a score built from a full 8-metric blend apart from one
    // built from only 6 or 7 (e.g. GDB/Unique Questions/Outreach always
    // exclude Domain Accuracy, so they max out at 7).
    metricsUsedCount: number;
    // The 1-2 lowest-scoring applicable metrics behind overallScore, by
    // label - genuinely derived by ranking this bucket's own applicable
    // metric values, not a hardcoded guess, so it stays correct as the live
    // data shifts. Empty only when overallScore is null.
    weakestMetricLabels: string[];
}

function metricOrNull(value: number, applicable: number): ModulePerformanceMetric | null {
    return applicable ? { value, applicable } : null;
}

// Computes all 8 Overall Module Performance sub-metrics for one bucket's
// rows, then averages whichever ones have real applicable data into
// overallScore. Reuses the exact same shared formulas the rest of the
// dashboard already uses for Translation Quality/Voice Performance/SLA
// Compliance/Notification Experience (translationQualityPct/
// calculateVoiceSuccess/calculateSlaCompliance/calculateNotificationExperience,
// all in normalize.ts) rather than re-deriving them - see normalize.ts's
// header comment for why those 4 live there now. Pass Rate/Scientific
// Accuracy/Critical Failure Rate mirror kpis.ts's own inline formulas
// (calculateKpis' totalPassed/totalFailed/passRate, calculateTrustScore's
// A_sci, calculateKpis' criticalDefectRate) - not extracted into shared
// functions since kpis.ts never exposed them as standalone functions to
// begin with.
export function buildModulePerformanceEntry(bucket: ModulePerformanceBucket, rows: TestersDashboardRecord[]): ModulePerformanceEntry {
    const totalRows = rows.length;
    const eligible = totalRows >= MIN_ROWS_FOR_WEAKEST_MODULE;

    // Pass Rate - Pass ÷ (Pass + Fail), NA-excluded (Partial/NA/other
    // non-Pass/Fail statuses are excluded from the denominator, same as
    // calculateKpis' passRate).
    const passedCount = rows.filter((r) => normalizeTestStatus(r['Overall Test Status']) === 'Pass').length;
    const failedCount = rows.filter((r) => normalizeTestStatus(r['Overall Test Status']) === 'Fail').length;
    const passRate = metricOrNull(pct(passedCount, passedCount + failedCount), passedCount + failedCount);

    // Scientific Accuracy - Correct ÷ Applicable (non-blank), same formula
    // as calculateTrustScore's A_sci.
    const sciApplicable = rows.filter((r) => !isNAlike(r['Answer Scientifically Correct?']));
    const scientificAccuracy = metricOrNull(
        pct(sciApplicable.filter((r) => matchesAny(r['Answer Scientifically Correct?'], ['correct'])).length, sciApplicable.length),
        sciApplicable.length,
    );

    // Domain Accuracy - single-field only, scoped per bucket (see
    // MODULE_PERFORMANCE_DOMAIN_FIELD above). Structurally not applicable
    // to GDB/Unique Questions/Outreach - domainField is undefined for
    // those, so this metric is skipped entirely (stays null), never
    // computed against 0 or defaulted to any value.
    const domainField = MODULE_PERFORMANCE_DOMAIN_FIELD[bucket];
    let domainAccuracy: ModulePerformanceMetric | null = null;
    if (domainField) {
        const domainApplicable = rows.filter((r) => !isNAlike(r[domainField]));
        domainAccuracy = metricOrNull(
            pct(domainApplicable.filter((r) => isYes(r[domainField])).length, domainApplicable.length),
            domainApplicable.length,
        );
    }

    // Translation Quality - shared formula (normalize.ts).
    const translation = translationQualityPct(rows);
    const translationQuality = metricOrNull(translation.pct, translation.applicable);

    // Voice Performance - calculateVoiceSuccess()'s blended 0-10 score,
    // converted to a percentage (score ÷ 10 × 100), applicable = combined
    // input+output reading count.
    const voice = calculateVoiceSuccess(rows);
    const voicePerformance = metricOrNull(Math.round((voice.score / 10) * 1000) / 10, voice.sampleSize);

    // SLA Compliance - calculateSlaCompliance(), scoped to this bucket's rows.
    const sla = calculateSlaCompliance(rows);
    const slaCompliance = metricOrNull(sla.withinSlaPct, sla.rows.length);

    // Notification Experience - calculateNotificationExperience() (the
    // fixed N_exp formula: all 3 conditions required, NA-excluded), scoped
    // to this bucket's rows.
    const notification = calculateNotificationExperience(rows);
    const notificationExperience = metricOrNull(notification.pct, notification.applicable);

    // Critical Failure Rate, converted positive - 100 minus the % of this
    // bucket's rows with Critical severity. Denominator is every row in the
    // bucket, NOT NA-scoped like the other 7 metrics - a blank Defect
    // Severity simply isn't Critical, same as calculateKpis'
    // criticalDefectRate. Never null for a non-empty bucket (unlike every
    // other metric here, its denominator can't be zero unless the bucket
    // itself is empty).
    const criticalCount = rows.filter((r) => normalizeDefectSeverity(r['Defect Severity']) === 'Critical').length;
    const criticalFailureRate = metricOrNull(totalRows ? 100 - pct(criticalCount, totalRows) : 0, totalRows);

    const metrics: ModulePerformanceMetrics = {
        passRate,
        scientificAccuracy,
        domainAccuracy,
        translationQuality,
        voicePerformance,
        slaCompliance,
        notificationExperience,
        criticalFailureRate,
    };

    // Overall Module Score = average of only the metrics with real
    // applicable data - skip true N/A metrics entirely (domainAccuracy on
    // GDB/Unique Questions/Outreach, or any metric with zero applicable
    // rows), never treat them as a 0.
    const scoreableEntries = MODULE_PERFORMANCE_METRIC_LABELS.filter(({ key }) => metrics[key] !== null).map(
        ({ key, label }) => ({ label, metric: metrics[key] as ModulePerformanceMetric }),
    );
    const overallScore = scoreableEntries.length
        ? Math.round((scoreableEntries.reduce((sum, { metric }) => sum + metric.value, 0) / scoreableEntries.length) * 10) / 10
        : null;

    // "Mainly affected by X [and Y]" - the lowest 1-2 applicable metrics by
    // value, genuinely derived from this bucket's own numbers (not a
    // hardcoded label per bucket), so it stays correct as the live data
    // shifts.
    const weakestMetricLabels = [...scoreableEntries]
        .sort((a, b) => a.metric.value - b.metric.value)
        .slice(0, 2)
        .map(({ label }) => label);

    return {
        bucket,
        totalRows,
        eligible,
        ...metrics,
        overallScore,
        metricsUsedCount: scoreableEntries.length,
        weakestMetricLabels,
    };
}

export interface DiagnosticsResult {
    stageStats: TatStageStat[];
    bottleneckName: string;
    bottleneckTime: number;
    // All 6 Overall Module Performance buckets, in the fixed
    // MODULE_PERFORMANCE_BUCKETS grouping order (GDB, Unique Questions,
    // Outreach, then Dynamic's 3 sub-types together) - NOT sorted by score.
    // Per Hemanth's confirmation, scattering Dynamic's 3 sub-types apart by
    // score made the breakdown list hard to scan; this is display order
    // only and is deliberately independent of weakestModule below, which
    // still picks the lowest-scoring eligible bucket regardless of where it
    // falls in this fixed order. Dynamic's 3 sub-types are first-class
    // entries here, not nested under a separate breakdown - see
    // ModulePerformanceBucket's own comment for why.
    modulePerformance: ModulePerformanceEntry[];
    weakestModule: ModulePerformanceBucket | 'None';
    weakestModuleRowCount: number;
    // The weakest eligible bucket's overallScore (0-100, or null if no
    // bucket is eligible) - the headline number the Weakest Module card
    // shows now, replacing the old Scientific-Accuracy-only percentage.
    weakestModuleScore: number | null;
    // The weakest eligible bucket's weakestMetricLabels - kept for callers
    // that want the specific sub-metric breakdown, but the card itself no
    // longer surfaces this in its headline text (per Hemanth's confirmation
    // it read as module-specific commentary rather than an explanation of
    // the method - replaced with a fixed, methodology-only line instead).
    weakestModuleReason: string[];
    // Total critical/high defects by severity, independent of whether a
    // ticket URL was logged - a critical defect with no ticket URL logged
    // yet still counts here (not silently treated as "no active defects").
    criticalDefectCount: number;
    openTickets: OpenTicket[];
}

// Biggest Bottleneck, Overall Module Performance / Weakest Module (6
// buckets), and the Open Critical Defects ticket list, all computed over the
// given (already filtered) rows.
export function calculateDiagnostics(rows: TestersDashboardRecord[]): DiagnosticsResult {
    const stageStats: TatStageStat[] = TAT_STAGES.map((stage) => {
        let sum = 0;
        let count = 0;
        rows.forEach((r) => {
            const mins = timeToMinutes(r[stage.key]);
            if (mins !== null) {
                sum += mins;
                count++;
            }
        });
        return { name: stage.name, avg: count ? sum / count : 0 };
    });

    let bottleneckName = 'None';
    let bottleneckTime = 0;
    stageStats.forEach((s) => {
        if (s.avg > bottleneckTime) {
            bottleneckTime = s.avg;
            bottleneckName = s.name;
        }
    });

    // Overall Module Performance: GDB/Unique Questions/Outreach bucket via
    // moduleGroupFor as before; Dynamic no longer forms its own bucket here
    // - it's immediately split into its 3 sub-types via dynamicSubBucketFor,
    // and those 3 compete directly as first-class buckets (see
    // ModulePerformanceBucket's comment for why). "Static Dynamic" rows,
    // and any Dynamic row whose sub-type dynamicSubBucketFor can't resolve,
    // never enter any of the 6 buckets - simply absent from Overall Module
    // Performance rather than forming their own entry or a phantom count,
    // same treatment moduleGroupFor/dynamicSubBucketFor already gave them.
    const moduleBuckets: Record<ModuleGroup, TestersDashboardRecord[]> = {
        GDB: [],
        Dynamic: [],
        'Unique Questions': [],
        Outreach: [],
    };
    rows.forEach((r) => {
        const group = moduleGroupFor(r['Type of Question']);
        if (group) moduleBuckets[group].push(r);
    });

    const dynamicSubBuckets: Record<DynamicSubBucket, TestersDashboardRecord[]> = {
        Weather: [],
        'Mandi Prices': [],
        'Government Schemes': [],
    };
    moduleBuckets['Dynamic'].forEach((r) => {
        const sub = dynamicSubBucketFor(r['Question Category'], r['Type of Question']);
        if (sub) dynamicSubBuckets[sub].push(r);
    });

    const modulePerformanceRowsByBucket: Record<ModulePerformanceBucket, TestersDashboardRecord[]> = {
        GDB: moduleBuckets['GDB'],
        'Unique Questions': moduleBuckets['Unique Questions'],
        Outreach: moduleBuckets['Outreach'],
        'Dynamic - Weather': dynamicSubBuckets['Weather'],
        'Dynamic - Mandi Prices': dynamicSubBuckets['Mandi Prices'],
        'Dynamic - Government Schemes': dynamicSubBuckets['Government Schemes'],
    };
    const modulePerformanceByBucket = Object.fromEntries(
        MODULE_PERFORMANCE_BUCKETS.map((bucket) => [bucket, buildModulePerformanceEntry(bucket, modulePerformanceRowsByBucket[bucket])]),
    ) as Record<ModulePerformanceBucket, ModulePerformanceEntry>;

    // Fixed grouping order (GDB, Unique Questions, Outreach, then Dynamic's
    // 3 sub-types together) - NOT sorted by score. Deliberately independent
    // of weakestModule below: that still picks the single lowest-scoring
    // eligible bucket via its own reduce over this same array, regardless
    // of where that bucket happens to fall in this fixed display order.
    const modulePerformance: ModulePerformanceEntry[] = MODULE_PERFORMANCE_BUCKETS.map((b) => modulePerformanceByBucket[b]);

    const weakestEntry = modulePerformance.reduce<ModulePerformanceEntry | null>((weakest, m) => {
        if (!m.eligible || m.overallScore === null) return weakest;
        if (!weakest || m.overallScore < weakest.overallScore!) return m;
        return weakest;
    }, null);
    const weakestModule: ModulePerformanceBucket | 'None' = weakestEntry ? weakestEntry.bucket : 'None';
    const weakestModuleRowCount = weakestEntry ? weakestEntry.totalRows : 0;
    const weakestModuleScore = weakestEntry ? weakestEntry.overallScore : null;
    const weakestModuleReason = weakestEntry ? weakestEntry.weakestMetricLabels : [];

    const criticalRows = rows.filter((r) => ['Critical', 'High'].includes(normalizeDefectSeverity(r['Defect Severity'])));
    const seenUrls = new Set<string>();
    const openTickets: OpenTicket[] = [];
    criticalRows.forEach((r) => {
        // The source sheet's header cell has a literal line break inside it
        // (likely from Alt+Enter in Google Sheets), which Node's csv-parser
        // preserves as an actual \n character in the column name.
        const url = (r['Defect ID / Bug Ref\nZoho Desk Ticketing'] || '').trim();
        if (url && url.toLowerCase().startsWith('http') && !seenUrls.has(url)) {
            seenUrls.add(url);
            openTickets.push({
                id: url.split('/').pop() || url,
                url,
                severity: normalizeDefectSeverity(r['Defect Severity']),
            });
        }
    });

    return {
        stageStats,
        bottleneckName,
        bottleneckTime,
        modulePerformance,
        weakestModule,
        weakestModuleRowCount,
        weakestModuleScore,
        weakestModuleReason,
        criticalDefectCount: criticalRows.length,
        openTickets,
    };
}
