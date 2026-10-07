// Database Logs Analytics KPIs, calculated directly from stored
// TesterLogEntry fields. Re-implements each dashboard card's business
// definition for the current Tester UI - it does not reuse the Google Sheet
// calculations (testersDashboard/*), whose inputs, value vocabulary, and
// data-cleaning rules are Sheet-specific.
//
// Every percentage follows values.ts's zero rule: 0 when nothing is
// applicable, and composite scores leave out parts with no applicable data
// (rather than scoring them 0, which would treat missing data as failure).

import {
    DB_CHANNEL_OPTIONS,
    DB_LANGUAGE_OPTIONS,
    DB_STATIC_TYPE_OPTIONS,
    canonicalTypeValue,
    canonicalValue,
    isDynamicTypeValue,
    optionKey,
} from '../services/dbFilterOptions.js';
import {
    type Entry,
    type Rate,
    average,
    defectSeverity,
    disclaimer120,
    duplicateTagging,
    notificationLinkedQid,
    notificationReceived,
    notificationSameThread,
    overallStatus,
    questionFramed,
    rate,
    responseMinutes,
    retrievalAccuracy,
    round1,
    scientificAccuracy,
    slaStatus,
    sourceLinks,
    translationPass,
    voiceInputQuality,
    voiceOutputQuality,
    weightedScore,
    yesNo,
} from './values.js';
import type {
    DbChannelStat,
    DbCriticalFailureCategories,
    DbCriticalFailureCategory,
    DbExperienceBreakdown,
    DbKpiSummary,
    DbLanguageStat,
    DbReleaseHealth,
    DbReleaseHealthBucket,
    DbReleaseHealthDecision,
    DbTrustBreakdown,
    DbTrustScoreWeights,
    DbVoiceSuccess,
} from './types.js';

// ---- Question type ----

export type DbTypeGroup = 'GDB' | 'Unique' | 'Outreach' | 'Dynamic';
export type DbDomain = 'weather' | 'mandi' | 'scheme';

// GDB / Unique / Outreach, or Dynamic for every Dynamic-branch type -
// including "Static Dynamic" and the legacy bare "Dynamic", per Step 4's
// tree (and the Tester UI's isDynamicQuestionType). Null when unrecognized.
export function typeGroup(e: Entry): DbTypeGroup | null {
    const type = canonicalTypeValue(e.typeOfQuestion);
    if (DB_STATIC_TYPE_OPTIONS.includes(type)) return type as DbTypeGroup;
    return isDynamicTypeValue(e.typeOfQuestion) ? 'Dynamic' : null;
}

// The Dynamic domain an entry's own Type of Question names. Taken from the
// stored type only (no Question Category fallback); "Static Dynamic" and
// the bare legacy "Dynamic" have no domain.
const DOMAIN_BY_TYPE: Record<string, DbDomain> = {
    'Weather Dynamic': 'weather',
    'Mandi Dynamic': 'mandi',
    'Scheme Dynamic': 'scheme',
};
export function domainOf(e: Entry): DbDomain | null {
    return DOMAIN_BY_TYPE[canonicalTypeValue(e.typeOfQuestion)] ?? null;
}

const DOMAIN_FIELD: Record<DbDomain, 'weatherQAnsweredCorrectly' | 'mandiPriceQCorrect' | 'schemeQCorrect'> = {
    weather: 'weatherQAnsweredCorrectly',
    mandi: 'mandiPriceQCorrect',
    scheme: 'schemeQCorrect',
};

// ---- Pass / Fail ----

// DB Pass/Fail rule: the tester's own Overall Test Status verdict (for a
// cross-platform test, the status the form synthesizes from its WebApp and
// WhatsApp statuses). Pass Rate = Pass ÷ entries with a recorded status
// (Pass/Fail/Partial/NA); Fail Rate = Fail ÷ the same. Partial and NA count
// as neither, so the two rates need not sum to 100. Blank statuses are not
// recorded and are left out entirely. This matches the Tester Data tab's
// Pass Rate card (TesterLogService.getSummary). It deliberately does NOT
// use the Google Sheet's rule (any critical-failure category = failed).
export interface DbPassFail {
    passed: number;
    failed: number;
    partial: number;
    recorded: number;
    passRate: number;
    failRate: number;
}

