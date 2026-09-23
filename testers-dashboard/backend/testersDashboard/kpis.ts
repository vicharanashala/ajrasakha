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
    toTitleCase,
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
    type TypeBranch,
} from './filters.js';
import { isScientificAccuracyEligible, dynamicSubBucketFor, moduleGroupFor, type DynamicSubBucket } from './diagnostics.js';

// Re-exported so existing importers of this module keep working unchanged;
// the implementations live in normalize.js.
export { calculateVoiceSuccess };
export type { VoiceSuccessResult };

// The configured weight (0-1) of each Trust Score component for a given
// typeBranch - not the actual per-request weight after A_dom-null
// redistribution (see calculateTrustScore). A_dom is null here only for
// 'Static', which excludes it from the weight table entirely by design -
// distinct from breakdown.A_dom being null because a request simply had no
// Dynamic rows. Exposed to the frontend so it can render "(NN%)" labels
// without a second, driftable copy of the weight table.
export interface TrustScoreWeights {
    A_sci: number;
    A_dom: number | null;
    S_lnk: number;
    Q_frm: number;
    Q_trn: number;
    S_sla: number;
}

export interface TrustScoreBreakdown {
    A_sci: number;
    // Null when all 3 domains (Weather/Mandi Prices/Government Schemes) have
    // zero applicable rows - excluded from the weighted Trust Score rather
    // than defaulted to 100 or 0 (same "no data -> excluded, not scored"
    // rule Weakest Module's sub-metrics use in diagnostics.ts).
    A_dom: number | null;
    S_lnk: number;
    Q_frm: number;
    Q_trn: number;
    S_sla: number;
    weights: TrustScoreWeights;
}

export interface TrustScoreResult {
    score: number;
    breakdown: TrustScoreBreakdown;
}

// Single source of truth for both calculateTrustScore's weighting math and
// the weights exposed to the frontend via TrustScoreBreakdown.weights, so
// they can't drift apart.
const TRUST_SCORE_WEIGHTS_STATIC: TrustScoreWeights = { A_sci: 0.35, A_dom: null, S_lnk: 0.2, Q_frm: 0.15, Q_trn: 0.15, S_sla: 0.15 };
const TRUST_SCORE_WEIGHTS_DEFAULT: TrustScoreWeights = { A_sci: 0.25, A_dom: 0.3, S_lnk: 0.15, Q_frm: 0.1, Q_trn: 0.1, S_sla: 0.1 };
function trustScoreWeightsFor(typeBranch: TypeBranch): TrustScoreWeights {
    return typeBranch === 'Static' ? TRUST_SCORE_WEIGHTS_STATIC : TRUST_SCORE_WEIGHTS_DEFAULT;
}

// Rows with a recorded Defect Severity value ('' covers blank AND
// unparseable free text; 'NA'/"No Defect" is a genuine recorded verdict and
// stays included). Shared denominator for Release Health's Critical Defect
// Health and the Executive Summary's "Critical Defects" tile - do not fork
// this into two separate filters, the two scopes must not drift apart.
function defectSeverityRecordedRows(rows: TestersDashboardRecord[]): TestersDashboardRecord[] {
    return rows.filter((r) => normalizeDefectSeverity(r['Defect Severity']) !== '');
}

// % of rows matching matchFn, over only that field's own non-blank/NA rows -
// each call scopes independently to its own field, not a shared applicable
// set. Used by V_io's 4 sub-fields, each blank on a different subset of rows.
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
// Score's A_sci, the Executive Summary "Scientific Accuracy" tile, and its
// previous-period comparison. Scoped to isScientificAccuracyEligible rows
// (any recognized Type of Question, Static or Dynamic alike) with a real
// (non-NA) answer; do not let any of these callers fork their own
// narrower/differently-scoped copy of this calculation.
export function calculateScientificAccuracy(rows: TestersDashboardRecord[]): ScientificAccuracyResult {
    const eligible = rows.filter((r) => isScientificAccuracyEligible(r['Type of Question']));
    const applicable = eligible.filter((r) => !isNAlike(r['Answer Scientifically Correct?']));
    const correctCount = applicable.filter((r) => isScientificallyCorrect(r['Answer Scientifically Correct?'])).length;
    return { correctCount, applicableCount: applicable.length, pct: pct(correctCount, applicable.length) };
}

