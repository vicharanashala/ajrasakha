// Data-quality-tolerant normalizers for the Testers Dashboard CSV. The live
// sheet has inconsistent capitalization and a number of confirmed one-off
// typos across several columns - these helpers normalize before
// comparing/aggregating so a tester's typing style never drags KPI numbers
// down, and so near-duplicate values don't show up as separate filter
// options.
//
// Also home to 4 shared composite formulas (translationQualityPct,
// calculateSlaCompliance, calculateVoiceSuccess,
// calculateNotificationExperience) reused by both kpis.ts and
// diagnostics.ts. They live here rather than in kpis.ts to avoid an import
// cycle: kpis.ts depends on filters.ts, which depends on diagnostics.ts for
// dynamicSubBucketFor, so diagnostics.ts importing kpis.ts directly would
// create a cycle. normalize.ts has no dependency on either, so both can
// safely share these from here.

import type { TestersDashboardRecord } from '../interfaces/ITestersDashboardService.js';

// Upper bound for a parseable Response/TAT time reading - the live sheet has
// corrupted values (data-entry/formula errors) ranging into the tens of
// millions of minutes. A live-data investigation confirmed a clean gap
// between genuine long delays and corrupted values: 97 real rows fall
// between 7 and ~61 days (max 87,578 min), while the next-smallest
// corrupted value is ~66.5 million minutes (~127 years) - a ~760x gap, so
// 100,000 min (~69 days) safely keeps every genuine reading while excluding
// every corrupted one. Previously capped at 10,080 min (7 days), which
// wrongly discarded those 97 genuine multi-day delays as if they were
// corrupted - re-verify against a fresh CSV pull if this starts rejecting
// real data again.
export const RESPONSE_TIME_PARSE_CAP_MINUTES = 100000;

export function timeToMinutes(timeStr?: string): number | null {
    const trimmed = (timeStr || '').trim();
    const lower = trimmed.toLowerCase();
    if (!trimmed || lower === 'na' || lower === 'nil' || lower === 'n/a') return null;
    if (!isNaN(Number(trimmed))) {
        const num = parseFloat(trimmed);
        if (num < 0 || num > RESPONSE_TIME_PARSE_CAP_MINUTES) return null;
        return num;
    }

    const parts = trimmed.split(':');
    if (parts.length >= 3) {
        const hrs = parseFloat(parts[0]) || 0;
        const mins = parseFloat(parts[1]) || 0;
        const secs = parseFloat(parts[2]) || 0;
        const total = hrs * 60 + mins + secs / 60;
        if (total < 0 || total > RESPONSE_TIME_PARSE_CAP_MINUTES) return null;
        return total;
    }
    if (parts.length === 2) {
        const mins = parseFloat(parts[0]) || 0;
        const secs = parseFloat(parts[1]) || 0;
        const total = mins + secs / 60;
        if (total < 0 || total > RESPONSE_TIME_PARSE_CAP_MINUTES) return null;
        return total;
    }
    return null;
}

export function pct(numerator: number, denominator: number): number {
    if (!denominator) return 0;
    return Math.round((numerator / denominator) * 100);
}

export function normalize(value?: string): string {
    return (value || '').trim().toLowerCase();
}

export function matchesAny(value: string | undefined, options: string[]): boolean {
    const n = normalize(value);
    return options.includes(n);
}

export function isNAlike(value?: string): boolean {
    const n = normalize(value);
    return n === '' || n === 'na' || n === 'nil' || n === 'n/a';
}

export function isYes(value?: string): boolean {
    return matchesAny(value, ['yes', 'y']);
}

export function isNo(value?: string): boolean {
    return matchesAny(value, ['no', 'n']);
}

// Every real Build/Version value (typos and "NA" included) refers to the
// same single build - canonically "1.0", not a typo-merge of distinct real
// values. Blank stays blank (missing data, not a value to normalize).
export function normalizeBuildVersion(value?: string): string {
    const v = (value || '').trim();
    if (!v) return v;
    return '1.0';
}

