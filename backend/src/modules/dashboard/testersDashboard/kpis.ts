// KPI calculation logic for the Testers Dashboard - Trust Score, Farmer
// Experience Score, the Executive Summary tiles, Critical Failures /
// Release Health, and the "vs previous period" comparison.
//
// Ported near-verbatim from frontend/src/features/testersDashboard/TestersDashboard.tsx
// (Phase 3 of moving KPI/diagnostics/chart calculation server-side - see
// normalize.ts for Phase 1's normalizers and filters.ts for Phase 2's
// filtering/date-window logic, which these compose rather than duplicate).
//
// This ports the CURRENT frontend versions of calculateTrustScore and the
// criticalFailuresToday calculation, which already include two fixes
// landed directly in the frontend after Phase 1 (see normalize.ts's
// header comment and filters.ts's Phase 3 note for the same callout):
//   - E_exp (Trust Score's Expert Matching) recognizes "displayed", not
//     just "yes"/"y", in the "Correct Expert Name displayed?" field.
//   - countNotifFailure recognizes "no"/"NO", not just "not received", in
//     the "Notification Received?" field.

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
    isSourceLinkRelevant,
    timeToMinutes,
    translationQualityPct,
    calculateSlaCompliance,
    calculateVoiceSuccess,
    calculateNotificationExperience,
    type VoiceSuccessResult,
} from './normalize.js';
import {
    RESPONSE_TIME_KEY,
    getPreviousPeriodWindow,
    getPreviousPeriodRows,
    type TestersDashboardFilters,
} from './filters.js';

// translationQualityPct/calculateSlaCompliance/calculateVoiceSuccess/
// calculateNotificationExperience used to be defined in this file - moved to
// normalize.js (see its own header comment) so diagnostics.ts's Overall
// Module Performance work can reuse the exact same formulas without an
// import cycle. Re-exported below so existing importers of this module
// (e.g. kpis.test.ts's `import { calculateVoiceSuccess } from './kpis.js'`)
// keep working unchanged.
export { calculateVoiceSuccess };
export type { VoiceSuccessResult };

