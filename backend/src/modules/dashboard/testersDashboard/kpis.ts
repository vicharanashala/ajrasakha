// KPI calculation logic for the Testers Dashboard - Trust Score, Farmer
// Experience Score, the Executive Summary tiles, Critical Failures /
// Release Health, and the "vs previous period" comparison.

import type { TestersDashboardRecord } from '../interfaces/ITestersDashboardService.js';
import {
    pct,
    matchesAny,
    isNAlike,
    isYes,
    isNo,
    normalizeTestStatus,
    normalizeDefectSeverity,
    normalizeSlaStatus,
    normalizeChannel,
    isSourceLinkRelevant,
    isSourceLinkApplicable,
    isScientificallyCorrect,
    isQuestionFramedApplicable,
    isQuestionWellFramed,
    timeToMinutes,
    translationQualityPct,
    calculateSlaCompliance,
    calculateVoiceSuccess,
    calculateNotificationExperience,
    calculateNotificationSuccess,
    type VoiceSuccessResult,
} from './normalize.js';
import {
    RESPONSE_TIME_KEY,
    getPreviousPeriodWindow,
    getPreviousPeriodRows,
    type TestersDashboardFilters,
} from './filters.js';
import { isScientificAccuracyEligible, dynamicSubBucketFor, moduleGroupFor, type DynamicSubBucket } from './diagnostics.js';

// translationQualityPct/calculateSlaCompliance/calculateVoiceSuccess/
// calculateNotificationExperience live in normalize.js (see its header
// comment for why) - re-exported here so existing importers of this module
// keep working unchanged.
export { calculateVoiceSuccess };
export type { VoiceSuccessResult };

export interface TrustScoreBreakdown {
    A_sci: number;
    A_dom: number;
    S_lnk: number;
    Q_frm: number;
    Q_trn: number;
    S_sla: number;
}

export interface TrustScoreResult {
    score: number;
    breakdown: TrustScoreBreakdown;
}

// Generic NA-exclusion percentage helper: % of rows matching matchFn, over
// only that field's own non-blank/NA rows (not shared across other fields -
// unlike calculateSlaCompliance/N_exp's single shared applicable set, each
// call scopes independently to its own field). Used by V_io's 4 sub-fields
// below, each of which is blank on a different subset of rows.
function applicablePct(
    rows: TestersDashboardRecord[],
    field: string,
    matchFn: (r: TestersDashboardRecord) => boolean,
): number {
    const applicable = rows.filter((r) => !isNAlike(r[field]));
    return applicable.length ? pct(applicable.filter(matchFn).length, applicable.length) : 0;
}

export interface ScientificAccuracyResult {
    correctCount: number;
    applicableCount: number;
    pct: number;
}

// Single source of truth for "Scientific Accuracy" - shared by Trust
// Score's A_sci below, the Executive Summary "Scientific Accuracy" tile,
// and its previous-period comparison (calculatePreviousPeriodStats).
// Scoped to isScientificAccuracyEligible rows (diagnostics.ts - any
// recognized Type of Question, Static or Dynamic alike) with a real
// (non-NA) answer, counting "correct"/"yes"/"y" as correct
// (isScientificallyCorrect). The Executive Summary tile used to run its
// own narrower calculation here (no Type-of-Question scoping at all, plus
// "correct"-only matching) which let it silently drift from A_sci - 87%
// vs 95% on the live CSV, from the same underlying rows. Routing both
// through this one function makes that drift structurally impossible.
export function calculateScientificAccuracy(rows: TestersDashboardRecord[]): ScientificAccuracyResult {
    const eligible = rows.filter((r) => isScientificAccuracyEligible(r['Type of Question']));
    const applicable = eligible.filter((r) => !isNAlike(r['Answer Scientifically Correct?']));
    const correctCount = applicable.filter((r) => isScientificallyCorrect(r['Answer Scientifically Correct?'])).length;
    return { correctCount, applicableCount: applicable.length, pct: pct(correctCount, applicable.length) };
}

// Trust Score v2: 25% Scientific Accuracy (all rows, Static and Dynamic
// alike, with a real answer) + 30% Dynamic Accuracy (Weather/Mandi/Schemes,
// each scoped to its own Question Category bucket and averaged equally) +
// 15% Correct Source Links + 10% Question Properly Framed + 10% Translation
// Quality + 10% SLA.
//
// Expert Matching and Channel Consistency were removed entirely - they no
// longer feed Trust Score (their underlying fields/matching logic aren't
// reused by anything else in Trust Score, so there's nothing left to keep
// here; Channel Tested's normalizeChannel etc. remain used elsewhere on the
// dashboard).
//
// All 6 components exclude blank/NA rows from their own denominator - a row
// where the field was never filled in isn't a wrong answer, it's not
// applicable/not evaluated. A value that's neither the clear positive nor
// blank/NA (e.g. "Partially Correct", "Ambiguous") stays in the denominator
// but counts as incorrect - only the specific matched positive value counts.
export function calculateTrustScore(rows: TestersDashboardRecord[]): TrustScoreResult {
    const N = rows.length;
    if (!N) {
        return { score: 0, breakdown: { A_sci: 0, A_dom: 0, S_lnk: 0, Q_frm: 0, Q_trn: 0, S_sla: 0 } };
    }

    // A_sci: every row with a recognized Type of Question - GDB, Unique,
    // Outreach, OR Dynamic - and a real answer in Answer Scientifically
    // Correct?. No longer scoped to Static rows only, but still excludes
    // rows with no real Type of Question tag at all (blank, "Quality
    // Checking", "Static Dynamic", leaked tester names) - those aren't
    // Dynamic rows either, just untagged/garbage rows that happen to have a
    // value in this field. calculateScientificAccuracy() above is the
    // single shared source of this scoping rule AND match rule - Agri
    // Advisory, Knowledge & GDB, and the Executive Summary tile all reuse
    // it (directly or via this A_sci value), so none of them can drift
    // apart again.
    const A_sci = calculateScientificAccuracy(rows).pct;

    // A_dom: each of Weather/Mandi Prices/Government Schemes scoped to its
    // own Question Category bucket (dynamicSubBucketFor) rather than "every
    // row where this field happens to be filled in" - a real minority of
    // non-blank domain-correctness answers land outside their own category
    // bucket (tagging inconsistency), so category-scoping is the
    // methodologically correct denominator. Each domain still defaults to
    // 100 when it has zero applicable rows, so an empty domain doesn't drag
    // the average down as if it scored 0.
    function domainAccuracy(bucket: DynamicSubBucket, field: string): number {
        const bucketRows = rows.filter((r) => dynamicSubBucketFor(r['Question Category'], r['Type of Question']) === bucket);
        const applicable = bucketRows.filter((r) => !isNAlike(r[field]));
        return applicable.length ? pct(applicable.filter((r) => isYes(r[field])).length, applicable.length) : 100;
    }
    const weatherAcc = domainAccuracy('Weather', 'Weather Q Answered Correctly?');
    const mandiAcc = domainAccuracy('Mandi Prices', 'Mandi Price Q Correct?');
    const schemeAcc = domainAccuracy('Government Schemes', 'Scheme Q Correct?');
    const A_dom = Math.round((weatherAcc + mandiAcc + schemeAcc) / 3);

    // S_lnk: isSourceLinkApplicable() excludes blank/NA plus the confirmed
    // leaked "Successfully Identified as Duplicate"/"0:00:00" values;
    // isSourceLinkRelevant() accepts both answer styles testers use ("Yes"
    // and "Provided & Relevant" mean the same thing).
    const lnkApplicable = rows.filter((r) => isSourceLinkApplicable(r['Correct Source Links Provided?']));
    const S_lnk = pct(
        lnkApplicable.filter((r) => isSourceLinkRelevant(r['Correct Source Links Provided?'])).length,
        lnkApplicable.length,
    );

    // Q_frm: new component. isQuestionFramedApplicable() excludes the
    // confirmed leaked "English" value (a Language Tested answer that
    // landed in this column) in addition to blank/NA.
    const frmApplicable = rows.filter((r) => isQuestionFramedApplicable(r['Question Correctly Framed?']));
    const Q_frm = pct(
        frmApplicable.filter((r) => isQuestionWellFramed(r['Question Correctly Framed?'])).length,
        frmApplicable.length,
    );

    // Q_trn: unchanged shared formula.
    const Q_trn = translationQualityPct(rows).pct;

    // S_sla: unchanged shared formula (Within SLA ÷ (Within + Breached),
    // NA/blank/Not Applicable/unrecognized excluded). The leaked "Well
    // Framed" value (from Question Correctly Framed) is already excluded
    // here - it doesn't match any entry in normalizeSlaStatus's whitelist,
    // so it falls out via the same "unrecognized -> excluded" path as any
    // other garbage value, with no extra handling needed.
    const S_sla = calculateSlaCompliance(rows).withinSlaPct;

    const score = Math.round(0.25 * A_sci + 0.3 * A_dom + 0.15 * S_lnk + 0.1 * Q_frm + 0.1 * Q_trn + 0.1 * S_sla);
    return { score, breakdown: { A_sci, A_dom, S_lnk, Q_frm, Q_trn, S_sla } };
}