// Trust Score: weighted average of Scientific Accuracy (A_sci, 25%), Dynamic
// Accuracy (A_dom, 30% - Weather/Mandi/Schemes averaged equally), Correct
// Source Links (S_lnk, 15%), Question Properly Framed (Q_frm, 10%),
// Translation Quality (Q_trn, 10%) and SLA (S_sla, 10%). When A_dom has no
// data at all (e.g. Static branch, which has none of the 3 Dynamic buckets),
// it's excluded and its weight redistributes across the other 5 instead of
// silently defaulting to a "perfect" 100%.
//
// Static branch (typeBranch === 'Static') does NOT use that redistribution:
// it gets its own fixed weight table instead (35/20/15/15/15, A_dom dropped
// entirely) - a deliberate business call, not a derivation of the 'all'/
// 'Dynamic' formula. typeBranch defaults to 'all'.
//
// All 6 components exclude blank/NA rows from their own denominator; a value
// that's neither the clear positive nor blank/NA (e.g. "Partially Correct")
// stays in the denominator but counts as incorrect.
export function calculateTrustScore(rows: TestersDashboardRecord[], typeBranch: TypeBranch = 'all'): TrustScoreResult {
    const N = rows.length;
    if (!N) {
        return { score: 0, breakdown: { A_sci: 0, A_dom: null, S_lnk: 0, Q_frm: 0, Q_trn: 0, S_sla: 0, weights: trustScoreWeightsFor(typeBranch) } };
    }

    // A_sci: every row with a recognized Type of Question (GDB, Unique,
    // Outreach, or Dynamic) and a real answer - excludes untagged/garbage
    // rows (blank, "Quality Checking", leaked tester names) that happen to
    // have a value in this field but aren't a real Type of Question.
    const A_sci = calculateScientificAccuracy(rows).pct;

    // A_dom: each of Weather/Mandi Prices/Government Schemes scoped to its
    // own Question Category bucket (dynamicSubBucketFor), not "every row
    // where this field happens to be filled in" - some non-blank answers
    // land outside their own category bucket (tagging inconsistency), so
    // category-scoping is the methodologically correct denominator. A domain
    // with zero applicable rows is null, excluded from the average below
    // rather than defaulted to 100.
    function domainAccuracy(bucket: DynamicSubBucket, field: string): number | null {
        const bucketRows = rows.filter((r) => dynamicSubBucketFor(r['Question Category'], r['Type of Question']) === bucket);
        const applicable = bucketRows.filter((r) => !isNAlike(r[field]));
        return applicable.length ? pct(applicable.filter((r) => isYes(r[field])).length, applicable.length) : null;
    }
    // Skipped outright for Static (which has none of the 3 Dynamic buckets
    // by construction) so its fixed weight table is the only thing driving
    // its score, not a redistribution fallback.
    let A_dom: number | null = null;
    if (typeBranch !== 'Static') {
        const weatherAcc = domainAccuracy('Weather', 'Weather Q Answered Correctly?');
        const mandiAcc = domainAccuracy('Mandi Prices', 'Mandi Price Q Correct?');
        const schemeAcc = domainAccuracy('Government Schemes', 'Scheme Q Correct?');
        // Average of only the domains with real applicable data - null only
        // when all 3 are empty.
        const applicableDomainAccs = [weatherAcc, mandiAcc, schemeAcc].filter((v): v is number => v !== null);
        A_dom = applicableDomainAccs.length
            ? Math.round(applicableDomainAccs.reduce((sum, v) => sum + v, 0) / applicableDomainAccs.length)
            : null;
    }

    // S_lnk: isSourceLinkApplicable() excludes blank/NA plus leaked
    // "Successfully Identified as Duplicate"/"0:00:00" values;
    // isSourceLinkRelevant() accepts both answer styles testers use ("Yes"
    // and "Provided & Relevant" mean the same thing).
    const lnkApplicable = rows.filter((r) => isSourceLinkApplicable(r['Correct Source Links Provided?']));
    const S_lnk = pct(
        lnkApplicable.filter((r) => isSourceLinkRelevant(r['Correct Source Links Provided?'])).length,
        lnkApplicable.length,
    );

    // Q_frm: isQuestionFramedApplicable() excludes a leaked "English" value
    // (a Language Tested answer landing in this column) in addition to blank/NA.
    const frmApplicable = rows.filter((r) => isQuestionFramedApplicable(r['Question Correctly Framed?']));
    const Q_frm = pct(
        frmApplicable.filter((r) => isQuestionWellFramed(r['Question Correctly Framed?'])).length,
        frmApplicable.length,
    );

    const Q_trn = translationQualityPct(rows).pct;

    // S_sla: Within SLA ÷ (Within + Breached), NA/blank/unrecognized
    // excluded (calculateSlaCompliance).
    const S_sla = calculateSlaCompliance(rows).withinSlaPct;

    // 'all'/'Dynamic': weighted average over only the components that have a
    // real value - when A_dom is null, its 0.3 weight redistributes
    // proportionally across the other 5 (dividing by their combined 0.7
    // weight instead of 1.0). Static uses its own fixed table (35/20/15/
    // 15/15, already summing to 1.0) instead of this redistribution.
    const weights = trustScoreWeightsFor(typeBranch);
    const weightedComponents: { value: number; weight: number }[] = [
        { value: A_sci, weight: weights.A_sci },
        { value: S_lnk, weight: weights.S_lnk },
        { value: Q_frm, weight: weights.Q_frm },
        { value: Q_trn, weight: weights.Q_trn },
        { value: S_sla, weight: weights.S_sla },
    ];
    if (typeBranch !== 'Static' && A_dom !== null) {
        weightedComponents.push({ value: A_dom, weight: weights.A_dom! });
    }
    const totalWeight = weightedComponents.reduce((sum, c) => sum + c.weight, 0);
    const score = Math.round(weightedComponents.reduce((sum, c) => sum + c.value * c.weight, 0) / totalWeight);
    return { score, breakdown: { A_sci, A_dom, S_lnk, Q_frm, Q_trn, S_sla, weights } };
}