export interface TrustScoreBreakdown {
    A_sci: number;
    A_dom: number;
    S_lnk: number;
    E_exp: number;
    Q_trn: number;
    C_chn: number;
    // Denominator behind C_chn (rows with Channel Tested = "Both") - reported
    // alongside the percentage since it's much smaller than the other 5
    // components' denominators and shouldn't be read as if it carries the
    // same statistical weight.
    C_chn_sampleSize: number;
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

// Trust Score: 40% Scientific Accuracy + 20% Domain Accuracy (Weather/
// Mandi/Scheme, averaged) + 10% Source Links + 10% Expert Matching + 10%
// Translation Quality + 10% Channel Consistency.
//
// Per Hemanth's confirmation, A_sci/S_lnk/E_exp/Q_trn all exclude blank/NA
// rows from their denominator - a row where the field was never filled in
// isn't a wrong answer, it's not applicable/not evaluated, and shouldn't
// drag the percentage down the way a genuine incorrect answer does.
// Confirmed via a live-data investigation that these 4 fields' blanks are
// spread roughly evenly across every Type of Question (not concentrated in
// one), i.e. testers skipping the field rather than it being genuinely
// inapplicable to specific question types.
//
// A_dom already excluded NA per-domain before this and is UNCHANGED here.
//
// C_chn: per Dhaarani S's (tester team) written clarification, Channel
// Consistency checks whether the same question gets the exact same answer
// on both WhatsApp Bot and Web Chatbot - only meaningful for questions
// genuinely tested on both channels. Denominator is now rows with Channel
// Tested = "Both" (currently 137 of them), not all N rows - a much smaller,
// but now correctly-scoped, sample.
export function calculateTrustScore(rows: TestersDashboardRecord[]): TrustScoreResult {
    const N = rows.length;
    if (!N) {
        return { score: 0, breakdown: { A_sci: 0, A_dom: 0, S_lnk: 0, E_exp: 0, Q_trn: 0, C_chn: 0, C_chn_sampleSize: 0 } };
    }

    const sciApplicable = rows.filter((r) => !isNAlike(r['Answer Scientifically Correct?']));
    const A_sci = pct(
        sciApplicable.filter((r) => matchesAny(r['Answer Scientifically Correct?'], ['correct'])).length,
        sciApplicable.length,
    );

    const weatherRows = rows.filter((r) => !isNAlike(r['Weather Q Answered Correctly?']));
    const mandiRows = rows.filter((r) => !isNAlike(r['Mandi Price Q Correct?']));
    const schemeRows = rows.filter((r) => !isNAlike(r['Scheme Q Correct?']));
    const weatherAcc = weatherRows.length
        ? pct(weatherRows.filter((r) => isYes(r['Weather Q Answered Correctly?'])).length, weatherRows.length)
        : 100;
    const mandiAcc = mandiRows.length
        ? pct(mandiRows.filter((r) => isYes(r['Mandi Price Q Correct?'])).length, mandiRows.length)
        : 100;
    const schemeAcc = schemeRows.length
        ? pct(schemeRows.filter((r) => isYes(r['Scheme Q Correct?'])).length, schemeRows.length)
        : 100;
    const A_dom = Math.round((weatherAcc + mandiAcc + schemeAcc) / 3); // unchanged

    const lnkApplicable = rows.filter((r) => !isNAlike(r['Correct Source Links Provided?']));
    const S_lnk = pct(
        lnkApplicable.filter((r) => isSourceLinkRelevant(r['Correct Source Links Provided?'])).length,
        lnkApplicable.length,
    );

    // "Displayed"/"DISPLAYED" (12 rows, 11 of them Test Log 2.0) shows up as
    // a value in THIS field too, not just its sibling "Expert Name
    // Displayed?" - matching "yes"/"y" only was silently excluding these
    // from the numerator. Extending just this call site (not a shared
    // helper) to also accept "displayed", matching how the sibling field's
    // own matchesAny(..., ["displayed"]) already treats it.
    const expApplicable = rows.filter(
        (r) => !isNAlike(r['Expert Name Displayed?']) && !isNAlike(r['Correct Expert Name displayed?']),
    );
    const E_exp = pct(
        expApplicable.filter(
            (r) =>
                matchesAny(r['Expert Name Displayed?'], ['displayed']) &&
                matchesAny(r['Correct Expert Name displayed?'], ['yes', 'y', 'displayed']),
        ).length,
        expApplicable.length,
    );

    const Q_trn = translationQualityPct(rows).pct;

    const bothChannelRows = rows.filter((r) => (r['Channel Tested'] || '').trim().toLowerCase() === 'both');
    const C_chn = bothChannelRows.length
        ? pct(bothChannelRows.filter((r) => isYes(r['WhatsApp vs Web Answer Match?'])).length, bothChannelRows.length)
        : 0;

    const score = Math.round(0.4 * A_sci + 0.2 * A_dom + 0.1 * S_lnk + 0.1 * E_exp + 0.1 * Q_trn + 0.1 * C_chn);
    return { score, breakdown: { A_sci, A_dom, S_lnk, E_exp, Q_trn, C_chn, C_chn_sampleSize: bothChannelRows.length } };
}

// Does this set of rows have at least one row with real (non-blank/NA) data
// in ANY of Trust Score's 6 sub-metric fields? Used only by the daily trend
// chart (chartData.ts) to decide whether a day's Trust Score point
// represents genuine signal or should render as a gap instead of a number -
// deliberately a separate function, not a change to calculateTrustScore
// itself. A_dom's own default-to-100-when-empty behavior (see
// calculateTrustScore above) is confirmed correct for the main dashboard's
// Trust Score card and stays completely unchanged; this function exists
// because A_dom's default is exactly what let a day with ZERO real rows
// still produce a "real-looking" 20% score (0.2 * 100, with the other 5
// components correctly at 0) instead of visibly showing no data - the daily
// chart needs to detect that specific case without altering the underlying
// calculation main dashboard consumers rely on.
export function trustScoreHasData(rows: TestersDashboardRecord[]): boolean {
    if (!rows.length) return false;
    const hasSci = rows.some((r) => !isNAlike(r['Answer Scientifically Correct?']));
    const hasDomain =
        rows.some((r) => !isNAlike(r['Weather Q Answered Correctly?'])) ||
        rows.some((r) => !isNAlike(r['Mandi Price Q Correct?'])) ||
        rows.some((r) => !isNAlike(r['Scheme Q Correct?']));
    const hasLnk = rows.some((r) => !isNAlike(r['Correct Source Links Provided?']));
    const hasExp = rows.some(
        (r) => !isNAlike(r['Expert Name Displayed?']) && !isNAlike(r['Correct Expert Name displayed?']),
    );
    const hasTrn = rows.some((r) => !isNAlike(r['Translation Quality']));
    const hasChn = rows.some((r) => (r['Channel Tested'] || '').trim().toLowerCase() === 'both');
    return hasSci || hasDomain || hasLnk || hasExp || hasTrn || hasChn;
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
    // shared N - per a live-data investigation, blank rate ranges 57%-60%
    // per field and is moderately concentrated by Type of Question
    // (50%-78% blank rate depending on type), same NA-exclusion pattern
    // already applied elsewhere (A_sci/S_lnk/E_exp/Q_trn, N_exp, S_sla).
    const voiceInWorking = applicablePct(rows, 'Voice Input Working?', (r) => isYes(r['Voice Input Working?']));
    const voiceOutWorking = applicablePct(rows, 'Voice Output Working?', (r) => isYes(r['Voice Output Working?']));
    const voiceInQuality = applicablePct(rows, 'Voice Input Quality', (r) => matchesAny(r['Voice Input Quality'], ['clear']));
    const voiceOutQuality = applicablePct(rows, 'Voice Output Quality', (r) => matchesAny(r['Voice Output Quality'], ['clear']));
    const V_io = Math.round((voiceInWorking + voiceOutWorking + voiceInQuality + voiceOutQuality) / 4);

    const Q_trn = translationQualityPct(rows).pct;

    // N_exp: all 3 conditions required, denominator scoped to applicable
    // (non-blank/NA) rows - see calculateNotificationExperience (normalize.js)
    // for the full formula and its NA-exclusion rationale. Extracted out of
    // this function into a shared helper so diagnostics.ts's Overall Module
    // Performance work can reuse the identical, already-fixed formula.
    const N_exp = calculateNotificationExperience(rows).pct;

    const score = Math.round(0.3 * S_rsp + 0.2 * S_sla + 0.2 * V_io + 0.15 * Q_trn + 0.15 * N_exp);
    return { score, breakdown: { S_rsp, S_sla, V_io, Q_trn, N_exp } };
}

// Same purpose as trustScoreHasData above, for Farmer Experience Score's 5
// sub-metrics - used only by the daily trend chart. Unlike A_dom, none of
// S_rsp/S_sla/V_io/Q_trn/N_exp has a non-zero empty-data default (all
// correctly return 0 via pct(0, 0) or an explicit ": 0" fallback), so a
// fully-empty day already scores a true 0%, not a misleading floor - this
// function exists to distinguish that genuine 0% from "no data at all" so
// the chart can render a gap instead of a flat line at 0.
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

export interface ReleaseBreakdown {
    passRate: number;
    criticalDefects: number;
    criticalDefectRate: number;
    dataIntegrityFailures: number;
    dataIntegrityRate: number;
}

// SLA Compliance card - built on the confirmed decision to trust what
// testers explicitly marked in "SLA Status" (normalizeSlaStatus), not a
// fresh Response-Time-based recomputation.
export interface SlaBreakdown {
    // Rows with a real, recognized SLA Status value - blank/NA/Not
    // Applicable/garbage are excluded from this denominator entirely (see
    // normalizeSlaStatus), not folded into "not within SLA".
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
    voiceSuccess: VoiceSuccessResult;
    notificationSuccess: number;
    notificationSuccessOnTimeCount: number;
    notificationSuccessTotalCount: number;
    criticalFailuresToday: number;
    criticalBreakdown: CriticalFailuresBreakdown;
    releaseHealth: number;
    releaseBreakdown: ReleaseBreakdown;
    slaBreakdown: SlaBreakdown;
}

// The full Executive Summary + Critical Failures + Release Health
// computation - matches the frontend's `kpis` useMemo. Composes
// calculateTrustScore/calculateExperienceScore/calculateVoiceSuccess
// rather than recomputing their sub-metrics.
//
// Note on Q_trn: calculateTrustScore and calculateExperienceScore each
// compute their own Translation Quality percentage internally, using the
// identical formula over the same `rows` - so trustBreakdown.Q_trn and
// experienceBreakdown.Q_trn are always numerically equal. The frontend's
// useMemo reads both from the same destructured variable (an artifact of
// its destructuring order, not a deliberate choice); this port instead
// takes each function's own breakdown value directly, which produces the
// identical result more directly.
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