// Whether this set of rows has real (non-blank/NA) data in ANY of Trust
// Score's 6 sub-metric fields - used only by the daily trend chart to
// render a gap instead of a misleading number. Needed as a separate check
// because A_dom's default-to-100-when-empty (see calculateTrustScore above)
// would otherwise let a day with ZERO real rows still produce a
// "real-looking" 30% score. hasSci/hasDomain mirror calculateTrustScore's
// own scoping for A_sci/A_dom, so a row that wouldn't actually feed either
// there doesn't get counted as "has data" here either.
export function trustScoreHasData(rows: TestersDashboardRecord[]): boolean {
    if (!rows.length) return false;
    const hasSci = rows.some(
        (r) => isScientificAccuracyEligible(r['Type of Question']) && !isNAlike(r['Answer Scientifically Correct?']),
    );
    const inBucket = (r: TestersDashboardRecord, bucket: DynamicSubBucket) =>
        dynamicSubBucketFor(r['Question Category'], r['Type of Question']) === bucket;
    const hasDomain =
        rows.some((r) => inBucket(r, 'Weather') && !isNAlike(r['Weather Q Answered Correctly?'])) ||
        rows.some((r) => inBucket(r, 'Mandi Prices') && !isNAlike(r['Mandi Price Q Correct?'])) ||
        rows.some((r) => inBucket(r, 'Government Schemes') && !isNAlike(r['Scheme Q Correct?']));
    const hasLnk = rows.some((r) => isSourceLinkApplicable(r['Correct Source Links Provided?']));
    const hasFrm = rows.some((r) => isQuestionFramedApplicable(r['Question Correctly Framed?']));
    const hasTrn = rows.some((r) => !isNAlike(r['Translation Quality']));
    const hasSla = calculateSlaCompliance(rows).rows.length > 0;
    return hasSci || hasDomain || hasLnk || hasFrm || hasTrn || hasSla;
}

export interface ExperienceScoreBreakdown {
    S_rsp: number;
    S_sla: number;
    V_io: number;
    Q_trn: number;
    N_exp: number;
}

export interface ExperienceScoreResult {
    score: number;
    breakdown: ExperienceScoreBreakdown;
}

// Farmer Experience Score: 30% Response Speed + 20% SLA + 20% Voice
// Mechanics (working + quality, averaged) + 15% Translation Quality + 15%
// Notification Experience (stricter than the standalone Notification
// Success KPI - requires same-thread AND correct-Q-ID too, not just
// received-on-time).
export function calculateExperienceScore(rows: TestersDashboardRecord[]): ExperienceScoreResult {
    const N = rows.length;
    if (!N) {
        return { score: 0, breakdown: { S_rsp: 0, S_sla: 0, V_io: 0, Q_trn: 0, N_exp: 0 } };
    }

    let speedSum = 0;
    let speedCount = 0;
    rows.forEach((r) => {
        const mins = timeToMinutes(r[RESPONSE_TIME_KEY]);
        if (mins !== null) {
            let score = 0;
            if (mins <= 0) score = 100;
            else if (mins >= 120) score = 0;
            else score = 100 - (mins / 120) * 100;
            speedSum += score;
            speedCount++;
        }
    });
    const S_rsp = speedCount ? Math.round(speedSum / speedCount) : 0;

    const S_sla = calculateSlaCompliance(rows).withinSlaPct;

    // V_io: each of the 4 sub-fields scoped to its own non-blank rows, not
    // shared N, since each field's blank rate varies independently.
    const voiceInWorking = applicablePct(rows, 'Voice Input Working?', (r) => isYes(r['Voice Input Working?']));
    const voiceOutWorking = applicablePct(rows, 'Voice Output Working?', (r) => isYes(r['Voice Output Working?']));
    const voiceInQuality = applicablePct(rows, 'Voice Input Quality', (r) => matchesAny(r['Voice Input Quality'], ['clear']));
    const voiceOutQuality = applicablePct(rows, 'Voice Output Quality', (r) => matchesAny(r['Voice Output Quality'], ['clear']));
    const V_io = Math.round((voiceInWorking + voiceOutWorking + voiceInQuality + voiceOutQuality) / 4);

    const Q_trn = translationQualityPct(rows).pct;

    // N_exp: all 3 conditions required, denominator scoped to applicable
    // (non-blank/NA) rows - see calculateNotificationExperience (normalize.js).
    const N_exp = calculateNotificationExperience(rows).pct;

    const score = Math.round(0.3 * S_rsp + 0.2 * S_sla + 0.2 * V_io + 0.15 * Q_trn + 0.15 * N_exp);
    return { score, breakdown: { S_rsp, S_sla, V_io, Q_trn, N_exp } };
}

// Same purpose as trustScoreHasData above, for Farmer Experience Score's 5
// sub-metrics. Unlike A_dom, none of these default to a non-zero value on
// empty data, so a fully-empty day already scores a true 0% - this
// distinguishes that genuine 0% from "no data at all" so the chart can
// render a gap instead of a flat line at 0.
export function experienceScoreHasData(rows: TestersDashboardRecord[]): boolean {
    if (!rows.length) return false;
    const hasRsp = rows.some((r) => timeToMinutes(r[RESPONSE_TIME_KEY]) !== null);
    const hasSla = calculateSlaCompliance(rows).rows.length > 0;
    const hasVio =
        rows.some((r) => !isNAlike(r['Voice Input Working?'])) ||
        rows.some((r) => !isNAlike(r['Voice Output Working?'])) ||
        rows.some((r) => !isNAlike(r['Voice Input Quality'])) ||
        rows.some((r) => !isNAlike(r['Voice Output Quality']));
    const hasTrn = rows.some((r) => !isNAlike(r['Translation Quality']));
    const hasNexp = calculateNotificationExperience(rows).applicable > 0;
    return hasRsp || hasSla || hasVio || hasTrn || hasNexp;
}