// Whether this set of rows has real (non-blank/NA) data in ANY of Trust
// Score's 6 sub-metric fields - used only by the daily trend chart to
// render a gap instead of a misleading number, since each component falls
// back to pct(0,0) = 0 (not null) on zero applicable rows. hasSci/hasDomain
// mirror calculateTrustScore's own scoping for A_sci/A_dom.
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

    // V_io: each of the 4 sub-fields scoped to its own non-blank rows, since
    // each field's blank rate varies independently.
    const voiceInWorking = applicablePct(rows, 'Voice Input Working?', (r) => isYes(r['Voice Input Working?']));
    const voiceOutWorking = applicablePct(rows, 'Voice Output Working?', (r) => isYes(r['Voice Output Working?']));
    const voiceInQuality = applicablePct(rows, 'Voice Input Quality', (r) => matchesAny(r['Voice Input Quality'], ['clear']));
    const voiceOutQuality = applicablePct(rows, 'Voice Output Quality', (r) => matchesAny(r['Voice Output Quality'], ['clear']));
    const V_io = Math.round((voiceInWorking + voiceOutWorking + voiceInQuality + voiceOutQuality) / 4);

    const Q_trn = translationQualityPct(rows).pct;

    const N_exp = calculateNotificationExperience(rows).pct;

    const score = Math.round(0.3 * S_rsp + 0.2 * S_sla + 0.2 * V_io + 0.15 * Q_trn + 0.15 * N_exp);
    return { score, breakdown: { S_rsp, S_sla, V_io, Q_trn, N_exp } };
}

// Same purpose as trustScoreHasData above, for Farmer Experience Score's 5
// sub-metrics - distinguishes a genuine 0% from "no data at all" so the
// chart can render a gap instead of a flat line at 0.
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

// Critical Failures card: Failures/Successes tabs, one row per category.
// Each category's Failures count and its exact opposite Successes count
// share the same source field(s) with blank/NA excluded from both sides -
// a row that's ambiguous for a category (e.g. "Partially Correct", a bare
// "Yes" on a compound DB-save check) lands on neither tab rather than being
// guessed into one.
export interface CriticalFailureCategory {
    key: string;
    label: string;
    // Deliberately NOT the same string as `label` (e.g. "Within SLA - 2
    // Hours", not "SLA Breached - 2 Hours") - reusing the failure name on
    // the success side would read as nonsense.
    successLabel: string;
    failureCount: number;
    successCount: number;
    // Rows where this category's underlying field(s) had a recorded
    // (non-blank/NA) value, whether or not it resolved cleanly to a failure
    // or success - computed independently, not derived from failureCount +
    // successCount, since several categories have an ambiguous-but-recorded
    // middle ground (see each category's comment below). Powers the
    // Critical Failures card's "count / applicable" display.
    applicableCount: number;
}

export interface CriticalFailureCategoriesResult {
    categories: CriticalFailureCategory[];
    // Sum across all categories - a row that trips more than one category is
    // counted once per category, so this can exceed the distinct-row counts
    // below.
    failuresTotal: number;
    successesTotal: number;
    // Distinct rows (by Test ID) counted in AT LEAST ONE category on that
    // tab - "how many rows have a problem," not "how many problems."
    distinctFailureRows: number;
    distinctSuccessRows: number;
    // Union of the two distinct-row sets above - rows with real, evaluable
    // data in at least one category. Used as Pass Rate's own denominator: a
    // row with no evaluable data anywhere is untested, not a "pass by
    // elimination."
    evaluableRows: number;
}

const TIME_ANSWER_RECEIVED_KEY = 'Time Answer Received (HH:MM:SS)';

// Category 10 (SLA Breached): 3 MUTUALLY EXCLUSIVE bands against the same
// valid Response Time readings, on both the Failures side and the
// Successes side - each reading falls into exactly one failure band and
// (independently) exactly one success band, based on where it lands, not
// every threshold it happens to exceed:
//   Failures:  2hr (120-1440min) / 24hr (1440-10080min) / 7day (>=10080min)
//   Successes: 2hr (<=120min) / 24hr (120-1440min) / 7day (1440-10080min)
//
// WARNING: Within SLA - 24 Hours' success range is numerically IDENTICAL to
// SLA Breached - 2 Hours' failure range (and 7 Days' to 24 Hours'), BY
// DESIGN, NOT A BUG. A 300-minute reading legitimately shows up as a FAILURE
// on "SLA Breached - 2 Hours" (missed the 2-hour promise) AND a SUCCESS on
// "Within SLA - 24 Hours" (still landed within a day) - two different
// benchmarks evaluated independently, not one benchmark's failure/success
// split. Do not "fix" this into non-overlapping tiers across the two tabs.
//
// 10,080 min (7 days) is a business threshold for this category, distinct
// from normalize.ts's RESPONSE_TIME_PARSE_CAP_MINUTES (which governs what
// counts as a parseable reading at all).
interface MinutesRange {
    from: number;
    fromInclusive: boolean;
    // null means "no upper bound."
    to: number | null;
    toInclusive: boolean;
}
function inMinutesRange(minutes: number, range: MinutesRange): boolean {
    const atOrPastFrom = range.fromInclusive ? minutes >= range.from : minutes > range.from;
    const atOrBeforeTo = range.to === null ? true : range.toInclusive ? minutes <= range.to : minutes < range.to;
    return atOrPastFrom && atOrBeforeTo;
}

// Defined once and reused below as the NEXT tier's success range too, so a
// band's failure range and the adjacent band's success range can't drift
// apart from each other.
const SLA_BAND_2HR_FAILURE_RANGE: MinutesRange = { from: 120, fromInclusive: false, to: 1440, toInclusive: false };
const SLA_BAND_24HR_FAILURE_RANGE: MinutesRange = { from: 1440, fromInclusive: true, to: 10080, toInclusive: false };
const SLA_BAND_7DAY_FAILURE_RANGE: MinutesRange = { from: 10080, fromInclusive: true, to: null, toInclusive: false };
// The only fully-compliant range - Within SLA - 2 Hours' own success range,
// with no adjacent failure band below it to mirror.
const SLA_FULLY_COMPLIANT_RANGE: MinutesRange = { from: 0, fromInclusive: true, to: 120, toInclusive: true };