export function passFail(entries: Entry[]): DbPassFail {
    let passed = 0;
    let failed = 0;
    let partial = 0;
    let recorded = 0;
    for (const e of entries) {
        const status = overallStatus(e);
        if (!status) continue;
        recorded++;
        if (status === 'Pass') passed++;
        else if (status === 'Fail') failed++;
        else if (status === 'Partial') partial++;
    }
    return { passed, failed, partial, recorded, passRate: rate(passed, recorded).value, failRate: rate(failed, recorded).value };
}

// ---- Accuracy and quality rates ----

function rateOf<T>(entries: Entry[], outcome: (e: Entry) => T | null, positive: (o: T) => boolean): Rate {
    let applicable = 0;
    let numerator = 0;
    for (const e of entries) {
        const o = outcome(e);
        if (o === null) continue;
        applicable++;
        if (positive(o)) numerator++;
    }
    return rate(numerator, applicable);
}

// Scientific Accuracy: Correct ÷ (Correct + Incorrect + Partially Correct),
// over entries with a recognized Type of Question.
export function scientificAccuracyRate(entries: Entry[]): Rate {
    return rateOf(entries.filter((e) => typeGroup(e) !== null), scientificAccuracy, (o) => o === 'correct');
}

export function domainRate(entries: Entry[], domain: DbDomain): Rate {
    const field = DOMAIN_FIELD[domain];
    return rateOf(entries.filter((e) => domainOf(e) === domain), (e) => yesNo(e[field]), (o) => o === 'yes');
}

export const sourceLinkRate = (entries: Entry[]) => rateOf(entries, sourceLinks, (o) => o === 'correct');
export const questionFramedRate = (entries: Entry[]) => rateOf(entries, questionFramed, (o) => o === 'yes');
export const translationRate = (entries: Entry[]) => rateOf(entries, translationPass, (o) => o);
export const slaRate = (entries: Entry[]) => rateOf(entries, slaStatus, (o) => o === 'within');
export const retrievalRate = (entries: Entry[]) => rateOf(entries, retrievalAccuracy, (o) => o === 'correct');
export const duplicateTaggingRate = (entries: Entry[]) => rateOf(entries, duplicateTagging, (o) => o === 'correct');
export const notificationSuccessRate = (entries: Entry[]) =>
    rateOf(entries, (e) => notificationReceived(e.notificationReceived), (o) => o === 'received');

// Notification Experience: received, on the same thread, and linked to the
// right Q-ID. A notification that was not received is applicable and fails;
// a received one is applicable once both follow-up checks are recorded.
export function notificationExperienceRate(entries: Entry[]): Rate {
    return rateOf(
        entries,
        (e) => {
            const received = notificationReceived(e.notificationReceived);
            if (received === 'notreceived') return false;
            if (received !== 'received') return null;
            const sameThread = notificationSameThread(e);
            const linked = notificationLinkedQid(e);
            if (sameThread === null || linked === null) return null;
            return sameThread === 'yes' && linked === 'yes';
        },
        (ok) => ok,
    );
}

// Response speed: 100 at 0 min down to 0 at 120 min (the 2-hour SLA), averaged.
export function responseSpeed(entries: Entry[]): Rate {
    const scores = entries
        .map(responseMinutes)
        .filter((m): m is number => m !== null)
        .map((m) => Math.max(0, Math.min(100, 100 - (m / 120) * 100)));
    return { value: Math.round(average(scores) ?? 0), numerator: scores.length, applicable: scores.length };
}

export function avgResponse(entries: Entry[]): { minutes: number; samples: number } {
    const values = entries.map(responseMinutes).filter((m): m is number => m !== null);
    return { minutes: round1(average(values) ?? 0), samples: values.length };
}

// ---- Trust Score / Farmer Experience ----

const TRUST_WEIGHTS_DEFAULT: DbTrustScoreWeights = { A_sci: 0.25, A_dom: 0.3, S_lnk: 0.15, Q_frm: 0.1, Q_trn: 0.1, S_sla: 0.1 };
const TRUST_WEIGHTS_STATIC: DbTrustScoreWeights = { A_sci: 0.35, A_dom: null, S_lnk: 0.2, Q_frm: 0.15, Q_trn: 0.15, S_sla: 0.15 };