    // Raw count behind A_sci (Scientific Accuracy) for the info popover -
    // same "correct" definition calculateTrustScore uses internally,
    // recomputed here rather than changing that function's return shape
    // since it's also used by the trend chart, which only needs the score.
    const sciCorrectCount = rows.filter((r) => matchesAny(r['Answer Scientifically Correct?'], ['correct'])).length;

    const countIncorrect = rows.filter((r) => matchesAny(r['Answer Scientifically Correct?'], ['incorrect'])).length;
    const countWeatherIncorrect = rows.filter((r) => isNo(r['Weather Q Answered Correctly?'])).length;
    const countMandiIncorrect = rows.filter((r) => isNo(r['Mandi Price Q Correct?'])).length;
    const countSchemeIncorrect = rows.filter((r) => isNo(r['Scheme Q Correct?'])).length;
    const countDbFailure = rows.filter(
        (r) =>
            matchesAny(r['Question Saved in DB?'], ['not saved']) ||
            matchesAny(r['Answer Saved in DB?'], ['not saved']),
    ).length;
    // KPI Formula Logic doc describes this broadly as "notification
    // validations" (plural) - using all 3 notification-related fields,
    // matching the original outreach_stt tool's check, rather than just
    // the single field listed in the KPI Mapping sample list.
    //
    // "no"/"NO" (238 rows, 235 of them Test Log 2.0's apparent shorthand
    // for "not received") wasn't recognized by the "not received" exact
    // match, so these rows were correctly excluded from the Notification
    // Success numerator but silently missing from this failure count -
    // included here, not in Notification Success (that metric was already
    // correct).
    const countNotifFailure = rows.filter(
        (r) =>
            matchesAny(r['Notification Received?'], ['not received', 'no']) ||
            isNo(r['Notification on Same Thread?']) ||
            isNo(r['Notification Linked Correct Q-ID?']),
    ).length;
    // Newly added per the KPI Mapping doc - previously only used in
    // Release Health, not counted here despite being listed for this KPI.
    const countDuplicateFailure = rows.filter((r) =>
        matchesAny(r['Q-ID Consistent Across Systems?'], ['wrongly identified as duplicate']),
    ).length;
    const countCriticalBugs = rows.filter((r) => normalizeDefectSeverity(r['Defect Severity']) === 'Critical').length;
    const criticalFailuresToday =
        countIncorrect +
        countWeatherIncorrect +
        countMandiIncorrect +
        countSchemeIncorrect +
        countDbFailure +
        countNotifFailure +
        countDuplicateFailure +
        countCriticalBugs;