const SLA_BREACH_BANDS: {
    key: string;
    label: string;
    successLabel: string;
    failureRange: MinutesRange;
    successRange: MinutesRange;
}[] = [
    { key: 'sla_breach_2hr', label: 'SLA Breached - 2 Hours', successLabel: 'Within SLA - 2 Hours', failureRange: SLA_BAND_2HR_FAILURE_RANGE, successRange: SLA_FULLY_COMPLIANT_RANGE },
    { key: 'sla_breach_24hr', label: 'SLA Breached - 24 Hours', successLabel: 'Within SLA - 24 Hours', failureRange: SLA_BAND_24HR_FAILURE_RANGE, successRange: SLA_BAND_2HR_FAILURE_RANGE },
    { key: 'sla_breach_7day', label: 'SLA Breached - 7 Days', successLabel: 'Within SLA - 7 Days', failureRange: SLA_BAND_7DAY_FAILURE_RANGE, successRange: SLA_BAND_24HR_FAILURE_RANGE },
];

// Category 11 - GDB Retrieval Failure (API). A GDB question already has a
// stored answer and should return immediately; if the farmer instead sees
// the "answer within 2 hours" disclaimer, the stored answer failed to come
// back through the API. Built from Type of Question === GDB AND 120-min Msg
// Shown to User? === Yes - no dedicated sheet column was ever needed.
//
// KNOWN DATA QUALITY CONCERN: "120-min Msg Shown to User?" is also reused to
// store duplicate-detection values (e.g. "Successfully Identified as
// Duplicate") on other rows, so some testers may be mis-marking this
// overloaded column on GDB rows; Response Time can't corroborate the signal
// either way. Treat this count as an upper bound.