export function trustScore(entries: Entry[], typeBranch: string): { score: number; breakdown: DbTrustBreakdown; hasData: boolean } {
    const weights = typeBranch === 'Static' ? TRUST_WEIGHTS_STATIC : TRUST_WEIGHTS_DEFAULT;
    const sci = scientificAccuracyRate(entries);
    const lnk = sourceLinkRate(entries);
    const frm = questionFramedRate(entries);
    const trn = translationRate(entries);
    const sla = slaRate(entries);
    // Average of the domains that have data; null when none do.
    const domains = (['weather', 'mandi', 'scheme'] as DbDomain[]).map((d) => domainRate(entries, d)).filter((r) => r.applicable > 0);
    const A_dom = weights.A_dom !== null && domains.length ? Math.round(average(domains.map((r) => r.value))!) : null;

    const parts = [
        { value: sci.value, weight: weights.A_sci, applicable: sci.applicable },
        { value: lnk.value, weight: weights.S_lnk, applicable: lnk.applicable },
        { value: frm.value, weight: weights.Q_frm, applicable: frm.applicable },
        { value: trn.value, weight: weights.Q_trn, applicable: trn.applicable },
        { value: sla.value, weight: weights.S_sla, applicable: sla.applicable },
        { value: A_dom ?? 0, weight: weights.A_dom ?? 0, applicable: A_dom === null ? 0 : 1 },
    ];
    return {
        score: weightedScore(parts),
        breakdown: { A_sci: sci.value, A_dom, S_lnk: lnk.value, Q_frm: frm.value, Q_trn: trn.value, S_sla: sla.value, weights },
        hasData: parts.some((p) => p.applicable > 0 && p.weight > 0),
    };
}

// Voice Input/Output Working and Quality, each a rate; V_io averages the
// ones with data.
function voiceIoParts(entries: Entry[]): Rate[] {
    return [
        rateOf(entries, (e) => yesNo(e.voiceInputWorking), (o) => o === 'yes'),
        rateOf(entries, (e) => yesNo(e.voiceOutputWorking), (o) => o === 'yes'),
        rateOf(entries, (e) => voiceInputQuality(e.voiceInputQuality), (o) => o === 'good'),
        rateOf(entries, (e) => voiceOutputQuality(e.voiceOutputQuality), (o) => o === 'good'),
    ];
}

export function experienceScore(entries: Entry[]): { score: number; breakdown: DbExperienceBreakdown; hasData: boolean } {
    const rsp = responseSpeed(entries);
    const sla = slaRate(entries);
    const vioParts = voiceIoParts(entries);
    const vioApplicable = vioParts.reduce((sum, r) => sum + r.applicable, 0);
    const V_io = weightedScore(vioParts.map((r) => ({ value: r.value, weight: 1, applicable: r.applicable })));
    const trn = translationRate(entries);
    const nexp = notificationExperienceRate(entries);
    const parts = [
        { value: rsp.value, weight: 0.3, applicable: rsp.applicable },
        { value: sla.value, weight: 0.2, applicable: sla.applicable },
        { value: V_io, weight: 0.2, applicable: vioApplicable },
        { value: trn.value, weight: 0.15, applicable: trn.applicable },
        { value: nexp.value, weight: 0.15, applicable: nexp.applicable },
    ];
    return {
        score: weightedScore(parts),
        breakdown: { S_rsp: rsp.value, S_sla: sla.value, V_io, Q_trn: trn.value, N_exp: nexp.value },
        hasData: parts.some((p) => p.applicable > 0),
    };
}

// Voice success on a 0-10 scale: each recorded voice quality reading scores
// 10 (Correct input / Clear output) or 0 (Incorrect, Unclear, Error
// Displayed). The current form has no graded quality levels.
export function voiceSuccess(entries: Entry[]): DbVoiceSuccess {
    const input = entries.map((e) => voiceInputQuality(e.voiceInputQuality)).filter((o) => o !== null).map((o) => (o === 'good' ? 10 : 0));
    const output = entries.map((e) => voiceOutputQuality(e.voiceOutputQuality)).filter((o) => o !== null).map((o) => (o === 'good' ? 10 : 0));
    const inputAvg = average(input);
    const outputAvg = average(output);
    return {
        score: round1(average([...input, ...output]) ?? 0),
        sampleSize: input.length + output.length,
        inputAvg: inputAvg === null ? null : round1(inputAvg),
        inputCount: input.length,
        outputAvg: outputAvg === null ? null : round1(outputAvg),
        outputCount: output.length,
    };
}