export interface CriticalFailuresBreakdown {
    countIncorrect: number;
    countWeatherIncorrect: number;
    countMandiIncorrect: number;
    countSchemeIncorrect: number;
    countDbFailure: number;
    countNotifFailure: number;
    countDuplicateFailure: number;
    countCriticalBugs: number;
}

// Critical Failures card v2: Failures/Successes tabs, one row per category.
// Each category's Failures count and its exact opposite Successes count
// share the same source field(s) with blank/NA excluded from both sides -
// a row that's ambiguous for a category (e.g. "Partially Correct", a bare
// "Yes" on a compound DB-save check) lands on neither tab rather than being
// guessed into one.
export interface CriticalFailureCategory {
    key: string;
    label: string;
    // The Successes tab's own label for this category - deliberately NOT
    // the same string as `label` (e.g. "Within SLA - 2 Hours", not "SLA
    // Breached - 2 Hours"), since reusing the failure name on the success
    // side reads as nonsense ("SLA Breached - 2 Hours: 12,151" shown as a
    // success). `label` itself is unchanged and still describes the
    // Failures tab's meaning.
    successLabel: string;
    failureCount: number;
    successCount: number;
}

export interface CriticalFailureCategoriesResult {
    categories: CriticalFailureCategory[];
    // Sum of failureCount/successCount across all categories - a row that
    // trips more than one category (increasingly likely as categories are
    // added, e.g. the 3 SLA Breached rows are deliberately non-exclusive)
    // is counted once per category it trips, so this can exceed the
    // distinct-row counts below.
    failuresTotal: number;
    successesTotal: number;
    // Distinct rows (by Test ID) counted in AT LEAST ONE category on that
    // tab - the number to use when the question is "how many rows have a
    // problem," as opposed to "how many problems were found."
    distinctFailureRows: number;
    distinctSuccessRows: number;
    // Distinct rows counted on EITHER tab (union of the two sets above) -
    // i.e. rows with real, evaluable data in at least one of the 12
    // categories' underlying columns. Used as Pass Rate's own denominator
    // (Fix 1): a row with no evaluable data anywhere isn't a "pass by
    // elimination," it's untested and must be excluded, the same
    // applicable-only convention Trust Score already uses.
    evaluableRows: number;
}

const TIME_ANSWER_RECEIVED_KEY = 'Time Answer Received (HH:MM:SS)';

// Category 10 (SLA Breached): 3 independent benchmark rows against the same
// valid Response Time readings, not mutually exclusive by design - a reading
// that breaches the 7-day benchmark also breaches the 2-hour and 24-hour
// ones, matching how the team described "beyond 3 benchmark timelines."
// 10,080 min (7 days) here is a BUSINESS THRESHOLD for this category, not
// the same thing as normalize.ts's RESPONSE_TIME_PARSE_CAP_MINUTES (which
// governs what counts as a parseable reading at all) - raising the parse
// cap to 100,000 is what makes readings beyond 10,080 min visible to this
// category in the first place; the 10,080 benchmark itself is unchanged.
const SLA_BREACH_THRESHOLDS: { key: string; label: string; successLabel: string; minutes: number }[] = [
    { key: 'sla_breach_2hr', label: 'SLA Breached - 2 Hours', successLabel: 'Within SLA - 2 Hours', minutes: 120 },
    { key: 'sla_breach_24hr', label: 'SLA Breached - 24 Hours', successLabel: 'Within SLA - 24 Hours', minutes: 1440 },
    { key: 'sla_breach_7day', label: 'SLA Breached - 7 Days', successLabel: 'Within SLA - 7 Days', minutes: 10080 },
];

// Category 11 - GDB Retrieval Failure (API). A GDB question already has a
// stored answer and should return immediately; if the farmer instead sees
// the "answer within 2 hours" disclaimer, the stored answer failed to come
// back through the API. Built from two existing columns - Type of Question
// === GDB (any casing/whitespace variant, via moduleGroupFor) AND
// 120-min Msg Shown to User? === Yes (via isYes) - no dedicated sheet column
// was ever needed.
//
// KNOWN DATA QUALITY CONCERN (live-CSV investigation, confirmed 674
// failures / 453 successes / 3,344 excluded as blank/NA/duplicate-detection
// values): a large share of the 674 failure rows have a sub-1-minute
// Response Time despite the 2-hour disclaimer supposedly having fired, which
// reads as contradictory - either the disclaimer really fired and was
// corrected fast afterward, or (more likely, since "120-min Msg Shown to
// User?" is also reused to store duplicate-detection values like
// "Successfully Identified as Duplicate" on other rows) some testers are
// mis-marking this overloaded column on GDB rows. Response Time can't be
// used to corroborate the signal either way. Treat this count as an upper
// bound until the sheet data/column usage improves.