    const totalPassed = rows.filter((r) => normalizeTestStatus(r['Overall Test Status']) === 'Pass').length;
    const totalFailed = rows.filter((r) => normalizeTestStatus(r['Overall Test Status']) === 'Fail').length;
    // Per Hemanth's confirmation: Pass Rate / Fail Rate is now a ratio of
    // Pass vs Fail only, not a share of every row - Partial/NA/other
    // non-Pass/Fail statuses are excluded from this denominator (they're
    // still counted/shown normally wherever Overall Test Status's own
    // distribution is reported elsewhere, just not folded into this ratio).
    // failRate is derived as the complement (100 - passRate) rather than
    // computed independently via pct(), so the two are guaranteed to sum to
    // exactly 100% - two independent Math.round() calls on complementary
    // percentages can occasionally land on 101 (e.g. 12.5%/87.5% both
    // rounding up) or 99, which this sidesteps entirely.
    const passFailTotal = totalPassed + totalFailed;
    const passRate = pct(totalPassed, passFailTotal);
    const failRate = passFailTotal ? 100 - passRate : 0;
    const criticalDefectRate = pct(countCriticalBugs, N);
    const dataIntegrityFailures = rows.filter(
        (r) =>
            matchesAny(r['Question Saved in DB?'], ['not saved']) ||
            matchesAny(r['Answer Saved in DB?'], ['not saved']) ||
            matchesAny(r['Q-ID Consistent Across Systems?'], ['wrongly identified as duplicate']),
    ).length;
    const dataIntegrityRate = pct(dataIntegrityFailures, N);
    const rawReleaseHealth = N ? Math.round(passRate - criticalDefectRate - dataIntegrityRate) : 0;
    const releaseHealth = Math.max(0, Math.min(100, rawReleaseHealth));