// ---- Critical failure categories ----

// SLA breach bands by response time (minutes); a reading's success band is
// the one below its failure band.
const SLA_BANDS = [
    { key: 'sla_breach_2hr', label: 'SLA Breached - 2 Hours', successLabel: 'Within SLA - 2 Hours', fail: (m: number) => m > 120 && m < 1440, ok: (m: number) => m <= 120 },
    { key: 'sla_breach_24hr', label: 'SLA Breached - 24 Hours', successLabel: 'Within SLA - 24 Hours', fail: (m: number) => m >= 1440 && m < 10080, ok: (m: number) => m > 120 && m < 1440 },
    { key: 'sla_breach_7day', label: 'SLA Breached - 7 Days', successLabel: 'Within SLA - 7 Days', fail: (m: number) => m >= 10080, ok: (m: number) => m >= 1440 && m < 10080 },
];

// Each category: outcome(e) -> 'fail' | 'ok' | null (not applicable).
// Replacements for fields the Tester UI no longer collects:
//   - "Not Saved in DB" (questionSavedInDb/answerSavedInDb) -> "Retrieval
//     Failure" from Retrieval Accuracy.
//   - "Duplicate Q-ID Detected" (qIdConsistentAcrossSystems) -> "Duplicate
//     Tagging Error" from Tagging (wrongly tagged / not tagged as duplicate).
//   - "Answer Never Received" is dropped: the form requires both question
//     and answer times, so a blank response time means an incomplete record,
//     not a missing answer.
interface CategoryDef {
    key: string;
    label: string;
    successLabel: string;
    outcome: (e: Entry) => 'fail' | 'ok' | null;
    // Entries that recorded the category's field(s) - its applicableCount.
    // Defaults to entries with an outcome; wider where a recorded value can
    // be neither a failure nor a success (e.g. Medium severity, or a
    // response time in another SLA band).
    applicable?: (e: Entry) => boolean;
}

const failIf = (failed: boolean | null): 'fail' | 'ok' | null => (failed === null ? null : failed ? 'fail' : 'ok');

const CATEGORY_DEFS: CategoryDef[] = [
    { key: 'incorrect_answer', label: 'Incorrect Answers', successLabel: 'Correct Answers',
      outcome: (e) => { const o = scientificAccuracy(e); return o === 'incorrect' ? 'fail' : o === 'correct' ? 'ok' : null; } },
    ...(['weather', 'mandi', 'scheme'] as DbDomain[]).map((d) => ({
        key: `${d}_incorrect`,
        label: { weather: 'Weather Q Incorrect', mandi: 'Mandi Price Q Incorrect', scheme: 'Scheme Q Incorrect' }[d],
        successLabel: { weather: 'Weather Q Correct', mandi: 'Mandi Price Q Correct', scheme: 'Scheme Q Correct' }[d],
        outcome: (e: Entry) => { const o = yesNo(e[DOMAIN_FIELD[d]]); return failIf(o === null ? null : o === 'no'); },
    })),
    { key: 'retrieval_failure', label: 'Retrieval Failure', successLabel: 'Correct Retrieval',
      outcome: (e) => { const o = retrievalAccuracy(e); return failIf(o === null ? null : o === 'incorrect'); } },
    { key: 'notif_failure', label: 'Notification Failure', successLabel: 'Notification Delivered',
      outcome: (e) => {
          const received = notificationReceived(e.notificationReceived);
          const sameThread = notificationSameThread(e);
          const linked = notificationLinkedQid(e);
          if (received === 'notreceived' || sameThread === 'no' || linked === 'no') return 'fail';
          if (received === 'received' && sameThread === 'yes' && linked === 'yes') return 'ok';
          return null;
      },
      applicable: (e) =>
          notificationReceived(e.notificationReceived) !== null || notificationSameThread(e) !== null || notificationLinkedQid(e) !== null },
    { key: 'duplicate_tagging', label: 'Duplicate Tagging Error', successLabel: 'Duplicate Tagged Correctly',
      outcome: (e) => { const o = duplicateTagging(e); return failIf(o === null ? null : o === 'wrong'); } },
    { key: 'critical_bug', label: 'Critical Severity Bugs', successLabel: 'No Critical Bugs',
      outcome: (e) => { const s = defectSeverity(e); return s === 'Critical' ? 'fail' : s === 'NA' ? 'ok' : null; },
      applicable: (e) => defectSeverity(e) !== null },
    ...SLA_BANDS.map((b) => ({
        key: b.key, label: b.label, successLabel: b.successLabel,
        outcome: (e: Entry): 'fail' | 'ok' | null => { const m = responseMinutes(e); return m === null ? null : b.fail(m) ? 'fail' : b.ok(m) ? 'ok' : null; },
        applicable: (e: Entry) => responseMinutes(e) !== null,
    })),
    // A GDB question already has a stored answer; the farmer seeing the
    // "answer within 2 hours" disclaimer means it wasn't retrieved.
    { key: 'gdb_retrieval_failure', label: 'GDB Retrieval Failure (API)', successLabel: 'GDB Retrieved Successfully',
      outcome: (e) => { if (typeGroup(e) !== 'GDB') return null; const o = disclaimer120(e); return failIf(o === null ? null : o === 'received'); } },
];