// Builds all 13 active categories, each with a Failures count and its
// Successes counterpart. calculateKpis derives its own CriticalFailuresBreakdown
// fields from this same computation rather than re-filtering, so the two
// can never drift apart.
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
        applicableRows: TestersDashboardRecord[],
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
            applicableCount: applicableRows.length,
        });
    }

    // 1. Incorrect Answers - success is specifically "Correct" (not merely
    // "not Incorrect"), so "Partially Correct" lands on neither tab but still
    // counts as applicable.
    addCategory(
        'incorrect_answer',
        'Incorrect Answers',
        'Correct Answers',
        rows.filter((r) => matchesAny(r['Answer Scientifically Correct?'], ['incorrect'])),
        rows.filter((r) => matchesAny(r['Answer Scientifically Correct?'], ['correct'])),
        rows.filter((r) => !isNAlike(r['Answer Scientifically Correct?'])),
    );

    // 2-4. Weather/Mandi/Scheme Q Incorrect - Yes/No are exact opposites;
    // blank/NA matches neither, excluding it from both sides automatically.
    addCategory(
        'weather_incorrect',
        'Weather Q Incorrect',
        'Weather Q Correct',
        rows.filter((r) => isNo(r['Weather Q Answered Correctly?'])),
        rows.filter((r) => isYes(r['Weather Q Answered Correctly?'])),
        rows.filter((r) => !isNAlike(r['Weather Q Answered Correctly?'])),
    );
    addCategory(
        'mandi_incorrect',
        'Mandi Price Q Incorrect',
        'Mandi Price Q Correct',
        rows.filter((r) => isNo(r['Mandi Price Q Correct?'])),
        rows.filter((r) => isYes(r['Mandi Price Q Correct?'])),
        rows.filter((r) => !isNAlike(r['Mandi Price Q Correct?'])),
    );
    addCategory(
        'scheme_incorrect',
        'Scheme Q Incorrect',
        'Scheme Q Correct',
        rows.filter((r) => isNo(r['Scheme Q Correct?'])),
        rows.filter((r) => isYes(r['Scheme Q Correct?'])),
        rows.filter((r) => !isNAlike(r['Scheme Q Correct?'])),
    );

    // 5. Not Saved in DB - failure is "either field says not saved";
    // success requires BOTH fields to explicitly say "Saved", so ambiguous
    // values ("Duplicate", a bare "Yes", "Partial Save") land on neither tab.
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
        rows.filter((r) => !isNAlike(r['Question Saved in DB?']) || !isNAlike(r['Answer Saved in DB?'])),
    );

    // 6. Notification Failure - failure is "any one of 3 signals is bad";
    // success requires all 3 to explicitly agree (received + same thread +
    // correct Q-ID).
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
        rows.filter(
            (r) =>
                !isNAlike(r['Notification Received?']) ||
                !isNAlike(r['Notification on Same Thread?']) ||
                !isNAlike(r['Notification Linked Correct Q-ID?']),
        ),
    );

    // 7. Duplicate Q-ID Detected - success is "Yes" (genuinely consistent
    // across systems), not "Successfully Identified as Duplicate" (a real
    // duplicate correctly caught - a different outcome).
    addCategory(
        'duplicate_qid',
        'Duplicate Q-ID Detected',
        'Q-ID Consistent',
        rows.filter((r) => matchesAny(r['Q-ID Consistent Across Systems?'], ['wrongly identified as duplicate'])),
        rows.filter((r) => isYes(r['Q-ID Consistent Across Systems?'])),
        rows.filter((r) => !isNAlike(r['Q-ID Consistent Across Systems?'])),
    );

    // 8. Critical Severity Bugs - success is "No Defect"
    // (normalizeDefectSeverity's 'NA' bucket), not merely "non-Critical" - a
    // High/Medium/Low bug is a real defect, not a success, so it lands on
    // neither tab though it's still applicable.
    addCategory(
        'critical_bug',
        'Critical Severity Bugs',
        'No Critical Bugs',
        rows.filter((r) => normalizeDefectSeverity(r['Defect Severity']) === 'Critical'),
        rows.filter((r) => normalizeDefectSeverity(r['Defect Severity']) === 'NA'),
        rows.filter((r) => normalizeDefectSeverity(r['Defect Severity']) !== ''),
    );

    // 9. Answer Never Received - both signals must agree: no answer
    // timestamp logged AND no valid Response Time reading. A row where the
    // two signals disagree is ambiguous and excluded from both tabs and
    // from applicableCount.
    const answerNeverReceivedFailure = rows.filter(
        (r) => isNAlike(r[TIME_ANSWER_RECEIVED_KEY]) && timeToMinutes(r[RESPONSE_TIME_KEY]) === null,
    );
    const answerNeverReceivedSuccess = rows.filter(
        (r) => !isNAlike(r[TIME_ANSWER_RECEIVED_KEY]) && timeToMinutes(r[RESPONSE_TIME_KEY]) !== null,
    );
    addCategory(
        'answer_never_received',
        'Answer Never Received',
        'Answer Received',
        answerNeverReceivedFailure,
        answerNeverReceivedSuccess,
        [...answerNeverReceivedFailure, ...answerNeverReceivedSuccess],
    );

    // 10. SLA Breached - see SLA_BREACH_BANDS above for band definitions and
    // the overlap warning. applicableCount is the same "has a parseable
    // Response Time reading" population for all 3 bands, unlike every other
    // category here where the denominator varies band to band.
    const responseTimeReadings = rows
        .map((r) => ({ r, minutes: timeToMinutes(r[RESPONSE_TIME_KEY]) }))
        .filter((x): x is { r: TestersDashboardRecord; minutes: number } => x.minutes !== null);
    const responseTimeApplicableRows = responseTimeReadings.map((x) => x.r);
    SLA_BREACH_BANDS.forEach(({ key, label, successLabel, failureRange, successRange }) => {
        addCategory(
            key,
            label,
            successLabel,
            responseTimeReadings.filter((x) => inMinutesRange(x.minutes, failureRange)).map((x) => x.r),
            responseTimeReadings.filter((x) => inMinutesRange(x.minutes, successRange)).map((x) => x.r),
            responseTimeApplicableRows,
        );
    });

    // 11. GDB Retrieval Failure (API) - see the category-11 comment above
    // for the rule and known data quality concern. isYes/isNo only match
    // "yes"/"no" variants, so duplicate-detection values sharing this
    // column ("Successfully Identified as Duplicate", etc.) fall into
    // neither side, same as blank/NA.
    const gdbRows = rows.filter((r) => moduleGroupFor(r['Type of Question']) === 'GDB');
    addCategory(
        'gdb_retrieval_failure',
        'GDB Retrieval Failure (API)',
        'GDB Retrieved Successfully',
        gdbRows.filter((r) => isYes(r['120-min Msg Shown to User?'])),
        gdbRows.filter((r) => isNo(r['120-min Msg Shown to User?'])),
        gdbRows.filter((r) => !isNAlike(r['120-min Msg Shown to User?'])),
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
    // Weight within its own bucket (0-1) - all of a bucket's metric weights
    // sum to 1.
    weight: number;
    // 0-100 health score, already "higher is better" (a rate like Critical
    // Defect Rate is pre-inverted into "...Health" before landing here).
    value: number;
}

export interface ReleaseHealthBucket {
    key: string;
    label: string;
    // Weight within the overall Release Health score (0-1) - all 6 buckets'
    // weights sum to 1 (25/20/20/15/10/10%).
    weight: number;
    score: number;
    metrics: ReleaseHealthMetric[];
}

export type ReleaseHealthDecision = 'GO' | 'GO_WITH_CONDITIONS' | 'NO_GO';

export interface ReleaseHealthResult {
    score: number;
    buckets: ReleaseHealthBucket[];
    decision: ReleaseHealthDecision;
}

// Score-only GO/NO-GO call. INCOMPLETE BY DESIGN: the business plan's full
// decision rule also requires mandatory release gates (rollback tested,
// monitoring active, backup available, no critical blocking defect) that
// don't exist as sheet columns yet - a high score here is not a substitute
// for checking those gates manually.
export function releaseHealthDecision(score: number): ReleaseHealthDecision {
    if (score >= 95) return 'GO';
    if (score >= 90) return 'GO_WITH_CONDITIONS';
    return 'NO_GO';
}

// Release Health's Response Time Health (Performance & SLA bucket): a
// straight 0-100 line over a 24-hour scale - 0min reads as 100, 1,440min
// reads as 0, floored at 0 beyond that. A business threshold, independent of
// the 120min confirmed SLA limit used elsewhere (S_sla/S_rsp).
const RESPONSE_TIME_HEALTH_SCALE_MINUTES = 1440;