// Builds all 13 active categories, each with a Failures count and its
// Successes counterpart. Categories 1-8
// reuse the exact same failure conditions calculateKpis has always used
// (see the comments on each below for why its Successes counterpart is
// defined the way it is) - calculateKpis derives its own
// CriticalFailuresBreakdown fields from this same computation rather than
// re-filtering, so the two can never drift apart.
export function calculateCriticalFailureCategories(rows: TestersDashboardRecord[]): CriticalFailureCategoriesResult {
    const categories: CriticalFailureCategory[] = [];
    const failureRowIds = new Set<string>();
    const successRowIds = new Set<string>();
    let failuresTotal = 0;
    let successesTotal = 0;

    function addCategory(
        key: string,
        label: string,
        successLabel: string,
        failureRows: TestersDashboardRecord[],
        successRows: TestersDashboardRecord[],
    ): void {
        failureRows.forEach((r) => failureRowIds.add(r['Test ID']));
        successRows.forEach((r) => successRowIds.add(r['Test ID']));
        failuresTotal += failureRows.length;
        successesTotal += successRows.length;
        categories.push({
            key,
            label,
            successLabel,
            failureCount: failureRows.length,
            successCount: successRows.length,
        });
    }

    // 1. Incorrect Answers - success is specifically "Correct" (not merely
    // "not Incorrect"), so "Partially Correct" lands on neither tab.
    addCategory(
        'incorrect_answer',
        'Incorrect Answers',
        'Correct Answers',
        rows.filter((r) => matchesAny(r['Answer Scientifically Correct?'], ['incorrect'])),
        rows.filter((r) => matchesAny(r['Answer Scientifically Correct?'], ['correct'])),
    );

    // 2-4. Weather/Mandi/Scheme Q Incorrect - Yes/No are natural exact
    // opposites; blank/NA matches neither isYes nor isNo, excluding it from
    // both sides automatically.
    addCategory(
        'weather_incorrect',
        'Weather Q Incorrect',
        'Weather Q Correct',
        rows.filter((r) => isNo(r['Weather Q Answered Correctly?'])),
        rows.filter((r) => isYes(r['Weather Q Answered Correctly?'])),
    );
    addCategory(
        'mandi_incorrect',
        'Mandi Price Q Incorrect',
        'Mandi Price Q Correct',
        rows.filter((r) => isNo(r['Mandi Price Q Correct?'])),
        rows.filter((r) => isYes(r['Mandi Price Q Correct?'])),
    );
    addCategory(
        'scheme_incorrect',
        'Scheme Q Incorrect',
        'Scheme Q Correct',
        rows.filter((r) => isNo(r['Scheme Q Correct?'])),
        rows.filter((r) => isYes(r['Scheme Q Correct?'])),
    );

    // 5. Not Saved in DB - failure is "either field says not saved";
    // success requires BOTH fields to explicitly say "Saved", so ambiguous
    // values ("Duplicate", a bare "Yes", "Partial Save") land on neither
    // tab rather than being misread as a clean success.
    addCategory(
        'db_failure',
        'Not Saved in DB',
        'Saved in DB',
        rows.filter(
            (r) =>
                matchesAny(r['Question Saved in DB?'], ['not saved']) ||
                matchesAny(r['Answer Saved in DB?'], ['not saved']),
        ),
        rows.filter(
            (r) => matchesAny(r['Question Saved in DB?'], ['saved']) && matchesAny(r['Answer Saved in DB?'], ['saved']),
        ),
    );

    // 6. Notification Failure - failure is "any one of 3 signals is bad";
    // success requires all 3 to explicitly agree (received + same thread +
    // correct Q-ID), the exact mirror.
    addCategory(
        'notif_failure',
        'Notification Failure',
        'Notification Delivered',
        rows.filter(
            (r) =>
                matchesAny(r['Notification Received?'], ['not received', 'no']) ||
                isNo(r['Notification on Same Thread?']) ||
                isNo(r['Notification Linked Correct Q-ID?']),
        ),
        rows.filter(
            (r) =>
                matchesAny(r['Notification Received?'], ['received on time', 'received late', 'yes']) &&
                isYes(r['Notification on Same Thread?']) &&
                isYes(r['Notification Linked Correct Q-ID?']),
        ),
    );

    // 7. Duplicate Q-ID Detected - success is "Yes" (genuinely consistent
    // across systems), not "Successfully Identified as Duplicate" (a real
    // duplicate correctly caught - a different outcome, not "consistent").
    addCategory(
        'duplicate_qid',
        'Duplicate Q-ID Detected',
        'Q-ID Consistent',
        rows.filter((r) => matchesAny(r['Q-ID Consistent Across Systems?'], ['wrongly identified as duplicate'])),
        rows.filter((r) => isYes(r['Q-ID Consistent Across Systems?'])),
    );

    // 8. Critical Severity Bugs - success is "No Defect"
    // (normalizeDefectSeverity's 'NA' bucket), not merely "non-Critical" -
    // a High/Medium/Low bug is still a real defect, not a success, so it
    // lands on neither tab.
    addCategory(
        'critical_bug',
        'Critical Severity Bugs',
        'No Critical Bugs',
        rows.filter((r) => normalizeDefectSeverity(r['Defect Severity']) === 'Critical'),
        rows.filter((r) => normalizeDefectSeverity(r['Defect Severity']) === 'NA'),
    );

    // 9. Answer Never Received (NEW) - both signals must agree: no answer
    // timestamp logged AND no valid Response Time reading. A row where the
    // two signals disagree (e.g. a timestamp exists but Response Time is
    // garbage) is ambiguous and excluded from both tabs, not guessed either
    // way.
    addCategory(
        'answer_never_received',
        'Answer Never Received',
        'Answer Received',
        rows.filter((r) => isNAlike(r[TIME_ANSWER_RECEIVED_KEY]) && timeToMinutes(r[RESPONSE_TIME_KEY]) === null),
        rows.filter((r) => !isNAlike(r[TIME_ANSWER_RECEIVED_KEY]) && timeToMinutes(r[RESPONSE_TIME_KEY]) !== null),
    );

    // 10. SLA Breached (NEW) - 3 rows, see SLA_BREACH_THRESHOLDS above for
    // why they're independent rather than exclusive buckets.
    const responseTimeReadings = rows
        .map((r) => ({ r, minutes: timeToMinutes(r[RESPONSE_TIME_KEY]) }))
        .filter((x): x is { r: TestersDashboardRecord; minutes: number } => x.minutes !== null);
    SLA_BREACH_THRESHOLDS.forEach(({ key, label, successLabel, minutes: threshold }) => {
        addCategory(
            key,
            label,
            successLabel,
            responseTimeReadings.filter((x) => x.minutes > threshold).map((x) => x.r),
            responseTimeReadings.filter((x) => x.minutes <= threshold).map((x) => x.r),
        );
    });

    // 11. GDB Retrieval Failure (API) - see comment above this function's
    // SLA_BREACH_THRESHOLDS/category-11 block for the rule and the known
    // data quality concern. isYes/isNo only match "yes"/"y" and "no"/"n"
    // respectively, so the duplicate-detection values sharing this column
    // ("Successfully Identified as Duplicate", "Duplicate", etc.) fall into
    // neither side, same as blank/NA.
    const gdbRows = rows.filter((r) => moduleGroupFor(r['Type of Question']) === 'GDB');
    addCategory(
        'gdb_retrieval_failure',
        'GDB Retrieval Failure (API)',
        'GDB Retrieved Successfully',
        gdbRows.filter((r) => isYes(r['120-min Msg Shown to User?'])),
        gdbRows.filter((r) => isNo(r['120-min Msg Shown to User?'])),
    );

    const evaluableRowIds = new Set<string>([...failureRowIds, ...successRowIds]);

    return {
        categories,
        failuresTotal,
        successesTotal,
        distinctFailureRows: failureRowIds.size,
        distinctSuccessRows: successRowIds.size,
        evaluableRows: evaluableRowIds.size,
    };
}

export interface ReleaseHealthMetric {
    key: string;
    label: string;
    // This metric's weight within its own bucket (0-1) - all of a bucket's
    // metric weights sum to 1.
    weight: number;
    // 0-100 health score (already "higher is better" - a rate like Critical
    // Defect Rate is pre-inverted into "...Health" before landing here).
    value: number;
}

export interface ReleaseHealthBucket {
    key: string;
    label: string;
    // This bucket's weight within the overall Release Health score (0-1) -
    // all 6 buckets' weights sum to 1 (25/20/20/15/10/10%).
    weight: number;
    // 0-100, the weighted average of this bucket's own metrics.
    score: number;
    metrics: ReleaseHealthMetric[];
}

export type ReleaseHealthDecision = 'GO' | 'GO_WITH_CONDITIONS' | 'NO_GO';

export interface ReleaseHealthResult {
    // 0-100, the weighted average of all 6 buckets' scores.
    score: number;
    buckets: ReleaseHealthBucket[];
    // Score-only GO / GO WITH CONDITIONS / NO-GO call - see
    // releaseHealthDecision() below for the important caveat on what this
    // does NOT yet account for.
    decision: ReleaseHealthDecision;
}

// GO/NO-GO thresholds, score-only for now.
//
// IMPORTANT / INCOMPLETE: the business plan's full decision rule is
// "score threshold AND all mandatory release gates PASS" (rollback tested,
// monitoring active, backup available, no critical blocking defect, etc.) -
// none of those gates exist as columns in the test sheet yet, so this
// function can only evaluate the score half of the rule. A high score here
// is NOT a substitute for checking those gates manually - this is a
// deliberate gap pending sheet data, not an oversight. Wire the gate check
// in once that data exists, rather than treating this decision as final.
export function releaseHealthDecision(score: number): ReleaseHealthDecision {
    if (score >= 95) return 'GO';
    if (score >= 90) return 'GO_WITH_CONDITIONS';
    return 'NO_GO';
}