// Confirmed severity typos/merges: Crtical -> Critical, Extreme -> Critical
// (same severity), Info -> Low (same severity).
const KNOWN_SEVERITIES: Record<string, string> = {
    CRITICAL: 'Critical',
    CRTICAL: 'Critical',
    EXTREME: 'Critical',
    HIGH: 'High',
    MEDIUM: 'Medium',
    LOW: 'Low',
    INFO: 'Low',
};

// These all mean "no defect found" - treated as NA rather than a 5th
// severity level.
const NO_DEFECT_SEVERITY_VALUES = new Set(['NO DEFECT', 'NA', 'NIL', 'N A', 'NO', 'NO DFECT']);

// Some rows have a defect description typed into this field instead of a
// severity level - not a real severity, so dropped (returns "") rather than
// shown as a bogus filter option.
export function normalizeDefectSeverity(value?: string): string {
    const trimmed = (value || '').trim();
    if (!trimmed) return '';
    const upper = trimmed.toUpperCase();
    if (NO_DEFECT_SEVERITY_VALUES.has(upper)) return 'NA';
    return KNOWN_SEVERITIES[upper] || '';
}

export function toTitleCase(value?: string): string {
    const v = (value || '').trim().replace(/\s+/g, ' ');
    if (!v) return v;

    // "NA"/"NIL" are missing-data sentinels, not words to title-case -
    // title-casing "NA" to "Na" would slip past the case-sensitive `!== "NA"`
    // filter-dropdown exclusion checks and leak in as a bogus option.
    const upper = v.toUpperCase();
    if (upper === 'NA' || upper === 'NIL') return upper;

    // Also capitalizes after a hyphen/en-dash, since compound category names
    // use both word-separator styles interchangeably.
    return v.toLowerCase().replace(/(^|[\s\-–])([a-z])/g, (_match, sep: string, letter: string) => sep + letter.toUpperCase());
}

// Confirmed word-order swaps for otherwise identical compound Question
// Category names - each merges into whichever spelling is dominant in real
// data (majority spelling wins). Keys/values are post-dash-canonicalization,
// post-toTitleCase.
const KNOWN_CATEGORY_WORD_ORDER_SWAPS: Record<string, string> = {
    'BIO–PESTICIDES AND BIO–FERTILIZERS': 'Bio–Fertilizers And Bio–Pesticides',
    'CAPACITY BUILDING AND EXTENSION': 'Extension And Capacity Building',
    'LIVE STOCK AND ANIMAL HUSBANDARY': 'Livestock And Animal Husbandry',
    'ANIMAL HUSBANDRY AND LIVESTOCK': 'Livestock And Animal Husbandry',
};

// British vs American spelling of the same category - merges into the
// dominant real-data spelling. Other -ization/-isation category names are
// deliberately NOT merged here since they're different phrases, not a
// spelling variant of the same one.
const KNOWN_CATEGORY_SPELLING_VARIANTS: Record<string, string> = {
    'FERTILIZER USE AND AVAILABILITY': 'Fertiliser Use And Availability',
};

// "&" and "and" are used interchangeably for the same category, as are
// hyphens and en-dashes ("Insect–Pest Management" vs "Insect - Pest
// Management") - both are canonicalized before title-casing so variant
// spellings merge into one filter option. This applies to the whole string,
// so other hyphenated compound words in this field render with an en-dash
// too, not just "Insect".
export function normalizeQuestionCategory(value?: string): string {
    const trimmed = (value || '').trim();
    if (!trimmed) return '';

    const withAnd = trimmed.replace(/\s&\s/g, ' and ');
    const withCanonicalDash = withAnd.replace(/\s*[-–]\s*/g, '–');
    const titleCased = toTitleCase(withCanonicalDash);

    const upper = titleCased.toUpperCase();
    if (KNOWN_CATEGORY_WORD_ORDER_SWAPS[upper]) return KNOWN_CATEGORY_WORD_ORDER_SWAPS[upper];
    if (KNOWN_CATEGORY_SPELLING_VARIANTS[upper]) return KNOWN_CATEGORY_SPELLING_VARIANTS[upper];

    return titleCased;
}