// The dashboard's 3 real Channel Tested values (normalizeChannel): Web
// App/WhatsApp/Both, "Both" displayed as "Cross-Platform" on the frontend.
const CHANNEL_PERFORMANCE_CHANNELS = ['Web App', 'WhatsApp', 'Both'] as const;

// Pooled Pass Rate (total Pass ÷ total Pass+Fail, Partial/NA/ungraded
// excluded) across Web App, WhatsApp, and Cross-Platform combined - raw
// counts pooled before dividing so a low-volume channel doesn't count as
// much as a high-volume one would under an unweighted average of the 3
// channels' own pass rates.
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

export interface ChannelPerformanceStat {
    channel: string;
    tests: number;
    passRate: number;
    avgResponse: number;
}

// Channel-wise Performance card. Runs over the same filteredRows as
// calculateKpis/calculateDiagnostics/calculateChartData, scoped to the same
// 3 known Channel Tested values as calculateChannelPerformance above - a
// leaked/unrecognized channel value is excluded rather than shown as a
// bogus row.
export function calculateChannelStats(rows: TestersDashboardRecord[]): ChannelPerformanceStat[] {
    const knownChannels: readonly string[] = CHANNEL_PERFORMANCE_CHANNELS;
    const groups = new Map<string, TestersDashboardRecord[]>();
    rows.forEach((r) => {
        const ch = normalizeChannel(r['Channel Tested']);
        if (!ch || isNAlike(ch) || !knownChannels.includes(ch)) return;
        const existing = groups.get(ch);
        if (existing) existing.push(r);
        else groups.set(ch, [r]);
    });
    return Array.from(groups.entries())
        .map(([channel, channelRows]) => {
            const tests = channelRows.length;
            // Pass % scoped to Pass+Fail rows only - distinct from the
            // Critical-Failures-based Pass Rate in calculateKpis.
            const passed = channelRows.filter((r) => normalizeTestStatus(r['Overall Test Status']) === 'Pass').length;
            const failed = channelRows.filter((r) => normalizeTestStatus(r['Overall Test Status']) === 'Fail').length;
            const passRate = pct(passed, passed + failed);
            let sum = 0;
            let count = 0;
            channelRows.forEach((r) => {
                const m = timeToMinutes(r[RESPONSE_TIME_KEY]);
                if (m !== null) {
                    sum += m;
                    count++;
                }
            });
            const avgResponse = count ? Math.round((sum / count) * 10) / 10 : 0;
            return { channel, tests, passRate, avgResponse };
        })
        .sort((a, b) => b.tests - a.tests);
}

export interface LanguagePerformanceStat {
    language: string;
    tests: number;
    translationAcc: number;
}

// Language Performance card. translationAcc excludes blank/NA Translation
// Quality rows from its own denominator, mirroring Trust/Farmer Experience's
// shared translationQualityPct formula (grouped by language first, so it
// can't reuse that function directly, but keeps its matching rule -
// "correct"/"good" counts as accurate).
export function calculateLanguageStats(rows: TestersDashboardRecord[]): LanguagePerformanceStat[] {
    const groups = new Map<string, TestersDashboardRecord[]>();
    rows.forEach((r) => {
        const lang = toTitleCase(r['Language Tested']);
        if (!lang || isNAlike(lang)) return;
        const existing = groups.get(lang);
        if (existing) existing.push(r);
        else groups.set(lang, [r]);
    });
    return Array.from(groups.entries())
        .map(([language, langRows]) => {
            const tests = langRows.length;
            const translationApplicable = langRows.filter((r) => !isNAlike(r['Translation Quality']));
            const translationAcc = pct(
                translationApplicable.filter((r) => matchesAny(r['Translation Quality'], ['correct', 'good'])).length,
                translationApplicable.length,
            );
            return { language, tests, translationAcc };
        })
        .sort((a, b) => b.tests - a.tests);
}