// Release Health's Response Time Health (Performance & SLA bucket): a
// straight 0-100 line over a 24-hour scale - 0min reads as 100, 1,440min
// (24hrs) reads as 0, floored at 0 beyond that. A BUSINESS THRESHOLD (the
// plan's own choice of scale), independent of the 120min confirmed SLA
// limit used elsewhere (S_sla/S_rsp) and of RESPONSE_TIME_PARSE_CAP_MINUTES
// (which governs what counts as a parseable reading at all).
const RESPONSE_TIME_HEALTH_SCALE_MINUTES = 1440;

// Channel Performance (Farmer Experience & Channel Quality bucket): the
// dashboard's 3 real Channel Tested values - see normalizeChannel (Web
// App/WhatsApp/Both, "Both" displayed as "Cross-Platform" on the frontend).
const CHANNEL_PERFORMANCE_CHANNELS = ['Web App', 'WhatsApp', 'Both'] as const;

// Pooled Pass Rate (total Pass ÷ total Pass+Fail, Partial/NA/ungraded
// excluded - same formula the Channel-wise Performance card uses) across
// Web App, WhatsApp, and Cross-Platform combined. Fix 4: previously the 3
// channels' own pass rates were averaged unweighted, so a low-volume channel
// (e.g. Cross-Platform, a few hundred rows) counted exactly as much as
// Web App (thousands of rows). Pooling the raw counts before dividing means
// each channel contributes in proportion to its actual Pass+Fail volume.
function calculateChannelPerformance(rows: TestersDashboardRecord[]): number {
    let totalPassed = 0;
    let totalPassPlusFail = 0;
    CHANNEL_PERFORMANCE_CHANNELS.forEach((channel) => {
        const channelRows = rows.filter((r) => normalizeChannel(r['Channel Tested']) === channel);
        const passed = channelRows.filter((r) => normalizeTestStatus(r['Overall Test Status']) === 'Pass').length;
        const failed = channelRows.filter((r) => normalizeTestStatus(r['Overall Test Status']) === 'Fail').length;
        totalPassed += passed;
        totalPassPlusFail += passed + failed;
    });
    return pct(totalPassed, totalPassPlusFail);
}