// "Channel Tested" mixes spacing as well as case ("webapp" vs "Web App"),
// so simple title-casing alone won't merge them - map known channels
// explicitly, falling back to title case for anything unrecognized.
export function normalizeChannel(value?: string): string {
    const compact = (value || '').trim().toLowerCase().replace(/\s+/g, '');
    if (compact === 'webapp' || compact === 'webapplication') return 'Web App';
    if (compact === 'whatsapp' || compact === 'wa') return 'WhatsApp';
    if (compact === 'both') return 'Both';
    return toTitleCase(value);
}

// "Lavanya Mathialagan" and "Ithagani Shireesha" (1 row each) are Tester
// Name values that leaked into this column - a column-shift/data-entry
// error, not a real Type of Question value. Excluded (returns '') the same
// way KNOWN_LEAKED_TEST_IDS excludes "TL-2523" from Tester Name below.
const KNOWN_LEAKED_TESTER_NAMES = new Set(['LAVANYA MATHIALAGAN', 'ITHAGANI SHIREESHA']);

// "GDB"/"GDP" are acronyms and should stay fully uppercase rather than
// being title-cased into "Gdb"/"Gdp" - and GDP is a confirmed data-entry
// typo for GDB, so it's collapsed here rather than left as a separate
// filter option. "Dynamic"/"Dynmic" and "Unique"/"Uniuqe" are the same kind
// of one-off typo, seen directly in the live sheet's Type of Question
// column.
export function normalizeTypeOfQuestion(value?: string): string {
    const upper = (value || '').trim().toUpperCase();
    if (KNOWN_LEAKED_TESTER_NAMES.has(upper)) return '';
    if (upper === 'GDB' || upper === 'GDP') return 'GDB';
    if (upper === 'DYNAMIC' || upper === 'DYNMIC') return 'Dynamic';
    if (upper === 'UNIQUE' || upper === 'UNIUQE') return 'Unique';
    return toTitleCase(value);
}

// Casing variants plus a confirmed typo ("Pas" -> "Pass"). Unrecognized
// values (including garbage data) normalize to "" rather than becoming a
// bogus filter option.
const KNOWN_TEST_STATUSES: Record<string, string> = {
    PASS: 'Pass',
    PAS: 'Pass',
    FAIL: 'Fail',
    PARTIAL: 'Partial',
    NA: 'NA',
};
export function normalizeTestStatus(value?: string): string {
    const upper = (value || '').trim().toUpperCase();
    return KNOWN_TEST_STATUSES[upper] || '';
}

// "SLA Status" has casing/word-order variants and typos, collapsed to the 2
// real values. Internal whitespace is collapsed to a single space before
// matching so double-space variants fold in without a dedicated map entry.
//
// Returns null (not '') for blank/NA/Not Applicable/garbage - these rows
// never had a real SLA verdict recorded and must be excluded from the SLA
// Compliance denominator entirely, not silently counted as "not within SLA"
// (that would conflate genuine breaches with rows where SLA was never
// assessed).
const KNOWN_SLA_STATUSES: Record<string, string> = {
    'WITHIN SLA': 'Within SLA',
    'WITHIN THE SLA': 'Within SLA',
    'SLA BREACHED': 'SLA Breached',
    'BREACHED SLA': 'SLA Breached',
    'SLA BREACHD': 'SLA Breached',
};
export function normalizeSlaStatus(value?: string): string | null {
    const trimmed = (value || '').trim().replace(/\s+/g, ' ');
    if (!trimmed) return null;
    return KNOWN_SLA_STATUSES[trimmed.toUpperCase()] || null;
}

// "Tester Name" has inconsistent spacing around periods in initials on top
// of case; fixed mechanically below. Genuine spelling differences are
// deliberately NOT auto-merged - guessing wrong would misattribute one
// tester's results to another - except the confirmed same-person merges in
// KNOWN_TESTER_NAME_TYPOS below (majority spelling wins).
//
// "TL-2523"/"TL2523" is a Test ID that leaked into this column (a
// data-entry/column-shift error), not a name - excluded (returns "") rather
// than shown as a bogus tester.
const KNOWN_LEAKED_TEST_IDS = new Set(['TL-2523', 'TL2523']);

