// Diagnostics for the Testers Dashboard - Biggest Bottleneck (TAT stage
// averages), Overall Module Performance / Weakest Module (the 6 ACE modules
// below), and the ticket card's Critical Defect Tickets / All Tickets lists.
//
// openTickets/allTickets are the one exception to this file's usual
// "everything comes from `rows`" shape - they're built from the already-
// synced Zoho ticket cache (a separate `zohoTickets` param), NOT from
// `rows`, so they're deliberately unaffected by the dashboard's row filters
// (most Zoho tickets have no sheet row for those filters to apply to). Live
// Zoho ticket status/team matching is still a frontend-only concern.

import type { TestersDashboardRecord } from '../interfaces/ITestersDashboardService.js';
import type { ZohoTicketStatus } from '../interfaces/IZohoTicketStatusService.js';
import {
    timeToMinutes,
    pct,
    matchesAny,
    normalize,
    isNAlike,
    isYes,
    isScientificallyCorrect,
    isQuestionFramedApplicable,
    isQuestionWellFramed,
    isSourceLinkApplicable,
    isSourceLinkRelevant,
    normalizeDefectSeverity,
    normalizeTypeOfQuestion,
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
// Module buckets. "Quality Checking" isn't mapped to any bucket - returning
// null for unmapped values keeps them out rather than mis-grouping them.
//
// Matches "contains dynamic" (case-insensitive), not just the exact string
// "Dynamic", so compound values like "WEATHER DYNAMIC" bucket correctly.
// "Static Dynamic" is a deliberate exception, removed from the taxonomy
// entirely, so it must return null rather than falling into the general
// Dynamic bucket - this check has to run first since "static dynamic" also
// contains the substring "dynamic".
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
// Mandi Prices, and Government Schemes. Gates on EITHER
// moduleGroupFor(typeOfQuestion) === 'Dynamic', OR Type of Question being
// blank/empty - a row has to genuinely BE Dynamic-typed, OR never have had a
// Type of Question tag at all, before its Category/Type text is consulted.
//
// The blank-type fallback exists because Sheet 1.0-era rows predate the
// Type of Question column entirely but still carry a genuine domain-matching
// Question Category and query text. It is deliberately NOT relaxed for any
// other null-returning Type of Question (GDB/Unique/Outreach/Static
// Dynamic/Quality Checking) - those are cross-contamination leaks, where a
// single Dynamic-typed test row gets a value written into all 3
// domain-correctness columns regardless of relevance, so a GDB/Outreach-typed
// row with a real Weather value is a leak, not a genuine weather answer, and
// must stay excluded.
//
// This is also what keeps the standalone Dynamic sub-type filter (filters.ts)
// consistent with the whole-branch Dynamic filter, which matches this same
// function returning non-null - do not remove this gate without updating both.
//
// Question Category is checked first, falling back to Type of Question when
// category doesn't resolve a bucket (e.g. "WEATHER DYNAMIC" -> Weather).
export function dynamicSubBucketFor(category?: string, typeOfQuestion?: string): DynamicSubBucket | null {
    const isBlankType = !(typeOfQuestion || '').trim();
    if (moduleGroupFor(typeOfQuestion) !== 'Dynamic' && !isBlankType) return null;

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

// Rows eligible for Scientific Accuracy scoring: any row with a recognized
// Type of Question (GDB, Unique, Outreach, or Dynamic). Shared by Trust
// Score's A_sci (kpis.ts), Agri Advisory, and Knowledge & GDB's Scientific
// Accuracy sub-metric below, so the three scopes can't drift apart.
export function isScientificAccuracyEligible(typeOfQuestion?: string): boolean {
    return moduleGroupFor(typeOfQuestion) !== null;
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

// Overall Module Performance / Weakest Module: the 6 ACE modules below, each
// scored from its own related columns. The business module list numbers
// 1-10, but only 1-6 are built here - see calculateAceModulePerformance's
// comment for why 7-10 are left out (module 7 doesn't exist at all; modules
// 8-10 are ACE_COMING_SOON_MODULES below, unscored rather than hidden).
export type AceModuleKey =
    | 'farmer_interaction'
    | 'agri_advisory'
    | 'knowledge_gdb'
    | 'dynamic_advisory'
    | 'multilingual_voice'
    | 'communication_notifications';

// Fixed display/computation order, not sorted by score - see
// DiagnosticsResult.modulePerformance.
export const ACE_MODULE_KEYS: AceModuleKey[] = [
    'farmer_interaction',
    'agri_advisory',
    'knowledge_gdb',
    'dynamic_advisory',
    'multilingual_voice',
    'communication_notifications',
];

export type AceComingSoonModuleKey = 'review_quality' | 'farmer_context' | 'ace_platform_integrations';

export interface AceComingSoonModule {
    key: AceComingSoonModuleKey;
    label: string;
}

// Modules 8-10 of the business's 10-module list (module 7 doesn't exist) -
// never scoreable with the sheet's current columns, so the Weakest Modules
// card lists them as "Coming soon" instead of hiding them. Never eligible
// for weakestModule (calculateDiagnostics only reduces over
// modulePerformance, not this list).
export const ACE_COMING_SOON_MODULES: AceComingSoonModule[] = [
    { key: 'review_quality', label: 'Review & Quality' },
    { key: 'farmer_context', label: 'Farmer Context' },
    { key: 'ace_platform_integrations', label: 'ACE Platform & Integrations' },
];

export interface AceModuleSubMetric {
    key: string;
    label: string;
    // Null when this sub-metric had zero applicable (non-blank/NA, per its
    // own scoping) rows - skipped from the module's overallScore average
    // entirely, never treated as a 0.
    value: number | null;
    // Row count this sub-metric's own denominator was computed over - not
    // necessarily the same rows another sub-metric in this module used
    // (e.g. Multilingual & Voice's 5 sub-metrics each read a different
    // column, blank on different subsets of rows).
    applicable: number;
}

export interface AceModuleEntry {
    key: AceModuleKey;
    label: string;
    subMetrics: AceModuleSubMetric[];
    // Distinct rows applicable to at least one of this module's sub-metrics -
    // each sub-metric scopes to its own column/rows, so there's no single
    // "the module's rows"; this union is what MIN_ROWS_FOR_WEAKEST_MODULE
    // gates eligibility on.
    applicableRowCount: number;
    eligible: boolean;
    // Average of only the sub-metrics with real applicable data - null only
    // when no sub-metric had any applicable data at all.
    overallScore: number | null;
    // The 1-2 lowest-scoring applicable sub-metrics behind overallScore, by
    // label - derived by ranking, not a hardcoded guess. Empty only when
    // overallScore is null.
    weakestMetricLabels: string[];
}

interface AceSubMetricInput {
    key: string;
    label: string;
    // Pre-filtered to this sub-metric's own applicable rows - the caller
    // decides applicability, since it varies per sub-metric.
    applicableRows: TestersDashboardRecord[];
    isPositive: (r: TestersDashboardRecord) => boolean;
}

function buildAceModule(key: AceModuleKey, label: string, subMetricInputs: AceSubMetricInput[]): AceModuleEntry {
    const subMetrics: AceModuleSubMetric[] = subMetricInputs.map(({ key: mKey, label: mLabel, applicableRows, isPositive }) => ({
        key: mKey,
        label: mLabel,
        value: applicableRows.length ? pct(applicableRows.filter(isPositive).length, applicableRows.length) : null,
        applicable: applicableRows.length,
    }));

    // Union of rows applicable to at least one sub-metric.
    const applicableRowSet = new Set<TestersDashboardRecord>();
    subMetricInputs.forEach(({ applicableRows }) => applicableRows.forEach((r) => applicableRowSet.add(r)));
    const applicableRowCount = applicableRowSet.size;
    const eligible = applicableRowCount >= MIN_ROWS_FOR_WEAKEST_MODULE;

    const scoreable = subMetrics.filter((m): m is AceModuleSubMetric & { value: number } => m.value !== null);
    const overallScore = scoreable.length
        ? Math.round((scoreable.reduce((sum, m) => sum + m.value, 0) / scoreable.length) * 10) / 10
        : null;

    // "Mainly affected by X [and Y]" - the lowest 1-2 applicable sub-metrics
    // by value, not a hardcoded label per module.
    const weakestMetricLabels = [...scoreable].sort((a, b) => a.value - b.value).slice(0, 2).map((m) => m.label);

    return { key, label, subMetrics, applicableRowCount, eligible, overallScore, weakestMetricLabels };
}

// Computes all 6 ACE modules over the given (already filtered) rows. The
// business module list numbers 1-10; modules 7-10 are deliberately NOT built
// here, pending clarification:
//  - Module 7 is missing from the business list entirely (numbering jumps
//    6 straight to 8).
//  - Module 8 (Review & Quality): the sheet only has Review TAT (speed, not
//    quality) and Expert Name - nothing measures review quality itself yet.
//  - Module 9 (Farmer Context): no columns exist for farmer profile,
//    location, crop, or season.
//  - Module 10 (ACE Platform & Integrations): the DB-save/Q-ID columns
//    measure test-time data storage, not API/platform health, so they are
//    not a valid proxy for this module.
export function calculateAceModulePerformance(rows: TestersDashboardRecord[]): AceModuleEntry[] {
    // 1. Farmer Interaction - Question Correctly Framed?
    const farmerInteraction = buildAceModule('farmer_interaction', 'Farmer Interaction', [
        {
            key: 'question_framed',
            label: 'Question Correctly Framed',
            applicableRows: rows.filter((r) => isQuestionFramedApplicable(r['Question Correctly Framed?'])),
            isPositive: (r) => isQuestionWellFramed(r['Question Correctly Framed?']),
        },
    ]);

    // 2. Agri Advisory - Answer Scientifically Correct?, scoped via
    // isScientificAccuracyEligible - same scoping and "correct" definition
    // (isScientificallyCorrect) as Trust Score's own A_sci (kpis.ts).
    const agriAdvisory = buildAceModule('agri_advisory', 'Agri Advisory', [
        {
            key: 'scientific_accuracy_static',
            label: 'Scientific Accuracy',
            applicableRows: rows.filter(
                (r) => isScientificAccuracyEligible(r['Type of Question']) && !isNAlike(r['Answer Scientifically Correct?']),
            ),
            isPositive: (r) => isScientificallyCorrect(r['Answer Scientifically Correct?']),
        },
    ]);

    // 3. Knowledge & GDB - Correct Source Links (same isSourceLinkApplicable/
    // isSourceLinkRelevant matching as Trust Score's S_lnk) averaged with
    // Scientific Accuracy, using the same scoping and match rule as Agri
    // Advisory/A_sci so the three can't drift apart.
    const knowledgeGdb = buildAceModule('knowledge_gdb', 'Knowledge & GDB', [
        {
            key: 'correct_source_links',
            label: 'Correct Source Links',
            applicableRows: rows.filter((r) => isSourceLinkApplicable(r['Correct Source Links Provided?'])),
            isPositive: (r) => isSourceLinkRelevant(r['Correct Source Links Provided?']),
        },
        {
            key: 'scientific_accuracy_gdb',
            label: 'Scientific Accuracy',
            applicableRows: rows.filter(
                (r) => isScientificAccuracyEligible(r['Type of Question']) && !isNAlike(r['Answer Scientifically Correct?']),
            ),
            isPositive: (r) => isScientificallyCorrect(r['Answer Scientifically Correct?']),
        },
    ]);

    // 4. Dynamic Advisory - Weather/Mandi/Scheme accuracy, each scoped to its
    // own Question Category bucket via dynamicSubBucketFor (same scoping as
    // Trust Score's A_dom in kpis.ts). A sub-metric with zero applicable rows
    // is skipped from the average rather than defaulting to 100.
    const domainApplicableRows = (bucket: DynamicSubBucket, field: string) => {
        const bucketRows = rows.filter((r) => dynamicSubBucketFor(r['Question Category'], r['Type of Question']) === bucket);
        return bucketRows.filter((r) => !isNAlike(r[field]));
    };
    const dynamicAdvisory = buildAceModule('dynamic_advisory', 'Dynamic Advisory', [
        {
            key: 'weather_accuracy',
            label: 'Weather Accuracy',
            applicableRows: domainApplicableRows('Weather', 'Weather Q Answered Correctly?'),
            isPositive: (r) => isYes(r['Weather Q Answered Correctly?']),
        },
        {
            key: 'mandi_accuracy',
            label: 'Mandi Accuracy',
            applicableRows: domainApplicableRows('Mandi Prices', 'Mandi Price Q Correct?'),
            isPositive: (r) => isYes(r['Mandi Price Q Correct?']),
        },
        {
            key: 'scheme_accuracy',
            label: 'Scheme Accuracy',
            applicableRows: domainApplicableRows('Government Schemes', 'Scheme Q Correct?'),
            isPositive: (r) => isYes(r['Scheme Q Correct?']),
        },
    ]);

    // 5. Multilingual & Voice - Translation Quality (mirrors
    // translationQualityPct's ['correct','good'] definition) averaged with
    // Voice Input/Output Quality (Clear-only, stricter than
    // calculateVoiceSuccess's 0-10 scale) and Voice Input/Output Working.
    const multilingualVoice = buildAceModule('multilingual_voice', 'Multilingual & Voice', [
        {
            key: 'translation_quality',
            label: 'Translation Quality',
            applicableRows: rows.filter((r) => !isNAlike(r['Translation Quality'])),
            isPositive: (r) => matchesAny(r['Translation Quality'], ['correct', 'good']),
        },
        {
            key: 'voice_input_quality',
            label: 'Voice Input Quality (Clear)',
            applicableRows: rows.filter((r) => !isNAlike(r['Voice Input Quality'])),
            isPositive: (r) => matchesAny(r['Voice Input Quality'], ['clear']),
        },
        {
            key: 'voice_output_quality',
            label: 'Voice Output Quality (Clear)',
            applicableRows: rows.filter((r) => !isNAlike(r['Voice Output Quality'])),
            isPositive: (r) => matchesAny(r['Voice Output Quality'], ['clear']),
        },
        {
            key: 'voice_input_working',
            label: 'Voice Input Working',
            applicableRows: rows.filter((r) => !isNAlike(r['Voice Input Working?'])),
            isPositive: (r) => isYes(r['Voice Input Working?']),
        },
        {
            key: 'voice_output_working',
            label: 'Voice Output Working',
            applicableRows: rows.filter((r) => !isNAlike(r['Voice Output Working?'])),
            isPositive: (r) => isYes(r['Voice Output Working?']),
        },
    ]);

    // 6. Communication & Notifications - Notification Success (Received on
    // Time only - the standalone KPI's own definition, kpis.ts's
    // notificationSuccessPct) averaged with Notification Experience (N_exp -
    // all 3 conditions required: received/same-thread/correct-Q-ID, mirrors
    // calculateNotificationExperience in normalize.ts).
    const communicationNotifications = buildAceModule('communication_notifications', 'Communication & Notifications', [
        {
            key: 'notification_success',
            label: 'Notification Success',
            applicableRows: rows.filter((r) => !isNAlike(r['Notification Received?'])),
            isPositive: (r) => matchesAny(r['Notification Received?'], ['received on time']),
        },
        {
            key: 'notification_experience',
            label: 'Notification Experience',
            applicableRows: rows.filter(
                (r) =>
                    !isNAlike(r['Notification Received?']) &&
                    !isNAlike(r['Notification on Same Thread?']) &&
                    !isNAlike(r['Notification Linked Correct Q-ID?']),
            ),
            isPositive: (r) =>
                matchesAny(r['Notification Received?'], ['received on time', 'received late', 'yes']) &&
                isYes(r['Notification on Same Thread?']) &&
                isYes(r['Notification Linked Correct Q-ID?']),
        },
    ]);

    return [farmerInteraction, agriAdvisory, knowledgeGdb, dynamicAdvisory, multilingualVoice, communicationNotifications];
}

export interface DiagnosticsResult {
    stageStats: TatStageStat[];
    bottleneckName: string;
    bottleneckTime: number;
    // Fixed ACE_MODULE_KEYS order, not sorted by score - independent of
    // weakestModule below, which still picks the lowest-scoring eligible
    // module regardless of display order.
    modulePerformance: AceModuleEntry[];
    // Modules 8-10 - unscored, always ACE_COMING_SOON_MODULES verbatim,
    // never considered by the weakestModule reduction below.
    comingSoonModules: AceComingSoonModule[];
    weakestModule: string;
    weakestModuleRowCount: number;
    weakestModuleScore: number | null;
    weakestModuleReason: string[];
    // Total critical/high defects by severity, independent of whether a
    // ticket URL was logged. Sheet-based (normalizeDefectSeverity over
    // `rows`), same source as the Executive Summary's Critical Defects tile -
    // unaffected by the Zoho-sourced openTickets/allTickets below.
    criticalDefectCount: number;
    // Critical/High severity only (mapZohoPriorityToSeverity) - feeds the
    // "Critical Defect Tickets" card view's tabs. Built from the Zoho ticket
    // cache, NOT from `rows` - ignores every dashboard filter, since most
    // Zoho tickets have no sheet row at all.
    openTickets: OpenTicket[];
    // Every Bugs Tracker ticket in the Zoho cache, regardless of severity or
    // status - feeds the card's "All Tickets" view. Superset of openTickets.
    allTickets: OpenTicket[];
}

// Builds the ticket card's two lists directly from the already-synced Zoho
// ticket cache (ZohoTicketStatusService.getCachedStatuses(), populated by
// syncAllBugsTrackerTickets - already filtered to the Bugs Tracker layout;
// Annam.ai/Anveshan tickets never enter this cache). Deliberately takes NO
// `rows`/filters parameter - most Zoho tickets have no sheet row for the
// dashboard's filters to apply to.
function buildZohoTicketLists(zohoTickets: Record<string, ZohoTicketStatus>): { openTickets: OpenTicket[]; allTickets: OpenTicket[] } {
    const allTickets: OpenTicket[] = Object.values(zohoTickets).map((t) => ({
        id: t.ticketId,
        url: t.url,
        severity: t.severity,
    }));
    // Severity comes from mapZohoPriorityToSeverity, not the sheet's Defect
    // Severity column.
    const openTickets = allTickets.filter((t) => t.severity === 'Critical' || t.severity === 'High');
    return { openTickets, allTickets };
}

// Biggest Bottleneck and the 6 ACE modules are computed over the given
// (already filtered) rows; the ticket card's openTickets/allTickets are
// computed from `zohoTickets` instead (see buildZohoTicketLists above) -
// defaults to `{}` so callers that don't pass it get empty ticket lists.
export function calculateDiagnostics(
    rows: TestersDashboardRecord[],
    zohoTickets: Record<string, ZohoTicketStatus> = {},
): DiagnosticsResult {
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

    const modulePerformance: AceModuleEntry[] = calculateAceModulePerformance(rows);

    const weakestEntry = modulePerformance.reduce<AceModuleEntry | null>((weakest, m) => {
        if (!m.eligible || m.overallScore === null) return weakest;
        if (!weakest || m.overallScore < weakest.overallScore!) return m;
        return weakest;
    }, null);
    const weakestModule: string = weakestEntry ? weakestEntry.label : 'None';
    const weakestModuleRowCount = weakestEntry ? weakestEntry.applicableRowCount : 0;
    const weakestModuleScore = weakestEntry ? weakestEntry.overallScore : null;
    const weakestModuleReason = weakestEntry ? weakestEntry.weakestMetricLabels : [];

    const criticalRows = rows.filter((r) => ['Critical', 'High'].includes(normalizeDefectSeverity(r['Defect Severity'])));
    const { openTickets, allTickets } = buildZohoTicketLists(zohoTickets);

    return {
        stageStats,
        bottleneckName,
        bottleneckTime,
        modulePerformance,
        comingSoonModules: ACE_COMING_SOON_MODULES,
        weakestModule,
        weakestModuleRowCount,
        weakestModuleScore,
        weakestModuleReason,
        criticalDefectCount: criticalRows.length,
        openTickets,
        allTickets,
    };
}
