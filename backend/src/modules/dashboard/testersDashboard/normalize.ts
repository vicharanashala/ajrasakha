// Data-quality-tolerant normalizers for the Testers Dashboard CSV.
//
// Ported near-verbatim from frontend/src/features/testersDashboard/TestersDashboard.tsx
// (Phase 1 of moving KPI/diagnostics/chart calculation server-side - see
// TestersDashboardService for the sync/parse layer these feed into).
//
// The live sheet has inconsistent capitalization ("Yes"/"YES"/"yes") and a
// number of confirmed one-off typos across several columns. These helpers
// normalize before comparing/aggregating so a testers' typing style never
// silently drags KPI numbers down, and so near-duplicate values don't show
// up as separate filter options.
//
// Also home to 4 shared composite formulas (translationQualityPct,
// calculateSlaCompliance, calculateVoiceSuccess, calculateNotificationExperience
// - see their own comments below) that used to live in kpis.ts (Phase 3)
// only. Hoisted down to this dependency-free Phase 1 layer so diagnostics.ts
// (Phase 4)'s Overall Module Performance work can reuse the exact same,
// already NA-exclusion-fixed functions kpis.ts uses, instead of re-deriving
// them a second time by hand. They couldn't stay in kpis.ts: kpis.ts already
// depends on filters.ts, which itself depends on diagnostics.ts for
// dynamicSubBucketFor, so diagnostics.ts importing kpis.ts directly would
// create an import cycle (diagnostics.ts -> kpis.ts -> filters.ts ->
// diagnostics.ts). normalize.ts has no dependency on either, so it's the one
// layer both Phase 3 and Phase 4 can safely share these from.

import type { TestersDashboardRecord } from '../interfaces/ITestersDashboardService.js';

export function timeToMinutes(timeStr?: string): number | null {
    const trimmed = (timeStr || '').trim();
    const lower = trimmed.toLowerCase();
    if (!trimmed || lower === 'na' || lower === 'nil' || lower === 'n/a') return null;
    if (!isNaN(Number(trimmed))) {
        const num = parseFloat(trimmed);
        // Sanity bound: real response/TAT times are minutes, not weeks. The live
        // sheet has a small number of clearly corrupted values (data-entry or
        // formula errors) in the tens-of-thousands to billions range, while 95%
        // of real values are under ~2000 minutes. 5000 comfortably covers real
        // outliers while excluding the corrupted ones.
        if (num < 0 || num > 5000) return null;
        return num;
    }

    const parts = trimmed.split(':');
    if (parts.length >= 3) {
        const hrs = parseFloat(parts[0]) || 0;
        const mins = parseFloat(parts[1]) || 0;
        const secs = parseFloat(parts[2]) || 0;
        const total = hrs * 60 + mins + secs / 60;
        // Same sanity bound as the plain-numeric branch above - Sheet 2.0
        // introduced H:MM:SS values with a leading minus sign (timezone/formula
        // artifact) and a few corrupted multi-million-minute values, which this
        // branch was previously not checking at all, silently corrupting every
        // average built from Response Time (avgResponseMinutes, the Farmer
        // Experience Score's speed sub-score, per-channel/per-day averages).
        if (total < 0 || total > 5000) return null;
        return total;
    }
    if (parts.length === 2) {
        const mins = parseFloat(parts[0]) || 0;
        const secs = parseFloat(parts[1]) || 0;
        const total = mins + secs / 60;
        if (total < 0 || total > 5000) return null;
        return total;
    }
    return null;
}

export function pct(numerator: number, denominator: number): number {
    if (!denominator) return 0;
    return Math.round((numerator / denominator) * 100);
}

// ---- Data-quality tolerant matching helpers ----

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

// Per Hemanth's confirmation, every real "Build / Version" value - "0.1",
// "0.0", typo variants ("0,1", "0-1", "o.1"), even "NA" - refers to the
// same single build, canonically "1.0". This isn't a typo-cleanup merge
// like the rest of this file's normalizers (collapsing near-duplicate
// spellings of otherwise-distinct real values); every non-blank value
// really is the same one build, so there's nothing left to distinguish -
// the filter dropdown should show exactly one real option. Blank stays
// blank (missing data, not a value to normalize).
export function normalizeBuildVersion(value?: string): string {
    const v = (value || '').trim();
    if (!v) return v;
    return '1.0';
}

