// Diagnostics for the Testers Dashboard - Biggest Bottleneck (TAT stage
// averages), Overall Module Performance / Weakest Module (the 6 ACE modules
// below), and the Open Critical Defects ticket list.
//
// Deliberately excludes live Zoho ticket-status matching - that's a
// frontend-only concern (it calls a separate Zoho endpoint on a timer). This
// only surfaces "which tickets exist and what's their severity."

import type { TestersDashboardRecord } from '../interfaces/ITestersDashboardService.js';
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
// Module buckets. "Quality Checking" isn't mapped to any bucket yet -
// TODO: pending clarification from the team on where it belongs. Returning
// null for unmapped values keeps them out of the buckets rather than
// silently mis-grouping them.
//
// Matches "contains dynamic" (case-insensitive), not just the exact string
// "Dynamic", so compound values like "WEATHER DYNAMIC" bucket correctly.
// "Static Dynamic" is a deliberate exception - confirmed removed from the
// taxonomy entirely, so it must return null here rather than falling into
// the general Dynamic bucket (its value DOES contain the substring
// "dynamic"). This check has to run before the general "contains dynamic"
// check below, since that substring also matches "static dynamic".
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
// Type of Question tag at all, before its Question Category/Type of
// Question text is even consulted for which sub-bucket it falls into.
//
// The blank-type fallback exists because Sheet 1.0-era rows predate the
// Type of Question column entirely - a live-CSV investigation confirmed 85
// Weather / 43 Mandi Prices rows with a blank Type of Question, a clearly
// domain-matching Question Category (e.g. "Climate, Weather and Stress
// Management"), AND query text that genuinely asks about that domain (e.g.
// "Will it rain tomorrow?"). Gating purely on moduleGroupFor was wrongly
// discarding all of them as if they were unrelated static rows.
//
// Deliberately NOT relaxed for any other null-returning Type of Question
// (GDB/Unique/Outreach/Static Dynamic/Quality Checking/leaked tester names)
// - the same investigation confirmed those are a DIFFERENT, much larger
// pattern: cross-contamination leaks, where a single Dynamic-typed test row
// gets a value written into all 3 domain-correctness columns
// (Weather/Mandi/Scheme) regardless of which one is actually relevant. A
// GDB/Outreach-typed row with a real Weather Q Answered Correctly? value is
// one of those leaks, not a genuine weather answer - it must stay excluded.
//
// Known unresolved gap: Government Schemes has 16 more genuinely
// scheme-related rows (query text confirms it) tagged Outreach, not blank -
// this fix does NOT recover those, since relaxing the gate for Outreach
// would also let its much larger cross-contamination leak back in. Left
// excluded pending a more targeted fix (e.g. keying off Query Text itself).
//
// This is also what keeps the standalone Dynamic sub-type filter
// (filters.ts) consistent with the whole-branch Dynamic filter, which
// matches this same function returning non-null - do not remove this gate
// without updating both.
//
// Question Category is checked first, falling back to Type of Question when
// category doesn't resolve a bucket (some rows leave Question Category
// blank/unclear but carry the sub-bucket directly in Type of Question
// instead, e.g. "WEATHER DYNAMIC" -> Weather).
export function dynamicSubBucketFor(category?: string, typeOfQuestion?: string): DynamicSubBucket | null {
    const isBlankType = !(typeOfQuestion || '').trim();
    if (moduleGroupFor(typeOfQuestion) !== 'Dynamic' && !isBlankType) return null;

    const c = normalize(category);
    if (c) {
        if (c.includes('climate') || c.includes('weather')) return 'Weather';
        if (c.includes('market')) return 'Mandi Prices';
        if (c.includes('scheme')) return 'Government Schemes';
    }

    // Blank-Type-of-Question rows have nothing left to fall back to here
    // (typeOfQuestion is empty by definition) - Category alone is what can
    // rescue them, above.
    const t = normalize(typeOfQuestion);
    if (t) {
        if (t.includes('weather')) return 'Weather';
        if (t.includes('mandi') || t.includes('market')) return 'Mandi Prices';
        if (t.includes('scheme')) return 'Government Schemes';
    }

    return null;
}