const KNOWN_TESTER_NAME_TYPOS: Record<string, string> = {
    JHOYDEEP: 'Joydeep',
    'KALAGA DENI SUDHA': 'K. Deni Sudha',
    'TULALA VISHNU VARDHAN': 'T. Vishnu Vardhan',
    LAVANYA: 'Lavanya Mathialagan',
    'JOYDEEP SINGHA ROY': 'Joydeep',
};

export function normalizeTesterName(value?: string): string {
    const trimmed = (value || '').trim();
    if (!trimmed) return '';

    // A trailing period (e.g. "Dhaarani S.") is a name-initial, not a typo -
    // stripped so it merges with the dominant no-period spelling. Safe since
    // no real Tester Name value is a genuine abbreviation (like "Dr.") that
    // needs the period kept.
    const withoutTrailingPeriod = trimmed.endsWith('.') ? trimmed.slice(0, -1) : trimmed;

    const upper = withoutTrailingPeriod.toUpperCase();
    if (KNOWN_LEAKED_TEST_IDS.has(upper)) return '';
    if (KNOWN_TESTER_NAME_TYPOS[upper]) return KNOWN_TESTER_NAME_TYPOS[upper];

    const v = withoutTrailingPeriod.replace(/\.(?=\S)/g, '. ').replace(/\s+/g, ' ');
    return toTitleCase(v);
}

// "Correct Source Links Provided?" is answered two different ways by
// testers - a plain "Yes"/"No" affirmative, or a "Provided & Relevant"-style
// value - both meaning the same thing, so both count as positive/negative.
// Exact-value matching (not "includes") is used deliberately: an "includes
// relevant" check would also match "Provided & Not Relevant" (a real
// negative value that contains the substring "relevant").
const SOURCE_LINK_POSITIVE_VALUES = new Set([
    'provided & relevant',
    'provided and relevant',
    'provioded and relevant', // known typo in live data
    'provident and relevant', // known typo in live data
    'provided & revelant', // known typo in live data
    'yes',
    'ytes', // known typo in live data
    'provided',
]);

const SOURCE_LINK_NEGATIVE_VALUES = new Set([
    'provided & irrelevant',
    'provided & not relevant',
    'not provided',
    'no',
]);

// "Successfully Identified as Duplicate" is a leaked "Q-ID Consistent Across
// Systems?" value (32 rows); "0:00:00" is a leaked time value (1 row) -
// neither is a real answer to this question, so both are excluded from the
// denominator entirely rather than counted as either answer.
const SOURCE_LINK_LEAKED_VALUES = new Set(['successfully identified as duplicate', '0:00:00']);

// Applicability check for S_lnk's denominator - blank/NA (isNAlike) plus the
// confirmed leaked values above.
export function isSourceLinkApplicable(value?: string): boolean {
    if (isNAlike(value)) return false;
    return !SOURCE_LINK_LEAKED_VALUES.has(normalize(value));
}

export function isSourceLinkRelevant(value?: string): boolean {
    return SOURCE_LINK_POSITIVE_VALUES.has(normalize(value));
}

// Not used by isSourceLinkRelevant itself (a value simply not in the
// positive set already counts as incorrect) - exported so tests can assert
// against the confirmed negative values explicitly, distinguishing "known
// negative" from "unrecognized garbage," both of which score as incorrect.
export function isSourceLinkExplicitlyIrrelevant(value?: string): boolean {
    return SOURCE_LINK_NEGATIVE_VALUES.has(normalize(value));
}