export function criticalFailureCategories(entries: Entry[]): DbCriticalFailureCategories {
    const failed = new Set<Entry>();
    const succeeded = new Set<Entry>();
    const categories: DbCriticalFailureCategory[] = CATEGORY_DEFS.map((def) => {
        let failureCount = 0;
        let successCount = 0;
        let applicableCount = 0;
        const failureTestIds = new Set<string>();
        for (const e of entries) {
            const o = def.outcome(e);
            if (def.applicable ? def.applicable(e) : o !== null) applicableCount++;
            if (o === 'fail') {
                failureCount++;
                failed.add(e);
                const testId = (e.testId || '').trim();
                if (testId) failureTestIds.add(testId);
            } else if (o === 'ok') {
                successCount++;
                succeeded.add(e);
            }
        }
        return {
            key: def.key,
            label: def.label,
            successLabel: def.successLabel,
            failureCount,
            successCount,
            applicableCount,
            failureTestIds: [...failureTestIds].sort(),
        };
    });
    return {
        categories,
        failuresTotal: categories.reduce((s, c) => s + c.failureCount, 0),
        successesTotal: categories.reduce((s, c) => s + c.successCount, 0),
        distinctFailureRows: failed.size,
        distinctSuccessRows: succeeded.size,
        noFailureRows: entries.length - failed.size,
    };
}

// Reliability penalties per failure (max 4 per entry). Retrieval Failure and
// Duplicate Tagging Error take the weights of answer-quality and duplicate
// failures respectively.
const RELIABILITY_PENALTIES: Record<string, number> = {
    critical_bug: 4,
    incorrect_answer: 3,
    retrieval_failure: 3,
    sla_breach_7day: 3,
    duplicate_tagging: 3,
    gdb_retrieval_failure: 3,
    weather_incorrect: 2,
    mandi_incorrect: 2,
    scheme_incorrect: 2,
    sla_breach_24hr: 2,
    sla_breach_2hr: 1,
    notif_failure: 1,
};

// ---- Defects / SLA ----

export function criticalDefects(entries: Entry[]) {
    const severities = entries.map(defectSeverity);
    const critical = severities.filter((s) => s === 'Critical').length;
    const high = severities.filter((s) => s === 'High').length;
    const recorded = severities.filter((s) => s !== null).length;
    return { critical, high, recorded, noSeverity: entries.length - recorded, pct: rate(critical + high, recorded).value };
}

export function slaBreakdown(entries: Entry[]) {
    const sla = slaRate(entries);
    const breached = entries.filter((e) => slaStatus(e) === 'breached');
    const delays = breached.map(responseMinutes).filter((m): m is number => m !== null).map((m) => Math.max(0, m - 120));
    return {
        validRows: sla.applicable,
        withinSlaCount: sla.numerator,
        withinSlaPct: sla.value,
        exceededSlaPct: sla.applicable ? 100 - sla.value : 0,
        breachedCount: breached.length,
        breachedWithoutTimeCount: breached.length - delays.length,
        avgDelayMinutes: round1(average(delays) ?? 0),
    };
}