// Rows eligible for Scientific Accuracy scoring: any row with a recognized
// Type of Question - GDB, Unique, Outreach, OR Dynamic (moduleGroupFor
// non-null) - Static and Dynamic alike. Rows with no real Type of Question
// tag at all (blank, "Quality Checking", "Static Dynamic", leaked tester
// names) are excluded - they were never Static OR Dynamic, just
// untagged/garbage rows that happen to have a value in this field. Shared
// by Trust Score's A_sci (kpis.ts), Agri Advisory, and Knowledge & GDB's
// Scientific Accuracy sub-metric below, so the three scopes can't drift
// apart if this rule changes again.
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
// scored from its own related columns rather than by grouping rows into a
// Type-of-Question bucket (the old GDB/Unique Questions/Outreach/Dynamic
// sub-type system this replaces). The business module list numbers 1-10,
// but only 1-6 are built here - see calculateAceModulePerformance's comment
// for why 7-10 are deliberately left out (module 7 doesn't exist at all;
// modules 8-10 are ACE_COMING_SOON_MODULES below, unscored rather than
// hidden).
export type AceModuleKey =
    | 'farmer_interaction'
    | 'agri_advisory'
    | 'knowledge_gdb'
    | 'dynamic_advisory'
    | 'multilingual_voice'
    | 'communication_notifications';

// Fixed display/computation order - mirrors the old MODULE_PERFORMANCE_BUCKETS
// pattern (not sorted by score; see DiagnosticsResult.modulePerformance).
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

// Modules 8-10 of the business's 10-module list (module 7 doesn't exist -
// the list jumps 6 straight to 8, see the comment above
// calculateAceModulePerformance) - built but never scoreable with the
// sheet's current columns, so the Weakest Modules card lists them as
// "Coming soon" instead of hiding them. Never eligible for weakestModule
// (calculateDiagnostics only reduces over modulePerformance, not this list).
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
    // Distinct rows applicable to AT LEAST ONE of this module's sub-metrics.
    // Unlike the old bucket system (one row set per bucket), an ACE module's
    // sub-metrics each scope to their own column/rows, so there's no single
    // "the module's rows" - this union is the closest equivalent, and what
    // MIN_ROWS_FOR_WEAKEST_MODULE gates eligibility on.
    applicableRowCount: number;
    eligible: boolean;
    // Average of only the sub-metrics with real applicable data - null only
    // when NO sub-metric had any applicable data at all (degenerate/empty
    // module).
    overallScore: number | null;
    // The 1-2 lowest-scoring applicable sub-metrics behind overallScore, by
    // label - genuinely derived by ranking this module's own applicable
    // sub-metric values, not a hardcoded guess. Empty only when overallScore
    // is null.
    weakestMetricLabels: string[];
}

interface AceSubMetricInput {
    key: string;
    label: string;
    // Pre-filtered to this sub-metric's own applicable (non-blank/NA, or
    // otherwise scoped) rows - the caller decides applicability, since it
    // varies per sub-metric (isNAlike alone for most, but
    // isQuestionFramedApplicable/isSourceLinkApplicable for a couple).
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

    // Union of rows applicable to at least one sub-metric - see
    // AceModuleEntry.applicableRowCount's comment for why this is the
    // module-level sample-size stand-in used for eligibility.
    const applicableRowSet = new Set<TestersDashboardRecord>();
    subMetricInputs.forEach(({ applicableRows }) => applicableRows.forEach((r) => applicableRowSet.add(r)));
    const applicableRowCount = applicableRowSet.size;
    const eligible = applicableRowCount >= MIN_ROWS_FOR_WEAKEST_MODULE;