// Known real severity levels, plus the one confirmed one-off typo
// ("Crtical" - 1 row) found in the live data, and two team-confirmed
// merges: "Extreme" is the same thing as "Critical", and "Info" is the
// same thing as "Low" - not distinct severity levels of their own.
const KNOWN_SEVERITIES: Record<string, string> = {
    CRITICAL: 'Critical',
    CRTICAL: 'Critical',
    EXTREME: 'Critical',
    HIGH: 'High',
    MEDIUM: 'Medium',
    LOW: 'Low',
    INFO: 'Low',
};

// "No Defect" (several casings/typos), "NA", "NIL", "N A", and a lone "No"
// all mean the same thing here: no defect was found, so there's no real
// severity to report. Treated as NA - excluded from the filter dropdown
// the same way blanks are, rather than shown as a 5th "severity" level.
const NO_DEFECT_SEVERITY_VALUES = new Set(['NO DEFECT', 'NA', 'NIL', 'N A', 'NO', 'NO DFECT']);

// A handful of rows have an actual defect description typed into this
// field instead of a severity level (e.g. "Appearance of some gibberish
// letters in between the text.", "Missed few points"). These aren't real
// severities, so they're dropped (return "") rather than shown as bogus
// filter options.
export function normalizeDefectSeverity(value?: string): string {
    const trimmed = (value || '').trim();
    if (!trimmed) return '';
    const upper = trimmed.toUpperCase();
    if (NO_DEFECT_SEVERITY_VALUES.has(upper)) return 'NA';
    return KNOWN_SEVERITIES[upper] || '';
}

// Generic case/whitespace normalizer for categorical fields where the
// live sheet just has inconsistent capitalization ("PASS"/"Pass"/"pass"),
// not different wording. Collapses to a single consistent Title Case form
// so duplicate-but-differently-cased values don't show as separate filter
// options.
export function toTitleCase(value?: string): string {
    const v = (value || '').trim().replace(/\s+/g, ' ');
    if (!v) return v;

    // "NA"/"NIL" are missing-data sentinels, not real words to title-case -
    // same special-case pattern normalizeBuildVersion already uses. Without
    // this, toTitleCase("NA") produces "Na", which slips past every
    // field's case-sensitive `v !== "NA"` filter-dropdown exclusion check
    // (Language Tested, Channel Tested) and leaks in as a separate bogus
    // option alongside the real, correctly-excluded "NA".
    const upper = v.toUpperCase();
    if (upper === 'NA' || upper === 'NIL') return upper;

    // Capitalizes the first letter of the string and any letter that
    // immediately follows a space, hyphen, or en-dash - real Question
    // Category values use both word-separator styles interchangeably
    // ("Insect–Pest Management" vs "Insect-Pest Management"), and only
    // treating spaces as boundaries left the letter after a dash
    // lowercased ("Insect–pest Management").
    return v.toLowerCase().replace(/(^|[\s\-–])([a-z])/g, (_match, sep: string, letter: string) => sep + letter.toUpperCase());
}

// Test Log 2.0 introduced two confirmed word-order swaps for otherwise
// identical compound Question Category names - merges into whichever
// spelling is dominant in real data, same rule as every other merge in
// this file (e.g. Kalaga Deni Sudha -> K. Deni Sudha): "Bio–Fertilizers
// And Bio–Pesticides" (122 rows combined) over "Bio–Pesticides And
// Bio–Fertilizers" (6), and "Extension And Capacity Building" (48) over
// "Capacity Building And Extension" (5). Keys/values are post-dash-
// canonicalization, post-toTitleCase (capitalized "And", en-dash "–" not
// hyphen "-"), matching every other category's actual output below.
// "Live Stock And Animal Husbandary" (10 rows) and "Animal Husbandry And
// Livestock" (2 rows) are the same confirmed category, combining a
// word-order swap with a typo ("Husbandary") and a word-form difference
// ("Live Stock" vs "Livestock") all at once. The majority raw spelling
// (10 vs 2) wins per the usual rule, but the merged output also corrects
// the typo/word-form rather than preserving them as-is - "Livestock And
// Animal Husbandry", not "Live Stock And Animal Husbandary".
const KNOWN_CATEGORY_WORD_ORDER_SWAPS: Record<string, string> = {
    'BIO–PESTICIDES AND BIO–FERTILIZERS': 'Bio–Fertilizers And Bio–Pesticides',
    'CAPACITY BUILDING AND EXTENSION': 'Extension And Capacity Building',
    'LIVE STOCK AND ANIMAL HUSBANDARY': 'Livestock And Animal Husbandry',
    'ANIMAL HUSBANDRY AND LIVESTOCK': 'Livestock And Animal Husbandry',
};