// ---- Channel / Language ----

const CHANNEL_LABELS: Record<string, string> = { WebApp: 'Web App', WhatsApp: 'WhatsApp', Both: 'Both' };

export function channelStats(entries: Entry[]): DbChannelStat[] {
    const groups = new Map<string, Entry[]>();
    for (const e of entries) {
        const ch = canonicalValue('channel', e.channelTested, DB_CHANNEL_OPTIONS);
        if (!DB_CHANNEL_OPTIONS.includes(ch)) continue;
        groups.set(ch, [...(groups.get(ch) ?? []), e]);
    }
    return [...groups.entries()]
        .map(([ch, list]) => ({ channel: CHANNEL_LABELS[ch], tests: list.length, passRate: passFail(list).passRate, avgResponse: avgResponse(list).minutes }))
        .sort((a, b) => b.tests - a.tests);
}

const NA_LANGUAGE_KEYS = new Set(['na', 'nil', 'none', 'notapplicable']);

export function languageStats(entries: Entry[]): DbLanguageStat[] {
    const groups = new Map<string, Entry[]>();
    for (const e of entries) {
        const lang = canonicalValue('language', e.languageTested, DB_LANGUAGE_OPTIONS);
        if (!lang || NA_LANGUAGE_KEYS.has(optionKey(lang))) continue;
        groups.set(lang, [...(groups.get(lang) ?? []), e]);
    }
    return [...groups.entries()]
        .map(([language, list]) => ({ language, tests: list.length, translationAcc: translationRate(list).value }))
        .sort((a, b) => b.tests - a.tests);
}

// ---- Release Health ----

export function releaseHealthDecision(score: number): DbReleaseHealthDecision {
    if (score >= 95) return 'GO';
    if (score >= 90) return 'GO_WITH_CONDITIONS';
    return 'NO_GO';
}

function bucket(
    key: string,
    label: string,
    weight: number,
    metrics: { key: string; label: string; weight: number; value: number; applicable: number }[],
): DbReleaseHealthBucket {
    return {
        key,
        label,
        weight,
        score: weightedScore(metrics),
        metrics: metrics.map(({ applicable: _a, ...m }) => ({ ...m, value: Math.round(m.value) })),
        hasData: metrics.some((m) => m.applicable > 0),
    };
}