// The single "correct" definition for every Scientific Accuracy consumer on
// the dashboard - Trust Score's A_sci, Overall Module Performance's Agri
// Advisory and Knowledge & GDB sub-metrics, and the Executive Summary
// "Scientific Accuracy" tile (via kpis.ts's calculateScientificAccuracy) all
// call this same function, so a plain "yes"/"y" counts as correct
// everywhere, not just in some of them. The Executive Summary tile used to
// keep its own separate "correct"-only definition, which is what let it
// show 87% while A_sci showed 95% on identical data - see
// calculateScientificAccuracy's own comment (kpis.ts) for that history.
export function isScientificallyCorrect(value?: string): boolean {
    return matchesAny(value, ['correct', 'yes', 'y']);
}

// "Question Correctly Framed?" (Trust Score v2's new Question Properly
// Framed component). "English" is a confirmed leaked Language Tested value
// (11 rows) that landed in this column via a column-shift data-entry error -
// excluded from the denominator entirely, the same treatment as other
// confirmed column leaks elsewhere in this file (KNOWN_LEAKED_TESTER_NAMES,
// KNOWN_LEAKED_TEST_IDS).
export function isQuestionFramedApplicable(value?: string): boolean {
    if (isNAlike(value)) return false;
    return normalize(value) !== 'english';
}

// "Well Framed" (+ casing variants) and a plain "yes"/"y" count as correct.
// "Incorrectly Framed"/"Ambiguous" and anything else stay in the denominator
// (via isQuestionFramedApplicable above) but don't count as correct - only
// this clear positive value does. Checked before the "yes"/"y" fallback so
// "not well framed" (which contains the substring "well framed") is
// correctly excluded rather than matched.
export function isQuestionWellFramed(value?: string): boolean {
    const n = normalize(value);
    if (n.includes('not well framed')) return false;
    if (n.includes('well framed')) return true;
    return matchesAny(value, ['yes', 'y']);
}

// Maps free-text Voice Input/Output Quality to a 0-10 scale (Clear=9-10,
// Good=8, Distorted=0-4, No Output=0). "Yes"/"Correct" count as Good-tier,
// since testers sometimes typed a generic affirmative instead of a quality
// descriptor. NA/unrecognized values are excluded (null), not guessed.
export function voiceQualityScore(value?: string): number | null {
    if (isNAlike(value)) return null;
    const n = normalize(value);
    if (n === 'clear') return 10;
    if (n === 'good') return 8;
    if (n === 'yes' || n === 'correct') return 8;
    if (n === 'low volume') return 4;
    if (n === 'distorted') return 3;
    if (n === 'no output' || n === 'no ouput' || n === 'no input') return 0;
    return null;
}

export interface TranslationQualityResult {
    pct: number;
    applicable: number;
}

// Shared by Trust/Farmer Experience's Q_trn and Overall Module Performance's
// Translation Quality metric. Excludes blank/NA rows from the denominator -
// a row where the field was never filled in isn't a wrong answer, it's not
// applicable/not evaluated.
export function translationQualityPct(rows: TestersDashboardRecord[]): TranslationQualityResult {
    const applicable = rows.filter((r) => !isNAlike(r['Translation Quality']));
    return {
        pct: pct(applicable.filter((r) => matchesAny(r['Translation Quality'], ['correct', 'good'])).length, applicable.length),
        applicable: applicable.length,
    };
}

export interface SlaComplianceResult {
    rows: TestersDashboardRecord[];
    withinSlaCount: number;
    withinSlaPct: number;
    exceededSlaPct: number;
}

// Shared by the SLA Compliance card, Farmer Experience's S_sla, and Overall
// Module Performance's SLA Compliance metric. Trusts what testers explicitly
// marked in "SLA Status" rather than recomputing from Response Time.
// Denominator is rows with a real, recognized SLA Status value only.
export function calculateSlaCompliance(rows: TestersDashboardRecord[]): SlaComplianceResult {
    const validRows = rows.filter((r) => normalizeSlaStatus(r['SLA Status']) !== null);
    const withinSlaCount = validRows.filter((r) => normalizeSlaStatus(r['SLA Status']) === 'Within SLA').length;
    const withinSlaPct = pct(withinSlaCount, validRows.length);
    const exceededSlaPct = validRows.length ? 100 - withinSlaPct : 0;
    return { rows: validRows, withinSlaCount, withinSlaPct, exceededSlaPct };
}