// Release Health: a 6-bucket weighted model (25/20/20/15/10/10%). Each
// bucket blends 1-5 of its own 0-100 "...Health" metrics (reusing existing
// scores where one already exists, e.g. Trust Score, Pass Rate, SLA
// Compliance) with its own internal weights; the 6 buckets then combine at
// the top level. Two buckets from the wider plan - Security & Privacy and
// Release & Recovery Readiness - are deliberately not built here: there's no
// sheet data yet to back either one.
export function calculateReleaseHealth(rows: TestersDashboardRecord[], typeBranch: TypeBranch = 'all'): ReleaseHealthResult {
    const N = rows.length;
    const categories = calculateCriticalFailureCategories(rows);
    const failureCount = (key: string): number => categories.categories.find((c) => c.key === key)!.failureCount;
    // 100 - failure rate scoped to APPLICABLE rows only - a row with no
    // interpretable signal for a given check is excluded from its own
    // denominator rather than silently counted as healthy, the same
    // convention Trust Score's six components use. Zero applicable rows
    // reads as 0 health, not a default-high 100.
    const applicableHealth = (failCount: number, applicable: number): number =>
        applicable ? 100 - pct(failCount, applicable) : 0;

    // Bucket 1 - AI & Response Quality: Trust Score, reused directly - same
    // typeBranch passed through so this bucket can't silently disagree with
    // the Executive Summary's own Trust Score tile on the Static branch.
    const trustScore = calculateTrustScore(rows, typeBranch).score;

    // Bucket 2 - Functional & Critical Quality.
    //
    // Pass Rate: denominator is rows with real, evaluable data in at least
    // one of the 13 Critical Failure categories (categories.evaluableRows) -
    // a row untested everywhere doesn't "pass by elimination."
    const passApplicable = categories.evaluableRows;
    const passRateV2 = passApplicable ? pct(passApplicable - categories.distinctFailureRows, passApplicable) : 0;

    // Critical Defect Health: shares its denominator with the Executive
    // Summary's "Critical Defects" tile (defectSeverityRecordedRows) - do
    // not let these two scopes drift apart.
    const countCriticalBugs = failureCount('critical_bug');
    const defectSeverityApplicable = defectSeverityRecordedRows(rows).length;
    const criticalDefectHealth = applicableHealth(countCriticalBugs, defectSeverityApplicable);

    // Bucket 3 - Data Integrity & Persistence.
    //
    // Data Integrity Health: Not Saved in DB on either field, OR
    // wrongly-identified-duplicate - a wider set than Not Saved in DB
    // Health/Duplicate Record Health's own single-category counts below, so
    // the 3 metrics aren't redundant. A row is applicable if at least one of
    // the 3 fields carries a clear, non-ambiguous verdict; a row ambiguous
    // on all 3 is excluded rather than defaulting to healthy.
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
    // rows their own category confirmed one way or the other (failureCount +
    // successCount) - the "ambiguous" remainder is excluded rather than
    // counted as healthy.
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
    // No valid readings reads as 0 health here, not a default-high 100.
    const responseTimeHealth = responseMinutesCount
        ? Math.max(
              0,
              Math.min(100, Math.round(100 - (responseMinutesSum / responseMinutesCount / RESPONSE_TIME_HEALTH_SCALE_MINUTES) * 100)),
          )
        : 0;
    const responseSpeed = calculateExperienceScore(rows).breakdown.S_rsp;

    // Bucket 5 - Farmer Experience & Channel Quality.
    const notificationSuccessPct = calculateNotificationSuccess(rows).pct;
    const voiceSuccess = calculateVoiceSuccess(rows);
    const voicePerformance = Math.round((voiceSuccess.score / 10) * 100);
    const translationQuality = translationQualityPct(rows).pct;
    const channelPerformance = calculateChannelPerformance(rows);
    const notificationExperience = calculateNotificationExperience(rows).pct;

    // Bucket 6 - Reliability & Critical Failure Health. Failures are
    // weighted by severity rather than treated equally - Critical categories
    // cost 4x as much per occurrence as Low ones. Categories are not
    // mutually exclusive here (e.g. a 7-day SLA breach is also a 2-hour and
    // 24-hour breach), so a single bad row can rack up multiple categories'
    // penalties, by design.
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

    // Rounds each metric's value, then rounds the bucket's own weighted-sum
    // score - same "round components, then round the combination"
    // convention calculateTrustScore/calculateExperienceScore use.
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
    // Applicable/garbage are excluded from this denominator, not folded into
    // "not within SLA".
    validRows: number;
    withinSlaCount: number;
    withinSlaPct: number;
    exceededSlaPct: number;
    breachedCount: number;
    // Of breachedCount, how many had no parseable Response Time reading and
    // couldn't contribute to avgDelayMinutes - reported separately so that
    // number's sample size is visibly smaller than breachedCount.
    breachedWithoutTimeCount: number;
    // Average (actual Response Time - 120min confirmed SLA limit) across
    // breached rows with a valid Response Time reading.
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
    // Executive Summary's "Critical Defects" tile: (Critical + High
    // severity rows) ÷ rows with a severity recorded × 100 - a separate
    // metric from criticalBreakdown.countCriticalBugs (Critical only, still
    // feeding Release Health), not a replacement for it.
    criticalDefectsPct: number;
    criticalDefectsCriticalCount: number;
    criticalDefectsHighCount: number;
    // Denominator of criticalDefectsPct (defectSeverityRecordedRows), same
    // scope Release Health's Critical Defect Health metric uses.
    criticalDefectsApplicableCount: number;
    // Rows with no usable Defect Severity value - excluded from
    // criticalDefectsPct's denominator. Distinct from a "NA"/"No Defect"
    // row, which is a recorded assessment and stays in the denominator.
    criticalDefectsNoSeverityCount: number;
    criticalFailureCategories: CriticalFailureCategoriesResult;
    releaseHealth: number;
    releaseHealthBreakdown: ReleaseHealthResult;
    slaBreakdown: SlaBreakdown;
}