    const scoreable = subMetrics.filter((m): m is AceModuleSubMetric & { value: number } => m.value !== null);
    const overallScore = scoreable.length
        ? Math.round((scoreable.reduce((sum, m) => sum + m.value, 0) / scoreable.length) * 10) / 10
        : null;

    // "Mainly affected by X [and Y]" - the lowest 1-2 applicable sub-metrics
    // by value, genuinely derived from this module's own numbers, not a
    // hardcoded label per module.
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
    // isScientificAccuracyEligible (any recognized Type of Question - Static
    // or Dynamic alike) - same scoping AND "correct" definition
    // (isScientificallyCorrect - accepts a plain yes/y too) as Trust Score's
    // own A_sci (kpis.ts). No longer Static-only - a Dynamic row with a real
    // answer now counts here too.
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

    // 3. Knowledge & GDB - Correct Source Links (global, same
    // isSourceLinkApplicable/isSourceLinkRelevant matching as Trust Score's
    // S_lnk) averaged with Scientific Accuracy - now identical in both
    // scoping (isScientificAccuracyEligible) AND match rule
    // (isScientificallyCorrect) to Agri Advisory/A_sci. Used to keep its own
    // "correct"-only match left over from when this sub-metric was scoped to
    // GDB rows only - that meant a "Yes" answer counted as correct in Agri
    // Advisory but not here, for no principled reason once both share the
    // same eligible-row scope. All three now reuse the exact same functions,
    // so they can't drift apart again.
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

    // 4. Dynamic Advisory - Weather/Mandi/Scheme accuracy, each scoped to
    // its own Question Category bucket via dynamicSubBucketFor (same
    // scoping as Trust Score's A_dom). Unlike A_dom, a sub-metric with zero
    // applicable rows is SKIPPED from the average here rather than
    // defaulting to 100 - Weakest Module must never let an empty domain
    // masquerade as a perfect score.
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
    // translationQualityPct's own ['correct','good'] definition in
    // normalize.ts) averaged with Voice Input/Output Quality (Clear-only,
    // stricter than calculateVoiceSuccess's 0-10 scale) and Voice
    // Input/Output Working.
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
    // All 6 ACE modules, in the fixed ACE_MODULE_KEYS order (Farmer
    // Interaction, Agri Advisory, Knowledge & GDB, Dynamic Advisory,
    // Multilingual & Voice, Communication & Notifications) - NOT sorted by
    // score, and independent of weakestModule below, which still picks the
    // lowest-scoring eligible module regardless of display order.
    modulePerformance: AceModuleEntry[];
    // Modules 8-10 - unscored, listed after modulePerformance for the
    // Weakest Modules card to render as "Coming soon". Static (doesn't
    // depend on rows) and always ACE_COMING_SOON_MODULES verbatim - never
    // considered by the weakestModule reduction below, which only ever
    // looks at modulePerformance.
    comingSoonModules: AceComingSoonModule[];
    weakestModule: string;
    weakestModuleRowCount: number;
    weakestModuleScore: number | null;
    // The weakest eligible module's weakestMetricLabels - kept for callers
    // that want the specific sub-metric breakdown, though the card itself
    // shows a fixed, methodology-only line instead.
    weakestModuleReason: string[];
    // Total critical/high defects by severity, independent of whether a
    // ticket URL was logged - a critical defect with no ticket URL logged
    // yet still counts here (not silently treated as "no active defects").
    criticalDefectCount: number;
    openTickets: OpenTicket[];
}

// Biggest Bottleneck, Overall Module Performance / Weakest Module (the 6 ACE
// modules), and the Open Critical Defects ticket list, all computed over the
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

    // The 6 ACE modules - see calculateAceModulePerformance's comment for
    // what each one scores and why modules 7-10 aren't built yet.
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
        comingSoonModules: ACE_COMING_SOON_MODULES,
        weakestModule,
        weakestModuleRowCount,
        weakestModuleScore,
        weakestModuleReason,
        criticalDefectCount: criticalRows.length,
        openTickets,
    };
}