// British vs American spelling of the same category - merges into whichever
// is dominant in real data, same rule as every other merge in this file:
// "Fertiliser Use And Availability" (197 rows) over "Fertilizer Use And
// Availability" (13 rows). A full scan of the current category list found
// no other genuine British/American spelling pairs - "Agriculture
// Mechanization" vs "Farm Tools And Mechanisation" both contain a
// -ization/-isation root but are different category phrases, not a
// spelling variant of the same one, so they're deliberately NOT merged
// here (same misattribution caution as untouched name/typo pairs
// elsewhere in this file).
const KNOWN_CATEGORY_SPELLING_VARIANTS: Record<string, string> = {
    'FERTILIZER USE AND AVAILABILITY': 'Fertiliser Use And Availability',
};

// "Question Category" uses "&" and "and" interchangeably for the same
// category ("Climate, Weather and Stress Management" vs "Climate, Weather
// & Stress Management") - collapsing "&" to "and" before title-casing
// merges both spellings into one filter option. Only a standalone "&"
// (surrounded by whitespace) is collapsed, matching every real occurrence
// in the live data - not one embedded in some other token.
//
// Separately, "Insect–Pest Management" (en-dash, no spaces - 1515 rows)
// and "Insect - Pest Management" (hyphen, spaced - 354 rows) are the same
// category rendered with two different dash characters/spacing. Every
// hyphen/en-dash (regardless of surrounding spacing) is canonicalized to a
// single spaceless en-dash before title-casing, so both collapse to the
// same output - confirmed via a full scan of live Question Category data
// that Insect-Pest is the only pair this currently merges (the transform
// itself is applied to the whole string, so it also protects against the
// next such pair, not just this one). Side effect: other hyphenated
// compound words in this field (e.g. "Post-Harvest", "Bio-Fertilizers")
// also render with an en-dash now, for the same reason - one canonical
// dash character throughout, not a special case for "Insect" alone.
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

// "GDB"/"GDP" are acronyms and should stay fully uppercase rather than
// being title-cased into "Gdb"/"Gdp" - and GDP is a confirmed data-entry
// typo for GDB, so it's collapsed here rather than left as a separate
// filter option. "Dynamic"/"Dynmic" and "Unique"/"Uniuqe" are the same kind
// of one-off typo, seen directly in the live sheet's Type of Question
// column.
export function normalizeTypeOfQuestion(value?: string): string {
    const upper = (value || '').trim().toUpperCase();
    if (upper === 'GDB' || upper === 'GDP') return 'GDB';
    if (upper === 'DYNAMIC' || upper === 'DYNMIC') return 'Dynamic';
    if (upper === 'UNIQUE' || upper === 'UNIUQE') return 'Unique';
    return toTitleCase(value);
}

// Overall Test Status has casing variants (PASS/Pass/pass), a confirmed
// one-off typo ("Pas" - 1 row - for "Pass"), and at least one row with
// garbage data (a literal "\" character, not a real status at all).
// Unrecognized values normalize to "" so they don't show up as a bogus
// filter option or get silently miscounted as a real status - "" is
// already excluded from filter dropdowns elsewhere.
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

// "SLA Status" investigated directly against the live CSV before the SLA
// Compliance card was built (13,931 rows): the two real values are "Within
// SLA" (6,394 rows incl. casing/wording variants: "WITHIN SLA", "within
// SLA", "Within the SLA") and "SLA Breached" (3,784 rows incl. "Breached
// SLA" word-order swap, "SLA  Breached" double-space, "SLA Breachd" typo).
// Internal whitespace is collapsed to a single space before matching so the
// double-space variant folds in without a dedicated map entry.
//
// Returns null (not '') for blank/"NA"/"Not Applicable"/garbage ("\\",
// found in the live data) - these ~26% of rows never had a real SLA
// verdict recorded and must be excluded from the SLA Compliance
// denominator entirely, not silently counted as "not within SLA" (that
// would conflate genuine breaches with rows where SLA was never assessed).
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