    // SLA Compliance card - computed via the same calculateSlaCompliance()
    // helper Farmer Experience's S_sla uses above, so the two never
    // disagree. validRows/withinSlaPct/exceededSlaPct here excludes
    // blank/NA/Not Applicable/garbage (normalizeSlaStatus returns null for
    // those) from the denominator entirely - only rows with a real "Within
    // SLA" or "SLA Breached" verdict count. exceededSlaPct is guarded the
    // same way passRate/releaseHealth are elsewhere in this function: with
    // 0 valid rows, pct(0, 0) already returns 0 for withinSlaPct, but "100 -
    // withinSlaPct" would otherwise wrongly read as 100% exceeded when
    // there's actually no SLA data at all.
    const slaCompliance = calculateSlaCompliance(rows);

    // Avg Delay: SLA Status doesn't store minutes-over, so it's derived as
    // Response Time - 120 (the confirmed SLA limit - see the "120-min Msg
    // Shown to User?" column name and Response Speed's existing threshold),
    // only for rows marked "SLA Breached" that ALSO have a valid,
    // parseable Response Time reading. breachedWithoutTimeCount is reported
    // separately so avgDelayMinutes' real sample size is visible, not
    // silently smaller than breachedCount.
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

    // Voice Success KPI card. Uses the data-verified Clear/Good/Distorted/No
    // Output mapping in normalize.ts. Sample size shown alongside the score
    // since a low count (e.g. after heavy filtering) makes a single average
    // less meaningful.
    const voiceSuccess = calculateVoiceSuccess(rows);