// Release Health v2: a 6-bucket weighted model (25/20/20/15/10/10%),
// replacing the old Pass Rate - Critical Defect Rate - Data Integrity Rate
// formula. Each bucket blends 1-5 of its own 0-100 "...Health" metrics
// (reusing existing scores where one already exists, e.g. Trust Score,
// Pass Rate, SLA Compliance) with its own internal weights; the 6 buckets
// then combine at the top level. Two buckets from the wider plan - Security
// & Privacy and Release & Recovery Readiness - are deliberately NOT built
// here: there's no sheet data yet to back either one.
export function calculateReleaseHealth(rows: TestersDashboardRecord[]): ReleaseHealthResult {
    const N = rows.length;
    const categories = calculateCriticalFailureCategories(rows);
    const failureCount = (key: string): number => categories.categories.find((c) => c.key === key)!.failureCount;
    // 100 - failure rate scoped to APPLICABLE rows only (Fix 1) - a row with
    // no interpretable signal for a given check is excluded from its own
    // denominator rather than silently counted as healthy, the same
    // convention Trust Score's six components already use. Zero applicable
    // rows reads as 0 health, not a default-high 100 (same trap
    // responseTimeHealth's own zero-readings case avoids below).
    const applicableHealth = (failCount: number, applicable: number): number =>
        applicable ? 100 - pct(failCount, applicable) : 0;

    // Bucket 1 - AI & Response Quality: Trust Score, reused directly.
    const trustScore = calculateTrustScore(rows).score;

    // Bucket 2 - Functional & Critical Quality.
    //
    // Pass Rate (Fix 1): denominator is rows with real, evaluable data in AT
    // LEAST ONE of the 13 Critical Failure categories (categories.evaluableRows)
    // - a row untested everywhere no longer "passes by elimination" just
    // because it never tripped a failure condition.
    const passApplicable = categories.evaluableRows;
    const passRateV2 = passApplicable ? pct(passApplicable - categories.distinctFailureRows, passApplicable) : 0;

    // Critical Defect Health (Fix 2): merges the former "Critical Defects"
    // and "Critical Severity Bugs" line items - both read the exact same
    // column and exact same value (Defect Severity === 'Critical') and
    // always returned identical numbers, so the plan's two separate weighted
    // entries are collapsed into one 50%-weighted metric. Denominator
    // (Fix 1) excludes rows with no interpretable Defect Severity value at
    // all (blank, undefined column, or unparseable free text), not every row.
    const countCriticalBugs = failureCount('critical_bug');
    const defectSeverityApplicable = rows.filter((r) => normalizeDefectSeverity(r['Defect Severity']) !== '').length;
    const criticalDefectHealth = applicableHealth(countCriticalBugs, defectSeverityApplicable);

    // Bucket 3 - Data Integrity & Persistence. Fix 1: each metric below now
    // excludes rows with no interpretable signal instead of dividing by N.
    //
    // Data Integrity Health: mirrors the pre-v2 Release Health's own wider
    // dataIntegrityRate definition (Not Saved in DB on either field, OR
    // wrongly-identified-duplicate) - a wider set than Not Saved in DB
    // Health/Duplicate Record Health's own single-category counts below, so
    // the 3 metrics aren't redundant. A row is applicable if AT LEAST ONE of
    // the 3 fields carries a clear, non-ambiguous verdict ("Saved"/"Not
    // Saved" on either DB field, or "Yes"/"Wrongly Identified as Duplicate"
    // on the Q-ID field) - a row ambiguous on all 3 (blank everywhere, or
    // e.g. "Duplicate"/"Successfully Identified as Duplicate" with nothing
    // else to go on) is excluded rather than defaulting to healthy.
    const isQSavedClear = (r: TestersDashboardRecord) =>
        matchesAny(r['Question Saved in DB?'], ['saved']) || matchesAny(r['Question Saved in DB?'], ['not saved']);
    const isASavedClear = (r: TestersDashboardRecord) =>
        matchesAny(r['Answer Saved in DB?'], ['saved']) || matchesAny(r['Answer Saved in DB?'], ['not saved']);
    const isQidClear = (r: TestersDashboardRecord) =>
        isYes(r['Q-ID Consistent Across Systems?']) ||
        matchesAny(r['Q-ID Consistent Across Systems?'], ['wrongly identified as duplicate']);
    const dataIntegrityApplicableRows = rows.filter((r) => isQSavedClear(r) || isASavedClear(r) || isQidClear(r));
    const dataIntegrityFailures = dataIntegrityApplicableRows.filter(
        (r) =>
            matchesAny(r['Question Saved in DB?'], ['not saved']) ||
            matchesAny(r['Answer Saved in DB?'], ['not saved']) ||
            matchesAny(r['Q-ID Consistent Across Systems?'], ['wrongly identified as duplicate']),
    ).length;
    const dataIntegrityHealth = applicableHealth(dataIntegrityFailures, dataIntegrityApplicableRows.length);

    // Not Saved in DB Health / Duplicate Record Health: denominator is only
    // rows their own category (calculateCriticalFailureCategories) confirmed
    // one way or the other - failureCount + successCount. The large
    // "ambiguous" remainder (e.g. "Duplicate", blank, NA, "Successfully
    // Identified as Duplicate") is excluded rather than counted as healthy.
    const dbFailureCategory = categories.categories.find((c) => c.key === 'db_failure')!;
    const notSavedInDbHealth = applicableHealth(
        dbFailureCategory.failureCount,
        dbFailureCategory.failureCount + dbFailureCategory.successCount,
    );
    const duplicateCategory = categories.categories.find((c) => c.key === 'duplicate_qid')!;
    const duplicateRecordHealth = applicableHealth(
        duplicateCategory.failureCount,
        duplicateCategory.failureCount + duplicateCategory.successCount,
    );

    // Bucket 4 - Performance & SLA.
    const slaCompliancePct = calculateSlaCompliance(rows).withinSlaPct;
    let responseMinutesSum = 0;
    let responseMinutesCount = 0;
    rows.forEach((r) => {
        const mins = timeToMinutes(r[RESPONSE_TIME_KEY]);
        if (mins !== null) {
            responseMinutesSum += mins;
            responseMinutesCount++;
        }
    });
    // No valid readings must NOT default to a "perfect" 0min score (the same
    // trap A_dom's empty-bucket default exists to avoid elsewhere) - 0 real
    // data reads as 0 health here, not 100.
    const responseTimeHealth = responseMinutesCount
        ? Math.max(
              0,
              Math.min(100, Math.round(100 - (responseMinutesSum / responseMinutesCount / RESPONSE_TIME_HEALTH_SCALE_MINUTES) * 100)),
          )
        : 0;
    const responseSpeed = calculateExperienceScore(rows).breakdown.S_rsp;

    // Bucket 5 - Farmer Experience & Channel Quality. Notification Success
    // (Fix 3): shares calculateNotificationSuccess's Received-field match
    // rule with N_exp below (received on time/late, or a bare yes) - a
    // "yes" answer no longer counts as a failure here while counting toward
    // N_exp's success side, which was the original inconsistency.
    const notificationSuccessPct = calculateNotificationSuccess(rows).pct;
    const voiceSuccess = calculateVoiceSuccess(rows);
    const voicePerformance = Math.round((voiceSuccess.score / 10) * 100);
    const translationQuality = translationQualityPct(rows).pct;
    // Channel Performance (Fix 4): pooled across channels, see
    // calculateChannelPerformance's own comment.
    const channelPerformance = calculateChannelPerformance(rows);
    const notificationExperience = calculateNotificationExperience(rows).pct;

    // Bucket 6 - Reliability & Critical Failure Health. Failures are
    // weighted by severity rather than treated equally (a plain
    // 100 - failure rate) - Critical categories cost 4x as much per
    // occurrence as Low ones. Categories are NOT mutually exclusive (e.g. a
    // 7-day SLA breach is also a 2-hour and 24-hour breach), so a single bad
    // row can rack up multiple categories' penalties, by design.
    const SEVERITY_PENALTIES: { key: string; penalty: number }[] = [
        { key: 'answer_never_received', penalty: 4 },
        { key: 'db_failure', penalty: 4 },
        { key: 'critical_bug', penalty: 4 },
        { key: 'incorrect_answer', penalty: 3 },
        { key: 'sla_breach_7day', penalty: 3 },
        { key: 'duplicate_qid', penalty: 3 },
        { key: 'gdb_retrieval_failure', penalty: 3 },
        { key: 'weather_incorrect', penalty: 2 },
        { key: 'mandi_incorrect', penalty: 2 },
        { key: 'scheme_incorrect', penalty: 2 },
        { key: 'sla_breach_24hr', penalty: 2 },
        { key: 'sla_breach_2hr', penalty: 1 },
        { key: 'notif_failure', penalty: 1 },
    ];
    const weightedPenalty = SEVERITY_PENALTIES.reduce((sum, { key, penalty }) => sum + failureCount(key) * penalty, 0);
    const maxPenalty = N * 4;
    const reliabilityHealth = maxPenalty ? Math.max(0, Math.round(100 - (weightedPenalty / maxPenalty) * 100)) : 0;

    // Rounds each metric's value to a whole number, then rounds the
    // bucket's own weighted-sum score - same "round components, then round
    // the combination" convention calculateTrustScore/calculateExperienceScore
    // already use, rather than carrying float precision through to the top.
    function buildBucket(
        key: string,
        label: string,
        weight: number,
        rawMetrics: { key: string; label: string; weight: number; value: number }[],
    ): ReleaseHealthBucket {
        const metrics = rawMetrics.map((m) => ({ ...m, value: Math.round(m.value) }));
        const score = Math.round(metrics.reduce((sum, m) => sum + m.value * m.weight, 0));
        return { key, label, weight, score, metrics };
    }

    const buckets: ReleaseHealthBucket[] = [
        buildBucket('ai_response_quality', 'AI & Response Quality', 0.25, [
            { key: 'trust_score', label: 'Trust Score', weight: 1, value: trustScore },
        ]),
        buildBucket('functional_critical_quality', 'Functional & Critical Quality', 0.2, [
            { key: 'pass_rate', label: 'Pass Rate', weight: 0.5, value: passRateV2 },
            { key: 'critical_defect_health', label: 'Critical Defect Health', weight: 0.5, value: criticalDefectHealth },
        ]),
        buildBucket('data_integrity_persistence', 'Data Integrity & Persistence', 0.2, [
            { key: 'data_integrity_health', label: 'Data Integrity Health', weight: 0.5, value: dataIntegrityHealth },
            { key: 'not_saved_in_db_health', label: 'Not Saved in DB Health', weight: 0.3, value: notSavedInDbHealth },
            { key: 'duplicate_record_health', label: 'Duplicate Record Health', weight: 0.2, value: duplicateRecordHealth },
        ]),
        buildBucket('performance_sla', 'Performance & SLA', 0.15, [
            { key: 'sla_compliance', label: 'SLA Compliance', weight: 0.5, value: slaCompliancePct },
            { key: 'response_time_health', label: 'Response Time Health', weight: 0.3, value: responseTimeHealth },
            { key: 'response_speed', label: 'Response Speed', weight: 0.2, value: responseSpeed },
        ]),
        buildBucket('farmer_experience_channel_quality', 'Farmer Experience & Channel Quality', 0.1, [
            { key: 'notification_success', label: 'Notification Success', weight: 0.25, value: notificationSuccessPct },
            { key: 'voice_performance', label: 'Voice Performance', weight: 0.25, value: voicePerformance },
            { key: 'translation_quality', label: 'Translation Quality', weight: 0.2, value: translationQuality },
            { key: 'channel_performance', label: 'Channel Performance', weight: 0.2, value: channelPerformance },
            { key: 'notification_experience', label: 'Notification Experience', weight: 0.1, value: notificationExperience },
        ]),
        buildBucket('reliability_critical_failure_health', 'Reliability & Critical Failure Health', 0.1, [
            { key: 'reliability_health', label: 'Reliability Health', weight: 1, value: reliabilityHealth },
        ]),
    ];

    const rawScore = buckets.reduce((sum, b) => sum + b.score * b.weight, 0);
    const score = Math.max(0, Math.min(100, Math.round(rawScore)));

    return { score, buckets, decision: releaseHealthDecision(score) };
}

