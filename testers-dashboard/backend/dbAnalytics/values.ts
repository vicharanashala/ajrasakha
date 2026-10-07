// Stored-value classification and number helpers for Database Logs
// Analytics. Every classifier reads a raw TesterLogEntry field and maps the
// current Tester UI options (frontend/src/testerLog/types.ts) - plus the
// legacy spellings still stored from before the form changed - to a small
// outcome set. Matching uses Step 4's optionKey (case-, spacing- and
// punctuation-insensitive, "&" = "and"); stored values are never modified.
//
// Rule for every classifier: blank, NA-like, and unrecognized values return
// null = "not applicable". They are left out of a metric's denominator and
// are never counted as failures.

import { optionKey, canonicalValue, DB_DEFECT_SEVERITY_OPTIONS, DB_OVERALL_STATUS_OPTIONS } from '../services/dbFilterOptions.js';
import type { DbAnalyticsEntry } from '../interfaces/ITestersDbAnalyticsService.js';

export type Entry = DbAnalyticsEntry;

// ---- Zero / no-applicable-data rule ----

// A rate with its denominator, so callers can tell "0%" from "no data".
export interface Rate {
    // Rounded percentage 0-100; 0 when applicable is 0 (never NaN/Infinity).
    value: number;
    numerator: number;
    applicable: number;
}

export function rate(numerator: number, applicable: number): Rate {
    return { value: applicable > 0 ? Math.round((numerator / applicable) * 100) : 0, numerator, applicable };
}

// Weighted average over the parts that HAVE applicable data; parts with none
// are left out and their weight redistributed, so missing data never drags a
// score down as if it were a failure. 0 when no part has data.
export function weightedScore(parts: { value: number; weight: number; applicable: number }[]): number {
    const scored = parts.filter((p) => p.applicable > 0 && p.weight > 0);
    const totalWeight = scored.reduce((sum, p) => sum + p.weight, 0);
    return totalWeight > 0 ? Math.round(scored.reduce((sum, p) => sum + p.value * p.weight, 0) / totalWeight) : 0;
}