    // Notification Success KPI card. Per Nandan's confirmation, only
    // "Received on Time" counts as success - NOT the stricter same-thread /
    // correct-Q-ID combination used inside Farmer Experience Score's N_exp
    // (that combination is a separate, intentionally stricter metric and is
    // unaffected by this). Denominator is rows with any real value in
    // "Notification Received?" (excludes NA/blank rows where the
    // notification check didn't apply).
    const notifRecords = rows.filter((r) => !isNAlike(r['Notification Received?']));
    const notifOnTime = notifRecords.filter((r) => matchesAny(r['Notification Received?'], ['received on time']));
    const notificationSuccess = pct(notifOnTime.length, notifRecords.length);
    const notificationSuccessOnTimeCount = notifOnTime.length;
    const notificationSuccessTotalCount = notifRecords.length;

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
        releaseHealth,
        releaseBreakdown: {
            passRate,
            criticalDefects: countCriticalBugs,
            criticalDefectRate,
            dataIntegrityFailures,
            dataIntegrityRate,
        },
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
    // countCriticalBugs's definition exactly (normalizeDefectSeverity ===
    // 'Critical') - added so the "All Critical Defects" card's trend arrow
    // can compare like-for-like against its now-Critical-only headline
    // number (kpis.criticalBreakdown.countCriticalBugs) instead of the
    // wider Critical+High openCriticalDefects above, which would otherwise
    // silently point the wrong direction (e.g. a High-only spike showing
    // as "Critical defects up" when Critical itself didn't move).
    countCriticalBugs: number;
    notificationSuccess: number;
    voiceSuccess: number;
    rangeLabel: string;
}

// Real "vs previous period" comparison, not a fabricated number: computes
// 6 headline metrics over an equal-length window immediately preceding the
// currently selected date range, using the exact same non-date filters
// (Type of Question, Channel, etc.) as the main view. Returns null when
// there's no well-defined period to compare against (Date Range = "All
// Dates", or "Custom Range" with only one of start/end set).
//
// Composes Phase 2's getPreviousPeriodWindow (for rangeLabel) and
// getPreviousPeriodRows (for the actual rows) rather than recomputing the
// window/filtering logic here.
//
// NOTE: openCriticalDefects here counts Critical AND High severity - a
// different (wider) definition than criticalFailuresToday's
// countCriticalBugs above (Critical only). Both are ported verbatim from
// the frontend, which genuinely uses two different severity scopes for
// these two different metrics.
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
    const prevPassed = prevRows.filter((r) => normalizeTestStatus(r['Overall Test Status']) === 'Pass').length;
    const prevFailed = prevRows.filter((r) => normalizeTestStatus(r['Overall Test Status']) === 'Fail').length;
    // Same Pass-vs-Fail-only ratio as calculateKpis above, for an
    // apples-to-apples "vs previous period" comparison. failRate derived as
    // the complement so the two always sum to exactly 100%.
    const prevPassFailTotal = prevPassed + prevFailed;
    const prevPassRate = pct(prevPassed, prevPassFailTotal);
    const prevFailRate = prevPassFailTotal ? 100 - prevPassRate : 0;
    const sciRows = prevRows.filter((r) => !isNAlike(r['Answer Scientifically Correct?']));
    const prevSciCorrect = sciRows.filter((r) => matchesAny(r['Answer Scientifically Correct?'], ['correct'])).length;
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
    const prevNotifRecords = prevRows.filter((r) => !isNAlike(r['Notification Received?']));
    const prevNotifOnTime = prevNotifRecords.filter((r) => matchesAny(r['Notification Received?'], ['received on time']));
    const prevVoiceSuccess = calculateVoiceSuccess(prevRows);

    return {
        totalTests: total,
        passRate: prevPassRate,
        failRate: prevFailRate,
        avgResponseMinutes: countMin ? Math.round((sumMin / countMin) * 10) / 10 : 0,
        scientificAccuracy: pct(prevSciCorrect, sciRows.length),
        openCriticalDefects: prevCriticalDefects,
        countCriticalBugs: prevCriticalBugsOnly,
        notificationSuccess: pct(prevNotifOnTime.length, prevNotifRecords.length),
        voiceSuccess: prevVoiceSuccess.score,
        rangeLabel: `${window.prevStart} to ${window.prevEnd}`,
    };
}

export interface PeriodDelta {
    text: string;
    className: string;
}

// Generic "vs previous period" delta label - direction-only (green for up,
// red for down), no per-metric judgment about whether up is "good" (e.g.
// up is good for Pass Rate but bad for Fail Rate) - matching the reference
// dashboard's plain directional-arrow style rather than inventing a
// good/bad interpretation per metric.
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