// Trusts what testers explicitly marked in "SLA Status" (normalizeSlaStatus),
// not a fresh Response-Time-based recomputation.
export interface SlaBreakdown {
    // Rows with a real, recognized SLA Status value - blank/NA/Not
    // Applicable/garbage are excluded from this denominator entirely, not
    // folded into "not within SLA".
    validRows: number;
    withinSlaCount: number;
    withinSlaPct: number;
    exceededSlaPct: number;
    breachedCount: number;
    // Of breachedCount, how many had NO parseable Response Time reading and
    // therefore could not contribute to avgDelayMinutes - reported
    // separately so that number's sample size is visibly smaller than the
    // breach count shown in the gauge, not silently so.
    breachedWithoutTimeCount: number;
    // Average (actual Response Time - 120min confirmed SLA limit) across
    // only breached rows that also have a valid Response Time reading.
    avgDelayMinutes: number;
}

export interface KpiSummary {
    N: number;
    trustScore: number;
    trustBreakdown: TrustScoreBreakdown;
    experienceScore: number;
    experienceBreakdown: ExperienceScoreBreakdown;
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
    voiceSuccess: VoiceSuccessResult;
    notificationSuccess: number;
    notificationSuccessOnTimeCount: number;
    notificationSuccessTotalCount: number;
    criticalFailuresToday: number;
    criticalBreakdown: CriticalFailuresBreakdown;
    // Critical Failures card v2 (Failures/Successes tabs, 11 active
    // categories) - see calculateCriticalFailureCategories.
    criticalFailureCategories: CriticalFailureCategoriesResult;
    releaseHealth: number;
    releaseHealthBreakdown: ReleaseHealthResult;
    slaBreakdown: SlaBreakdown;
}

// The full Executive Summary + Critical Failures + Release Health
// computation. Composes calculateTrustScore/calculateExperienceScore/
// calculateVoiceSuccess rather than recomputing their sub-metrics.
//
// Note on Q_trn: calculateTrustScore and calculateExperienceScore each
// compute their own Translation Quality percentage internally, using the
// identical formula over the same `rows` - so trustBreakdown.Q_trn and
// experienceBreakdown.Q_trn are always numerically equal, just computed
// independently rather than shared.
export function calculateKpis(rows: TestersDashboardRecord[]): KpiSummary {
    const N = rows.length;

    const trust = calculateTrustScore(rows);
    const experience = calculateExperienceScore(rows);

    // Overall average response time in actual minutes, for the Executive
    // Summary tile - different from S_rsp above, which is a 0-100 "speed
    // score" derived from response time, not the raw minutes value itself.
    let avgResponseMinutes = 0;
    {
        let sum = 0;
        let count = 0;
        rows.forEach((r) => {
            const mins = timeToMinutes(r[RESPONSE_TIME_KEY]);
            if (mins !== null) {
                sum += mins;
                count++;
            }
        });
        avgResponseMinutes = count ? Math.round((sum / count) * 10) / 10 : 0;
    }
    const avgResponseSampleCount = (() => {
        let c = 0;
        rows.forEach((r) => {
            if (timeToMinutes(r[RESPONSE_TIME_KEY]) !== null) c++;
        });
        return c;
    })();

    // Executive Summary's standalone "Scientific Accuracy" tile - reads
    // Trust Score's A_sci directly (same calculateScientificAccuracy() call,
    // so the two headline numbers can never drift apart again). The
    // Correct/Applicable counts behind the tooltip come from the same call,
    // so they always add up to this same percentage.
    const sciAccuracy = calculateScientificAccuracy(rows);
    const sciCorrectCount = sciAccuracy.correctCount;
    const scientificAccuracyApplicableCount = sciAccuracy.applicableCount;
    const scientificAccuracyAllRows = trust.breakdown.A_sci;

    // criticalBreakdown/criticalFailuresToday below are derived from this
    // one computation (not re-filtered independently), so the legacy
    // fixed-shape fields (still consumed by Executive Summary's "Critical
    // Defects" tile via countCriticalBugs) can never drift from the new
    // per-category card's numbers.
    const criticalFailureCategories = calculateCriticalFailureCategories(rows);
    const categoryFailureCount = (key: string): number =>
        criticalFailureCategories.categories.find((c) => c.key === key)!.failureCount;
    const countIncorrect = categoryFailureCount('incorrect_answer');
    const countWeatherIncorrect = categoryFailureCount('weather_incorrect');
    const countMandiIncorrect = categoryFailureCount('mandi_incorrect');
    const countSchemeIncorrect = categoryFailureCount('scheme_incorrect');
    const countDbFailure = categoryFailureCount('db_failure');
    const countNotifFailure = categoryFailureCount('notif_failure');
    const countDuplicateFailure = categoryFailureCount('duplicate_qid');
    const countCriticalBugs = categoryFailureCount('critical_bug');
    // Original 8-category sum only - deliberately excludes the newer
    // Answer Never Received/SLA Breached/GDB Retrieval categories, so this
    // legacy total's meaning doesn't silently change. Use
    // criticalFailureCategories.failuresTotal for the redesigned card's
    // headline number instead.
    const criticalFailuresToday =
        countIncorrect +
        countWeatherIncorrect +
        countMandiIncorrect +
        countSchemeIncorrect +
        countDbFailure +
        countNotifFailure +
        countDuplicateFailure +
        countCriticalBugs;

    // Release Health v2 (6-bucket weighted model) - computed independently
    // by calculateReleaseHealth rather than inline here, so it stays
    // directly unit-testable on its own (same "independently callable and
    // tested" pattern as calculateTrustScore/calculateExperienceScore).
    const releaseHealthResult = calculateReleaseHealth(rows);

    // Executive Summary's Pass Rate / Fail Rate (v2): a row is a "failure"
    // if it trips ANY Critical Failure category, a "success" otherwise -
    // reuses criticalFailureCategories.distinctFailureRows computed above
    // rather than recomputing independently, so the two can never drift
    // apart. Denominator is N (Total Tests Executed), not a Pass+Fail
    // subset, since every row is classifiable as one or the other under
    // this rule. Pass Rate is computed first and Fail Rate derived as its
    // complement (100 - passRate), so the two always sum to exactly 100% -
    // two independent Math.round() calls on complementary percentages can
    // otherwise land on 101 or 99.
    const failedRowCount = criticalFailureCategories.distinctFailureRows;
    const passedRowCount = N - failedRowCount;
    const passRate = pct(passedRowCount, N);
    const failRate = N ? 100 - passRate : 0;
    const totalPassed = passedRowCount;
    const totalFailed = failedRowCount;

    // Uses the same calculateSlaCompliance() helper Farmer Experience's
    // S_sla uses, so the two never disagree.
    const slaCompliance = calculateSlaCompliance(rows);

    // Avg Delay: SLA Status doesn't store minutes-over, so it's derived as
    // Response Time - 120 (the SLA limit), only for rows marked "SLA
    // Breached" that also have a valid, parseable Response Time reading.
    // breachedWithoutTimeCount is reported separately so avgDelayMinutes'
    // real sample size is visible, not silently smaller than breachedCount.
    const breachedRows = slaCompliance.rows.filter((r) => normalizeSlaStatus(r['SLA Status']) === 'SLA Breached');
    const breachedWithTime = breachedRows
        .map((r) => ({ mins: timeToMinutes(r[RESPONSE_TIME_KEY]) }))
        .filter((x): x is { mins: number } => x.mins !== null);
    const breachedWithoutTimeCount = breachedRows.length - breachedWithTime.length;
    const avgDelayMinutes = breachedWithTime.length
        ? Math.round(
              (breachedWithTime.reduce((sum, x) => sum + Math.max(0, x.mins - 120), 0) / breachedWithTime.length) * 10,
          ) / 10
        : 0;

    const voiceSuccess = calculateVoiceSuccess(rows);

    // Notification Success (Fix 3): shares calculateNotificationSuccess's
    // Received-field match rule with Release Health's own Bucket 5 metric
    // and with N_exp (received on time/late, or a bare yes) - NOT the
    // stricter same-thread/correct-Q-ID combination used inside Farmer
    // Experience Score's N_exp itself (a separate, intentionally stricter
    // metric). Denominator is rows with any real value in "Notification
    // Received?".
    const notificationSuccessResult = calculateNotificationSuccess(rows);
    const notificationSuccess = notificationSuccessResult.pct;
    const notificationSuccessOnTimeCount = notificationSuccessResult.onTime;
    const notificationSuccessTotalCount = notificationSuccessResult.applicable;

    return {
        N,
        trustScore: trust.score,
        trustBreakdown: trust.breakdown,
        experienceScore: experience.score,
        experienceBreakdown: experience.breakdown,
        avgResponseMinutes,
        avgResponseSampleCount,
        totalTests: N,
        passRate,
        totalPassed,
        failRate,
        totalFailed,
        sciCorrectCount,
        scientificAccuracyApplicableCount,
        scientificAccuracyAllRows,
        voiceSuccess,
        notificationSuccess,
        notificationSuccessOnTimeCount,
        notificationSuccessTotalCount,
        criticalFailuresToday,
        criticalBreakdown: {
            countIncorrect,
            countWeatherIncorrect,
            countMandiIncorrect,
            countSchemeIncorrect,
            countDbFailure,
            countNotifFailure,
            countDuplicateFailure,
            countCriticalBugs,
        },
        criticalFailureCategories,
        releaseHealth: releaseHealthResult.score,
        releaseHealthBreakdown: releaseHealthResult,
        slaBreakdown: {
            validRows: slaCompliance.rows.length,
            withinSlaCount: slaCompliance.withinSlaCount,
            withinSlaPct: slaCompliance.withinSlaPct,
            exceededSlaPct: slaCompliance.exceededSlaPct,
            breachedCount: breachedRows.length,
            breachedWithoutTimeCount,
            avgDelayMinutes,
        },
    };
}