export function average(values: number[]): number | null {
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

export const round1 = (n: number): number => Math.round(n * 10) / 10;

// ---- Durations ----

// Minutes from a stored duration: "HH:MM:SS" (what the server computes for
// response times and TATs), "MM:SS", or a plain number of minutes. Null for
// blank/invalid/negative values.
export function durationMinutes(raw: unknown): number | null {
    if (typeof raw === 'number') return Number.isFinite(raw) && raw >= 0 ? raw : null;
    const s = typeof raw === 'string' ? raw.trim() : '';
    if (!s) return null;
    if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
    const parts = s.split(':');
    if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
    const [a, b, c] = parts.map(Number);
    return parts.length === 3 ? a * 60 + b + c / 60 : a + b / 60;
}

// ---- Option tables ----

type Table<T extends string> = Record<string, T>;

// Returns the outcome for a stored value, or null (not applicable).
function classify<T extends string>(raw: unknown, table: Table<T>): T | null {
    if (typeof raw !== 'string') return null;
    return table[optionKey(raw)] ?? null;
}

// Answer Quality - Scientific Accuracy: Correct / Incorrect / Partially Correct.
const SCIENTIFIC: Table<'correct' | 'incorrect' | 'partial'> = {
    correct: 'correct', incorrect: 'incorrect', partiallycorrect: 'partial',
    yes: 'correct', y: 'correct', no: 'incorrect', n: 'incorrect',
};
export const scientificAccuracy = (e: Entry) => classify(e.answerScientificallyCorrect, SCIENTIFIC);

// Yes / No / NA fields: Weather/Mandi/Scheme correct, Voice Input/Output Working.
const YES_NO: Table<'yes' | 'no'> = { yes: 'yes', y: 'yes', no: 'no', n: 'no' };
export const yesNo = (raw: unknown) => classify(raw, YES_NO);

// Correct Source Links Provided? - current options, then legacy free text.
const SOURCE_LINKS: Table<'correct' | 'incorrect'> = {
    correctlinkprovided: 'correct', incorrectlinkprovided: 'incorrect', linknotprovided: 'incorrect', linknotaccessible: 'incorrect',
    yes: 'correct', y: 'correct', provided: 'correct', providedandrelevant: 'correct',
    no: 'incorrect', n: 'incorrect', notprovided: 'incorrect', providedandirrelevant: 'incorrect', providedandnotrelevant: 'incorrect',
};
export const sourceLinks = (e: Entry) => classify(e.correctSourceLinksProvided, SOURCE_LINKS);

// Question Framed Correctly? - Yes / No / Partially Correct (legacy: Well
// Framed / Ambiguous / Incorrectly Framed).
const FRAMED: Table<'yes' | 'no' | 'partial'> = {
    yes: 'yes', y: 'yes', no: 'no', n: 'no', partiallycorrect: 'partial',
    wellframed: 'yes', ambiguous: 'no', incorrectlyframed: 'no', notwellframed: 'no',
};
export const questionFramed = (e: Entry) => classify(e.questionCorrectlyFramed, FRAMED);

// Translation Quality - Good / Acceptable / Not Acceptable (legacy Good /
// Fair / Poor). Which of these count as a PASS is a business rule, kept here
// on its own so it can change: Good and Acceptable pass; Not Acceptable
// fails. Legacy "Fair" is read as "Acceptable" and "Poor" as "Not Acceptable".
const TRANSLATION: Table<'good' | 'acceptable' | 'notacceptable'> = {
    good: 'good', correct: 'good', acceptable: 'acceptable', fair: 'acceptable', notacceptable: 'notacceptable', poor: 'notacceptable',
};
export const TRANSLATION_PASSING_OUTCOMES: ReadonlySet<string> = new Set(['good', 'acceptable']);
export function translationPass(e: Entry): boolean | null {
    const outcome = classify(e.translationQuality, TRANSLATION);
    return outcome === null ? null : TRANSLATION_PASSING_OUTCOMES.has(outcome);
}

// SLA Status - Within SLA / SLA Breached ("Not Applicable" = not applicable).
const SLA: Table<'within' | 'breached'> = {
    withinsla: 'within', withinthesla: 'within', slabreached: 'breached', breachedsla: 'breached', slabreachd: 'breached',
};
export const slaOutcome = (raw: unknown) => classify(raw, SLA);

// Voice Input Quality - Correct / Incorrect / Error Displayed (legacy:
// Clear and the old free-text quality words).
const VOICE_INPUT_QUALITY: Table<'good' | 'bad'> = {
    correct: 'good', incorrect: 'bad', errordisplayed: 'bad',
    clear: 'good', distorted: 'bad', lowvolume: 'bad', noinput: 'bad', nooutput: 'bad',
};
export const voiceInputQuality = (raw: unknown) => classify(raw, VOICE_INPUT_QUALITY);

// Voice Output Quality - Clear / Unclear / Error Displayed (legacy words too).
const VOICE_OUTPUT_QUALITY: Table<'good' | 'bad'> = {
    clear: 'good', unclear: 'bad', errordisplayed: 'bad',
    distorted: 'bad', lowvolume: 'bad', highvolume: 'bad', nooutput: 'bad', noouput: 'bad',
};
export const voiceOutputQuality = (raw: unknown) => classify(raw, VOICE_OUTPUT_QUALITY);

// Notification Received? - Received / Not Received (legacy: Yes, Received on
// time, Received Late / No).
const NOTIFICATION_RECEIVED: Table<'received' | 'notreceived'> = {
    received: 'received', notreceived: 'notreceived',
    yes: 'received', y: 'received', receivedontime: 'received', receivedlate: 'received', no: 'notreceived', n: 'notreceived',
};
export const notificationReceived = (raw: unknown) => classify(raw, NOTIFICATION_RECEIVED);

// Notification on Same Thread? - "Yes - on same thread" / "No - on Different
// Thread"; "Notification not received" is not applicable here (the missing
// notification is counted by Notification Received instead).
const SAME_THREAD: Table<'yes' | 'no'> = { yesonsamethread: 'yes', noondifferentthread: 'no', yes: 'yes', y: 'yes', no: 'no', n: 'no' };
export const notificationSameThread = (e: Entry) => classify(e.notificationOnSameThread, SAME_THREAD);

// Notification Linked to Correct Q-ID? - Yes / Incorrect Q-ID / Q-ID missing.
const LINKED_QID: Table<'yes' | 'no'> = { yes: 'yes', y: 'yes', incorrectqid: 'no', qidmissing: 'no', no: 'no', n: 'no' };
export const notificationLinkedQid = (e: Entry) => classify(e.notificationLinkedCorrectQId, LINKED_QID);

// 120-min Disclaimer Received by the User? - Received / Not Received
// (legacy "120-min Msg Shown": Yes / No).
const DISCLAIMER: Table<'received' | 'notreceived'> = { received: 'received', notreceived: 'notreceived', yes: 'received', y: 'received', no: 'notreceived', n: 'notreceived' };
export const disclaimer120 = (e: Entry) => classify(e.msg120MinShownToUser, DISCLAIMER);

// Retrieval Accuracy - Correct Retrieval / Incorrect Retrieval / No Retrieval.
const RETRIEVAL: Table<'correct' | 'incorrect'> = { correctretrieval: 'correct', incorrectretrieval: 'incorrect', noretrieval: 'incorrect' };
export const retrievalAccuracy = (e: Entry) => classify(e.retrievalAccuracy, RETRIEVAL);

// Tagging - only the duplicate-tagging outcomes (other tagging values are
// about dynamic/static tagging and not applicable here). Legacy "Tagged as
// Duplicate" is read as correctly tagged.
const DUPLICATE_TAGGING: Table<'correct' | 'wrong'> = {
    correctlytaggedasduplicate: 'correct', taggedasduplicate: 'correct', wronglytaggedasduplicate: 'wrong', duplicatebutnottagged: 'wrong',
};
export const duplicateTagging = (e: Entry) => classify(e.tagging, DUPLICATE_TAGGING);

// WhatsApp vs Web Application Answer Match? - Proper / Partial / Mismatch
// (legacy Yes / No). Not part of a metric yet - cross-platform parity is Step 7.
const ANSWER_MATCH: Table<'match' | 'partial' | 'mismatch'> = {
    propermatch: 'match', partialmatch: 'partial', mismatch: 'mismatch', yes: 'match', y: 'match', partial: 'partial', no: 'mismatch', n: 'mismatch',
};
export const answerMatch = (e: Entry) => classify(e.whatsappVsWebAnswerMatch, ANSWER_MATCH);

// Defect Severity - Critical / High / Medium / Low / NA (legacy Nil -> NA),
// via Step 4's matching. Null when not one of the current options.
export function defectSeverity(e: Entry): string | null {
    const v = canonicalValue('severity', e.defectSeverity, DB_DEFECT_SEVERITY_OPTIONS);
    return DB_DEFECT_SEVERITY_OPTIONS.includes(v) ? v : null;
}

// Overall Test Status - Pass / Fail / Partial / NA, via Step 4's matching.
// Null when blank or not one of the current options.
export function overallStatus(e: Entry): 'Pass' | 'Fail' | 'Partial' | 'NA' | null {
    const v = canonicalValue('status', e.overallTestStatus, DB_OVERALL_STATUS_OPTIONS);
    return DB_OVERALL_STATUS_OPTIONS.includes(v) ? (v as 'Pass' | 'Fail' | 'Partial' | 'NA') : null;
}

// ---- Platform fields (temporary until Step 7) ----
// Step 7 will split cross-platform ("Both") entries into WebApp + WhatsApp
// observations. Until then DB Analytics keeps the current representation:
// one observation per entry, reading the web/primary field and falling back
// to the WhatsApp field only when the primary one is empty.

export const responseMinutes = (e: Entry): number | null => durationMinutes(e.responseTimeMins || e.waResponseTimeMins);
export const slaStatus = (e: Entry) => slaOutcome(e.slaStatus || e.waSlaStatus);