// The full Executive Summary + Critical Failures + Release Health
// computation. Composes calculateTrustScore/calculateExperienceScore/
// calculateVoiceSuccess rather than recomputing their sub-metrics.
//
// trustBreakdown.Q_trn and experienceBreakdown.Q_trn are always numerically
// equal (same formula, same rows) but computed independently, not shared.
export function calculateKpis(rows: TestersDashboardRecord[], typeBranch: TypeBranch = 'all'): KpiSummary {
    const N = rows.length;

    const trust = calculateTrustScore(rows, typeBranch);
    const experience = calculateExperienceScore(rows);

    // Overall average response time in actual minutes, for the Executive
    // Summary tile - distinct from S_rsp, a 0-100 "speed score" derived from
    // response time.
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
    // Trust Score's A_sci directly so the two headline numbers can never
    // drift apart.
    const sciAccuracy = calculateScientificAccuracy(rows);
    const sciCorrectCount = sciAccuracy.correctCount;
    const scientificAccuracyApplicableCount = sciAccuracy.applicableCount;
    const scientificAccuracyAllRows = trust.breakdown.A_sci;

    // criticalBreakdown/criticalFailuresToday below are derived from this
    // one computation rather than re-filtered independently, so they can
    // never drift from the per-category card's numbers.
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
    // Sum of these 8 categories only - deliberately excludes Answer Never
    // Received/SLA Breached/GDB Retrieval. Use
    // criticalFailureCategories.failuresTotal for the full card total instead.
    const criticalFailuresToday =
        countIncorrect +
        countWeatherIncorrect +
        countMandiIncorrect +
        countSchemeIncorrect +
        countDbFailure +
        countNotifFailure +
        countDuplicateFailure +
        countCriticalBugs;

    const releaseHealthResult = calculateReleaseHealth(rows, typeBranch);

    // Executive Summary's Pass Rate / Fail Rate: a row is a "failure" if it
    // trips any Critical Failure category, a "success" otherwise. Denominator
    // is N (Total Tests Executed), not a Pass+Fail subset, since every row is
    // classifiable one way or the other under this rule. Fail Rate is
    // derived as Pass Rate's complement so the two always sum to exactly
    // 100% - two independent Math.round() calls on complementary percentages
    // can otherwise land on 101 or 99.
    const failedRowCount = criticalFailureCategories.distinctFailureRows;
    const passedRowCount = N - failedRowCount;
    const passRate = pct(passedRowCount, N);
    const failRate = N ? 100 - passRate : 0;
    const totalPassed = passedRowCount;
    const totalFailed = failedRowCount;

    const slaCompliance = calculateSlaCompliance(rows);

    // Avg Delay: SLA Status doesn't store minutes-over, so it's derived as
    // Response Time - 120 (the SLA limit), only for rows marked "SLA
    // Breached" with a valid, parseable Response Time reading.
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

    // Notification Success: Denominator is rows with any real value in
    // "Notification Received?" - not the stricter same-thread/correct-Q-ID
    // combination N_exp uses (a separate, intentionally stricter metric).
    const notificationSuccessResult = calculateNotificationSuccess(rows);
    const notificationSuccess = notificationSuccessResult.pct;
    const notificationSuccessOnTimeCount = notificationSuccessResult.onTime;
    const notificationSuccessTotalCount = notificationSuccessResult.applicable;

    // Executive Summary's "Critical Defects" tile: Critical + High severity
    // rows ÷ rows with a severity recorded × 100. Numerator is wider than
    // criticalBreakdown.countCriticalBugs (Critical only, which still feeds
    // Release Health's Critical Defect Health unchanged); denominator is
    // defectSeverityRecordedRows, not all rows (N) - a row with no severity
    // recorded is excluded rather than counted against the total.
    const severityRecordedRows = defectSeverityRecordedRows(rows);
    const criticalDefectsCriticalCount = rows.filter((r) => normalizeDefectSeverity(r['Defect Severity']) === 'Critical').length;
    const criticalDefectsHighCount = rows.filter((r) => normalizeDefectSeverity(r['Defect Severity']) === 'High').length;
    const criticalDefectsNoSeverityCount = rows.filter((r) => normalizeDefectSeverity(r['Defect Severity']) === '').length;
    const criticalDefectsApplicableCount = severityRecordedRows.length;
    const criticalDefectsPct = pct(criticalDefectsCriticalCount + criticalDefectsHighCount, criticalDefectsApplicableCount);

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
        criticalDefectsPct,
        criticalDefectsCriticalCount,
        criticalDefectsHighCount,
        criticalDefectsApplicableCount,
        criticalDefectsNoSeverityCount,
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
    // Critical + High severity count for the previous period.
    openCriticalDefects: number;
    // Critical-only previous-period count, mirroring criticalBreakdown.
    // countCriticalBugs - not what the "Critical Defects" tile's trend arrow
    // compares against (see criticalDefectsPct below).
    countCriticalBugs: number;
    // Same wider-numerator/matching-denominator definition as calculateKpis'
    // criticalDefectsPct, so the "Critical Defects" tile's trend arrow
    // compares like-for-like against countCriticalBugs' narrower scope above.
    criticalDefectsPct: number;
    notificationSuccess: number;
    voiceSuccess: number;
    rangeLabel: string;
}

// Computes 6 headline metrics over an equal-length window immediately
// preceding the currently selected date range, using the exact same
// non-date filters as the main view. Returns null when there's no
// well-defined period to compare against (Date Range = "All Dates", or
// "Custom Range" with only one of start/end set).
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
    // Same Critical-Failures-based Pass Rate / Fail Rate as calculateKpis, so
    // the trend arrow compares like-for-like against the previous period.
    const prevFailedRowCount = calculateCriticalFailureCategories(prevRows).distinctFailureRows;
    const prevPassedRowCount = total - prevFailedRowCount;
    const prevPassRate = pct(prevPassedRowCount, total);
    const prevFailRate = total ? 100 - prevPassRate : 0;
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
    const prevCriticalBugsOnly = prevRows.filter((r) => normalizeDefectSeverity(r['Defect Severity']) === 'Critical').length;
    // Same definition as calculateKpis' criticalDefectsPct, over the
    // previous-period window's own applicable rows.
    const prevCriticalDefectsPct = pct(prevCriticalDefects, defectSeverityRecordedRows(prevRows).length);
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
        criticalDefectsPct: prevCriticalDefectsPct,
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