export interface VoiceSuccessResult {
    score: number;
    sampleSize: number;
    inputAvg: number | null;
    inputCount: number;
    outputAvg: number | null;
    outputCount: number;
}

// Blends Voice Input and Output Quality into one 0-10 score (not two
// separate ones). Shared by the Voice Success card and Overall Module
// Performance's Voice Performance metric (converted to a percentage there:
// score / 10 * 100).
export function calculateVoiceSuccess(rows: TestersDashboardRecord[]): VoiceSuccessResult {
    const inputScores: number[] = [];
    const outputScores: number[] = [];
    rows.forEach((r) => {
        const inScore = voiceQualityScore(r['Voice Input Quality']);
        const outScore = voiceQualityScore(r['Voice Output Quality']);
        if (inScore !== null) inputScores.push(inScore);
        if (outScore !== null) outputScores.push(outScore);
    });
    const avg = (arr: number[]) => (arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null);
    const allScores = [...inputScores, ...outputScores];
    const score = allScores.length ? Math.round((allScores.reduce((a, b) => a + b, 0) / allScores.length) * 10) / 10 : 0;
    return {
        score,
        sampleSize: allScores.length,
        inputAvg: avg(inputScores),
        inputCount: inputScores.length,
        outputAvg: avg(outputScores),
        outputCount: outputScores.length,
    };
}

export interface NotificationSuccessResult {
    pct: number;
    onTime: number;
    applicable: number;
}

// Notification Success: denominator is rows with a real (non-blank/NA)
// value in "Notification Received?" alone. Match set is deliberately the
// same as N_exp's own Received-field condition ('received on time',
// 'received late', or a bare 'yes') rather than "received on time" only -
// the two metrics read the same column and a bare "yes" answer shouldn't
// count as a notification-experience success but a notification-success
// failure. Shared by the Release Health Farmer Experience bucket, the
// Executive Summary tile, and the previous-period comparison, so all three
// can't drift apart.
export function calculateNotificationSuccess(rows: TestersDashboardRecord[]): NotificationSuccessResult {
    const applicableRows = rows.filter((r) => !isNAlike(r['Notification Received?']));
    const onTimeRows = applicableRows.filter((r) =>
        matchesAny(r['Notification Received?'], ['received on time', 'received late', 'yes']),
    );
    return { pct: pct(onTimeRows.length, applicableRows.length), onTime: onTimeRows.length, applicable: applicableRows.length };
}

export interface NotificationExperienceResult {
    pct: number;
    applicable: number;
}

// Notification Experience (N_exp): all 3 conditions required (received
// on-time/late/yes, same thread, correct Q-ID), denominator scoped to rows
// with a real (non-blank/NA) value in all 3 notification fields - blanks
// here are concentrated in Dynamic/unmapped question types, consistent with
// the check genuinely not applying to those rows rather than randomly
// skipped fields. Shared with Overall Module Performance's Notification
// Experience metric.
export function calculateNotificationExperience(rows: TestersDashboardRecord[]): NotificationExperienceResult {
    const applicableRows = rows.filter(
        (r) =>
            !isNAlike(r['Notification Received?']) &&
            !isNAlike(r['Notification on Same Thread?']) &&
            !isNAlike(r['Notification Linked Correct Q-ID?']),
    );
    const validNotifRows = applicableRows.filter(
        (r) =>
            matchesAny(r['Notification Received?'], ['received on time', 'received late', 'yes']) &&
            isYes(r['Notification on Same Thread?']) &&
            isYes(r['Notification Linked Correct Q-ID?']),
    );
    return { pct: pct(validNotifRows.length, applicableRows.length), applicable: applicableRows.length };
}

const MONTH_NAMES: Record<string, number> = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
    may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
    september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