export function releaseHealth(
    entries: Entry[],
    ctx: {
        trust: { score: number; hasData: boolean };
        passFail: DbPassFail;
        categories: DbCriticalFailureCategories;
    },
): DbReleaseHealth {
    const N = entries.length;
    const defects = criticalDefects(entries);
    const response = avgResponse(entries);
    const voice = voiceSuccess(entries);
    const knownChannel = entries.filter((e) => DB_CHANNEL_OPTIONS.includes(canonicalValue('channel', e.channelTested, DB_CHANNEL_OPTIONS)));
    const channelPassFail = passFail(knownChannel);
    const failureCount = (key: string) => ctx.categories.categories.find((c) => c.key === key)?.failureCount ?? 0;
    const penalty = Object.entries(RELIABILITY_PENALTIES).reduce((sum, [key, p]) => sum + failureCount(key) * p, 0);
    const sla = slaRate(entries);
    const retrieval = retrievalRate(entries);
    const tagging = duplicateTaggingRate(entries);
    const notif = notificationSuccessRate(entries);
    const trn = translationRate(entries);
    const nexp = notificationExperienceRate(entries);
    const speed = responseSpeed(entries);

    const buckets = [
        bucket('ai_response_quality', 'AI & Response Quality', 0.25, [
            { key: 'trust_score', label: 'Trust Score', weight: 1, value: ctx.trust.score, applicable: ctx.trust.hasData ? 1 : 0 },
        ]),
        bucket('functional_critical_quality', 'Functional & Critical Quality', 0.2, [
            { key: 'pass_rate', label: 'Pass Rate', weight: 0.5, value: ctx.passFail.passRate, applicable: ctx.passFail.recorded },
            { key: 'critical_defect_health', label: 'Critical Defect Health', weight: 0.5,
              value: defects.recorded ? 100 - rate(defects.critical, defects.recorded).value : 0, applicable: defects.recorded },
        ]),
        // Replaces Data Integrity & Persistence, whose DB-save/Q-ID fields
        // the Tester UI no longer collects.
        bucket('retrieval_tagging_integrity', 'Retrieval & Tagging Integrity', 0.2, [
            { key: 'retrieval_accuracy', label: 'Retrieval Accuracy', weight: 0.6, value: retrieval.value, applicable: retrieval.applicable },
            { key: 'duplicate_tagging_accuracy', label: 'Duplicate Tagging Accuracy', weight: 0.4, value: tagging.value, applicable: tagging.applicable },
        ]),
        bucket('performance_sla', 'Performance & SLA', 0.15, [
            { key: 'sla_compliance', label: 'SLA Compliance', weight: 0.5, value: sla.value, applicable: sla.applicable },
            { key: 'response_time_health', label: 'Response Time Health', weight: 0.3,
              value: response.samples ? Math.max(0, Math.min(100, Math.round(100 - (response.minutes / 1440) * 100))) : 0, applicable: response.samples },
            { key: 'response_speed', label: 'Response Speed', weight: 0.2, value: speed.value, applicable: speed.applicable },
        ]),
        bucket('farmer_experience_channel_quality', 'Farmer Experience & Channel Quality', 0.1, [
            { key: 'notification_success', label: 'Notification Success', weight: 0.25, value: notif.value, applicable: notif.applicable },
            { key: 'voice_performance', label: 'Voice Performance', weight: 0.25, value: Math.round(voice.score * 10), applicable: voice.sampleSize },
            { key: 'translation_quality', label: 'Translation Quality', weight: 0.2, value: trn.value, applicable: trn.applicable },
            { key: 'channel_performance', label: 'Channel Performance', weight: 0.2, value: channelPassFail.passRate, applicable: channelPassFail.recorded },
            { key: 'notification_experience', label: 'Notification Experience', weight: 0.1, value: nexp.value, applicable: nexp.applicable },
        ]),
        bucket('reliability_critical_failure_health', 'Reliability & Critical Failure Health', 0.1, [
            { key: 'reliability_health', label: 'Reliability Health', weight: 1,
              value: N ? Math.max(0, Math.round(100 - (penalty / (N * 4)) * 100)) : 0, applicable: N },
        ]),
    ];
    const score = weightedScore(buckets.map((b) => ({ value: b.score, weight: b.weight, applicable: b.hasData ? 1 : 0 })));
    return { score, buckets, decision: releaseHealthDecision(score) };
}

// ---- All KPIs ----

export function calculateDbKpis(entries: Entry[], typeBranch: string): DbKpiSummary {
    const N = entries.length;
    const trust = trustScore(entries, typeBranch);
    const experience = experienceScore(entries);
    const pf = passFail(entries);
    const sci = scientificAccuracyRate(entries);
    const response = avgResponse(entries);
    const notif = notificationSuccessRate(entries);
    const defects = criticalDefects(entries);
    const categories = criticalFailureCategories(entries);
    const health = releaseHealth(entries, { trust, passFail: pf, categories });

    return {
        N,
        trustScore: trust.score,
        trustBreakdown: trust.breakdown,
        experienceScore: experience.score,
        experienceBreakdown: experience.breakdown,
        avgResponseMinutes: response.minutes,
        avgResponseSampleCount: response.samples,
        totalTests: N,
        passRate: pf.passRate,
        totalPassed: pf.passed,
        failRate: pf.failRate,
        totalFailed: pf.failed,
        totalPartial: pf.partial,
        statusRecordedCount: pf.recorded,
        sciCorrectCount: sci.numerator,
        scientificAccuracyApplicableCount: sci.applicable,
        scientificAccuracyAllRows: sci.value,
        voiceSuccess: voiceSuccess(entries),
        notificationSuccess: notif.value,
        notificationSuccessOnTimeCount: notif.numerator,
        notificationSuccessTotalCount: notif.applicable,
        criticalDefectsPct: defects.pct,
        criticalDefectsCriticalCount: defects.critical,
        criticalDefectsHighCount: defects.high,
        criticalDefectsApplicableCount: defects.recorded,
        criticalDefectsNoSeverityCount: defects.noSeverity,
        criticalFailureCategories: categories,
        releaseHealth: health.score,
        releaseHealthBreakdown: health,
        slaBreakdown: slaBreakdown(entries),
    };
}