// "Tester Name" has inconsistent spacing around periods in initials
// ("Ch.sharmila" vs "Ch. Sharmila"), on top of case. This fixes the
// mechanical formatting so the same name in different punctuation styles
// merges into one filter option. Genuine spelling differences are
// deliberately NOT auto-merged by default - guessing wrong would
// misattribute one tester's results to another. "Jhoydeep" is a confirmed
// exception (1 row) - explicitly confirmed as a typo for "Joydeep", not a
// different person, so it's safe to merge here. Test Log 2.0 introduced two
// more confirmed same-person spellings: "Kalaga Deni Sudha" (270 rows) is
// the same person as the dominant "K.Deni sudha"/"K. Deni sudha" spelling
// (843 rows combined), and "Tulala vishnu Vardhan" (257 rows) is the same
// person as the dominant "T.Vishnu Vardhan" spelling (769 rows combined) -
// both merge into the majority spelling, not the other way around.
// "Lavanya" (24 rows) is a confirmed shorthand for "Lavanya Mathialagan"
// (the dominant full-name spelling), not a different person. "Joydeep
// Singha Roy" (729 rows) is a confirmed same-person spelling for the
// numerically-dominant "Joydeep" (789 rows) - merges into the majority
// spelling, same direction as the Dhaarani S./Dhaarani S trailing-period
// merge, not the fuller-name-wins direction used for Kalaga Deni Sudha/
// Tulala Vishnu Vardhan above.
//
// "TL-2523" (1 row, also checked for the no-dash "TL2523" variant) is a
// Test ID that leaked into this column - a data-entry/column-shift error,
// not a name. Excluded (returns "" - same treatment as blank/invalid)
// rather than fixed in the sheet, so it doesn't show up as a bogus tester
// filter option.
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

    // A trailing period (end of string, e.g. "Dhaarani S.") is mechanical
    // formatting - an initial at the end of a name - not a typo needing the
    // map above. The period-spacing insertion below only fires when a
    // non-space character follows the period ((?=\S)), so a trailing period
    // would otherwise never merge with the dominant no-period form
    // ("Dhaarani S." - 233 rows - vs "Dhaarani S" - 1328 rows). Stripping a
    // single trailing period here is safe: none of the real Tester Name
    // values are genuine abbreviations (like "Dr.") that need the period kept.
    const withoutTrailingPeriod = trimmed.endsWith('.') ? trimmed.slice(0, -1) : trimmed;

    const upper = withoutTrailingPeriod.toUpperCase();
    if (KNOWN_LEAKED_TEST_IDS.has(upper)) return '';
    if (KNOWN_TESTER_NAME_TYPOS[upper]) return KNOWN_TESTER_NAME_TYPOS[upper];

    const v = withoutTrailingPeriod.replace(/\.(?=\S)/g, '. ').replace(/\s+/g, ' ');
    return toTitleCase(v);
}

// "Correct Source Links Provided?" has the widest spread of real-world variants and
// typos seen in the live sheet (e.g. "Provioded and relevant",
// "Provided & Revelant"). Handle known typos explicitly, then fall back to a
// safe "contains relevant" check - while still excluding "irrelevant" /
// "not relevant" / "not provided", which would otherwise false-match on the
// substring "relevant".
export function isSourceLinkRelevant(value?: string): boolean {
    const n = normalize(value);
    const knownPositiveVariants = [
        'provided & relevant',
        'provided and relevant',
        'provioded and relevant', // known typo in live data
        'provident and relevant', // known typo in live data
        'provided & revelant', // known typo in live data
    ];
    if (knownPositiveVariants.includes(n)) return true;
    if (n.includes('irrelevant') || n.includes('not relevant') || n.includes('not provided')) {
        return false;
    }
    return n.includes('relevant');
}

// Maps the live sheet's free-text Voice Input/Output Quality values onto a
// 0-10 scale, per Hemanth's guidance (Clear = 9-10, Good = 8, Distorted =
// 0-4, No Output = 0) and confirmed against the actual distinct values
// present in the data. "Yes"/"Correct" are treated as "working fine" (same
// tier as Good) since testers sometimes typed a generic affirmative instead
// of a quality descriptor. NA/blank/unrecognized values return null and are
// excluded from the average rather than guessed.
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

// Translation Quality percentage - shared by Trust Score's Q_trn, Farmer
// Experience's Q_trn, and diagnostics.ts's Overall Module Performance
// Translation Quality metric. Per Hemanth's confirmation, excludes blank/NA
// rows from the denominator - a row where the field was never filled in
// isn't a wrong answer, it's not applicable/not evaluated, and shouldn't
// drag the percentage down the way a genuine incorrect answer does.
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

// SLA Compliance - shared by the standalone SLA Compliance card, Farmer
// Experience Score's S_sla, and diagnostics.ts's Overall Module Performance
// SLA Compliance metric. Built on the confirmed decision to trust what
// testers explicitly marked in "SLA Status" (normalizeSlaStatus), not a
// fresh Response-Time-based recomputation. Denominator is rows with a real,
// recognized SLA Status value only (blank/NA/Not Applicable/garbage are
// excluded entirely via normalizeSlaStatus, not folded into "not within
// SLA").
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