// Deduped per distinct raw value (not per row/per request), since this runs
// over every row on every dashboard request - without dedup, the same
// handful of bad values would spam the logs on every load instead of
// surfacing once as an actionable signal.
const warnedUnparseableDates = new Set<string>();
function warnUnparseableDate(raw: string, reason: string): null {
    if (!warnedUnparseableDates.has(raw)) {
        warnedUnparseableDates.add(raw);
        console.warn(`[TestersDashboard] Unparseable "Test Date" value ${JSON.stringify(raw)} (${reason}) - treated as missing.`);
    }
    return null;
}

// Manually reviewed one-off date typos, each with an unambiguous fix.
// Deliberately a fixed lookup, not a generic rule - remaining unparseable
// values are genuinely ambiguous, and a generic rule risks silently guessing
// wrong.
const KNOWN_DATE_TYPOS: Record<string, string> = {
    '24-06-26': '2026-06-24',
    '08-06-26': '2026-06-08',
    '25-07--2026': '2026-07-25',
    '24-07--2026': '2026-07-24',
    '25-06-2-26': '2026-06-25',
    '14-07-026': '2026-07-14',
    '10.06.2026': '2026-06-10',
    '12-06 -2026': '2026-06-12',
    '14-06-206': '2026-06-14',
    '17-06-026': '2026-06-17',
    '19-06-206': '2026-06-19',
    '25-0-6-2026': '2026-06-25',
    '15-07-206': '2026-07-15',
};

// Normalizes the sheet's many raw Test Date formats (DD-MM-YYYY, DD/MM/YYYY,
// DD.MM.YYYY, DD-MM-YY, DD-Month-YYYY, etc.) to "YYYY-MM-DD" so date-range
// filtering and chart sorting are chronological - raw strings don't compare
// correctly against that format otherwise. Returns null for values that
// can't be confidently parsed, logging a one-time warning per distinct bad
// value (see warnUnparseableDate above).
export function parseTestDateToISO(dateStr?: string): string | null {
    const s = (dateStr || '').trim();
    if (!s || isNAlike(s)) return null;
    if (KNOWN_DATE_TYPOS[s]) return KNOWN_DATE_TYPOS[s];

    const monthNameMatch = s.match(/^(\d{1,2})[-\s]+([A-Za-z]+)[-\s]+(\d{4})$/);
    if (monthNameMatch) {
        const day = parseInt(monthNameMatch[1], 10);
        const month = MONTH_NAMES[monthNameMatch[2].toLowerCase()];
        const year = parseInt(monthNameMatch[3], 10);
        if (month && day >= 1 && day <= 31 && year >= 2020 && year <= 2026) {
            return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
        return warnUnparseableDate(s, 'DD-Month-YYYY format with out-of-range day/month/year');
    }

    const numericMatch = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
    if (numericMatch) {
        const day = parseInt(numericMatch[1], 10);
        const month = parseInt(numericMatch[2], 10);
        const rawYear = numericMatch[3];
        // A 3-digit year like "206" is data-entry corruption (a missing digit) -
        // not safely guessable, so treated as unparseable.
        if (rawYear.length !== 2 && rawYear.length !== 4) {
            return warnUnparseableDate(s, `${rawYear.length}-digit year is likely corrupted data entry`);
        }
        let year = parseInt(rawYear, 10);
        if (rawYear.length === 2) year += 2000;
        // Caps at 2026 - years past that are a Google Sheets drag-to-fill
        // artifact, not real future test dates.
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2020 && year <= 2026) {
            return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
        return warnUnparseableDate(s, 'numeric date with out-of-range day/month/year, or excluded drag-fill year');
    }

    return warnUnparseableDate(s, 'does not match any known date format');
}

// Every "Test Date" is an IST calendar date (the whole app is India-specific),
// so "today" for date-range filtering must be IST's calendar date, not
// whatever timezone the server happens to be running in. Hardcodes the
// +5:30 offset rather than relying on TZ env var or Intl.DateTimeFormat
// defaults, since either can silently change on redeploy.
export function getTodayIST(now: Date = new Date()): string {
    const istShifted = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
    return istShifted.toISOString().slice(0, 10);
}