export interface PreviousPeriodStats {
    totalTests: number;
    passRate: number;
    failRate: number;
    avgResponseMinutes: number;
    scientificAccuracy: number;
    openCriticalDefects: number;
    // Critical-only previous-period count, mirroring criticalBreakdown.
    // countCriticalBugs exactly - lets the "All Critical Defects" card's
    // trend arrow compare like-for-like against its Critical-only headline
    // number instead of the wider Critical+High openCriticalDefects above,
    // which could otherwise point the wrong direction on a High-only spike.
    countCriticalBugs: number;
    notificationSuccess: number;
    voiceSuccess: number;
    rangeLabel: string;
}

// Computes 6 headline metrics over an equal-length window immediately
// preceding the currently selected date range, using the exact same
// non-date filters as the main view. Returns null when there's no
// well-defined period to compare against (Date Range = "All Dates", or
// "Custom Range" with only one of start/end set).
//
// openCriticalDefects here counts Critical AND High severity - a
// deliberately different (wider) scope than criticalFailuresToday's
// countCriticalBugs (Critical only).
export function calculatePreviousPeriodStats(
    allRecords: TestersDashboardRecord[],
    filters: TestersDashboardFilters,
    excludeFailures: boolean,
    customStart: string | undefined,
    customEnd: string | undefined,
    now: Date = new Date(),
): PreviousPeriodStats | null {
    const window = getPreviousPeriodWindow(filters.dateRange, customStart, customEnd, now);
    if (!window) return null;

    const prevRows = getPreviousPeriodRows(allRecords, filters, excludeFailures, customStart, customEnd, now)!;

    const total = prevRows.length;
    // Same Critical-Failures-based Pass Rate / Fail Rate as calculateKpis
    // above (a row is a "failure" if it trips any Critical Failure
    // category), so the Executive Summary trend arrow compares like-for-like
    // against the previous period rather than mixing definitions. failRate
    // derived as the complement so the two always sum to exactly 100%.
    const prevFailedRowCount = calculateCriticalFailureCategories(prevRows).distinctFailureRows;
    const prevPassedRowCount = total - prevFailedRowCount;
    const prevPassRate = pct(prevPassedRowCount, total);
    const prevFailRate = total ? 100 - prevPassRate : 0;
    // Same calculateScientificAccuracy() as the current-period tile (see its
    // definition above calculateTrustScore), so the trend arrow compares
    // like-for-like instead of the old narrower, differently-scoped
    // definition this used to run independently.
    const prevSciAccuracy = calculateScientificAccuracy(prevRows);
    let sumMin = 0;
    let countMin = 0;
    prevRows.forEach((r) => {
        const m = timeToMinutes(r[RESPONSE_TIME_KEY]);
        if (m !== null) {
            sumMin += m;
            countMin++;
        }
    });
    const prevCriticalDefects = prevRows.filter((r) =>
        ['Critical', 'High'].includes(normalizeDefectSeverity(r['Defect Severity'])),
    ).length;
    // Same 'Critical'-only definition as calculateKpis' countCriticalBugs
    // above, just over the previous-period window.
    const prevCriticalBugsOnly = prevRows.filter((r) => normalizeDefectSeverity(r['Defect Severity']) === 'Critical').length;
    // Fix 3: same calculateNotificationSuccess definition as the current-period tile, so the trend arrow compares like-for-like.
    const prevNotificationSuccess = calculateNotificationSuccess(prevRows);
    const prevVoiceSuccess = calculateVoiceSuccess(prevRows);

    return {
        totalTests: total,
        passRate: prevPassRate,
        failRate: prevFailRate,
        avgResponseMinutes: countMin ? Math.round((sumMin / countMin) * 10) / 10 : 0,
        scientificAccuracy: prevSciAccuracy.pct,
        openCriticalDefects: prevCriticalDefects,
        countCriticalBugs: prevCriticalBugsOnly,
        notificationSuccess: prevNotificationSuccess.pct,
        voiceSuccess: prevVoiceSuccess.score,
        rangeLabel: `${window.prevStart} to ${window.prevEnd}`,
    };
}

export interface PeriodDelta {
    text: string;
    className: string;
}

// Direction-only (green for up, red for down) - no per-metric judgment
// about whether up is "good" (e.g. up is good for Pass Rate but bad for
// Fail Rate).
export function periodDelta(current: number, previous: number): PeriodDelta | null {
    if (previous === 0 && current === 0) return null;
    if (previous === 0) return { text: 'New', className: 'text-muted-foreground' };
    const change = Math.round(((current - previous) / previous) * 1000) / 10;
    if (change === 0) return { text: '→ No change', className: 'text-muted-foreground' };
    return {
        text: `${change > 0 ? '↑' : '↓'} ${Math.abs(change)}% vs previous period`,
        className: change > 0 ? 'text-emerald-600' : 'text-red-500',
    };
}