// Voice Success: average of the 0-10 voiceQualityScore across both Voice
// Input Quality and Voice Output Quality (blended into one score, not two
// separate ones). Shared by the standalone Voice Success KPI card and
// diagnostics.ts's Overall Module Performance Voice Performance metric
// (which converts this 0-10 score to a percentage: score / 10 * 100).
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

export interface NotificationExperienceResult {
    pct: number;
    applicable: number;
}

// Notification Experience (N_exp): all 3 conditions required (received
// on-time/late/yes, same thread, correct Q-ID), denominator scoped to rows
// with a real (non-blank/NA) value in all 3 notification fields - per a
// live-data investigation, blanks here are NOT spread evenly across Type of
// Question (72%-96% blank rate, concentrated in Dynamic/unmapped types),
// consistent with the check genuinely not applying to those rows rather
// than random skipped fields. Extracted out of calculateExperienceScore
// (previously inlined there only) so diagnostics.ts's Overall Module
// Performance Notification Experience metric reuses the identical,
// already-fixed formula instead of a second inline copy that could silently
// drift from it.
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

// parseTestDateToISO's unparseable-value warnings used to be entirely
// silent (a bare `return null`), which is how the ~27 ambiguous "Test
// Date" rows in the live sheet went unnoticed until manually audited.
// Deduped per distinct raw value (not per row/per request) since this
// runs over every row on every dashboard request - without dedup, the
// same handful of bad values would spam the logs on every load instead
// of surfacing once as an actionable signal.
const warnedUnparseableDates = new Set<string>();
function warnUnparseableDate(raw: string, reason: string): null {
    if (!warnedUnparseableDates.has(raw)) {
        warnedUnparseableDates.add(raw);
        console.warn(`[TestersDashboard] Unparseable "Test Date" value ${JSON.stringify(raw)} (${reason}) - treated as missing.`);
    }
    return null;
}

// Manually reviewed, one-by-one, as unambiguous typos - a missing/
// scrambled year digit, a stray extra dash, a dot-separator variant - each
// resolving to exactly one sensible real date. Deliberately a fixed lookup,
// not a generic "auto-fix short years" rule: the remaining unparseable
// values (11-13-2026, the 13/14/15/16-07 sequence, 15-20-2026, the doubled
// string, 2 non-date values, etc.) are genuinely ambiguous or not dates at
// all, and a generic rule risks silently guessing wrong on those or on
// future malformed values we haven't reviewed yet.
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

// The live sheet's "Test Date" column has many real-world formats
// (DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY, DD-MM-YY, DD-Month-YYYY, plus a
// handful of one-off typos). This normalizes any of them into a proper
// "YYYY-MM-DD" string so date-range filtering and chart sorting are
// actually chronological, instead of comparing raw strings that happen to
// be in the wrong format for that. Returns null for values that can't be
// confidently parsed (and logs a one-time warning per distinct bad value -
// see warnUnparseableDate above - since a silently-dropped date used to be
// invisible).
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
        // Only 2-digit ("26") or full 4-digit ("2026") years are trustworthy.
        // A 3-digit year like "206" is known data-entry corruption (a missing
        // digit, e.g. "2026" typed as "206") - guessing which digit is missing
        // would be unreliable, so treat it as unparseable instead.
        if (rawYear.length !== 2 && rawYear.length !== 4) {
            return warnUnparseableDate(s, `${rawYear.length}-digit year is likely corrupted data entry`);
        }
        let year = parseInt(rawYear, 10);
        if (rawYear.length === 2) year += 2000;
        // Known issue in the live sheet: ~30 rows have sequentially-incrementing
        // years (e.g. "14-06-2027", "14-06-2028"...up to "14-06-2039") that look
        // like a Google Sheets drag-to-fill artifact, not real future test
        // dates. This dataset's real testing cycle is 2026 - excluding
        // anything past 2026 keeps these artifacts out of date-based
        // filters/charts.
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2020 && year <= 2026) {
            return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
        return warnUnparseableDate(s, 'numeric date with out-of-range day/month/year, or excluded drag-fill year');
    }

    return warnUnparseableDate(s, 'does not match any known date format');
}

// Every "Test Date" in the source sheets is an IST calendar date (the whole
// app is India-specific - Zoho .in, IST times in the UI), so "today" for
// date-range filtering must be IST's calendar date, not whatever timezone
// the server/container happens to be running in. Hardcodes the +5:30 offset
// rather than relying on TZ env var or Intl.DateTimeFormat defaults, since
// either of those can silently change on redeploy and reintroduce this bug.
export function getTodayIST(now: Date = new Date()): string {
    const istShifted = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
    return istShifted.toISOString().slice(0, 10);
}
