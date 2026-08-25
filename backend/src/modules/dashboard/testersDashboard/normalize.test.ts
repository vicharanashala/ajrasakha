import { describe, it, expect } from 'vitest';
import {
    pct,
    normalize,
    matchesAny,
    isNAlike,
    isYes,
    isNo,
    timeToMinutes,
    normalizeBuildVersion,
    normalizeDefectSeverity,
    toTitleCase,
    normalizeQuestionCategory,
    normalizeChannel,
    normalizeTypeOfQuestion,
    normalizeTestStatus,
    normalizeSlaStatus,
    normalizeTesterName,
    isSourceLinkRelevant,
    voiceQualityScore,
    parseTestDateToISO,
    getTodayIST,
} from './normalize.js';

// All "real value" fixtures below (with their occurrence counts noted in
// comments) were pulled directly from backend/data/testers-dashboard/updated.csv
// by parsing it the same way TestersDashboardService does and tabulating
// distinct values per column - not invented. Counts are as of the CSV
// snapshot at port time and are there so a reviewer can cross-check a
// fixture against the live file (`grep` the value) rather than trust the
// test alone.

describe('pct', () => {
    it('handles zero denominator', () => {
        expect(pct(5, 0)).toBe(0);
    });
    it('rounds to nearest integer', () => {
        expect(pct(1, 3)).toBe(33);
        expect(pct(1, 8)).toBe(13); // 12.5 -> rounds up
        expect(pct(50, 100)).toBe(50);
    });
});

describe('normalize / matchesAny / isNAlike / isYes / isNo', () => {
    it('normalize trims and lowercases', () => {
        expect(normalize('  YES  ')).toBe('yes');
        expect(normalize(undefined)).toBe('');
    });
    it('matchesAny checks against a normalized option list', () => {
        expect(matchesAny('YES', ['yes', 'y'])).toBe(true);
        expect(matchesAny('maybe', ['yes', 'y'])).toBe(false);
    });
    it('isNAlike treats blank/na/nil/n-a as missing', () => {
        expect(isNAlike('')).toBe(true);
        expect(isNAlike('NA')).toBe(true);
        expect(isNAlike('Nil')).toBe(true);
        expect(isNAlike('N/A')).toBe(true);
        expect(isNAlike('No')).toBe(false);
    });
    it('isYes/isNo only match yes/y and no/n', () => {
        expect(isYes('Yes')).toBe(true);
        expect(isYes('Y')).toBe(true);
        expect(isYes('YES please')).toBe(false);
        expect(isNo('No')).toBe(true);
        expect(isNo('N')).toBe(true);
    });
});

describe('timeToMinutes', () => {
    it('returns null for blank/NA-like values', () => {
        expect(timeToMinutes('')).toBeNull();
        expect(timeToMinutes('NA')).toBeNull();
        expect(timeToMinutes('nil')).toBeNull();
    });
    // "#VALUE!": 318 occurrences in Response Time column - a formula error,
    // not a real time, and not numeric or colon-separated either.
    it('returns null for unparseable formula-error values', () => {
        expect(timeToMinutes('#VALUE!')).toBeNull();
    });
    // "10.0": 427 occurrences, "0.1": 345, "1.0": 104 - plain numeric minutes.
    it('parses plain numeric minute values', () => {
        expect(timeToMinutes('10.0')).toBe(10);
        expect(timeToMinutes('0.1')).toBe(0.1);
        expect(timeToMinutes('1.0')).toBe(1);
    });
    it('rejects out-of-bound numeric values (corrupted data)', () => {
        expect(timeToMinutes('-5')).toBeNull();
        expect(timeToMinutes('100000')).toBeNull();
        expect(timeToMinutes('5000')).toBe(5000); // inclusive upper bound
    });
    // "0:00:10": 679 occurrences, "0:00:00": 763 - HH:MM:SS format.
    it('parses HH:MM:SS values', () => {
        expect(timeToMinutes('0:00:00')).toBe(0);
        expect(timeToMinutes('0:00:30')).toBeCloseTo(0.5, 5);
        expect(timeToMinutes('1:30:00')).toBe(90);
    });
    // Sheet 2.0 introduced H:MM:SS values with a leading minus sign
    // (timezone/formula artifact) and some corrupted multi-million-minute
    // values - 872 real rows in the live CSV, up to "-1109610:43:00"
    // (-66,576,557 minutes). The plain-numeric branch already had this
    // bound; the colon-parsed branch did not, so these silently corrupted
    // every average built from Response Time.
    it('rejects out-of-bound HH:MM:SS values (negative or >5000 minutes)', () => {
        expect(timeToMinutes('-15:37:14')).toBeNull();
        expect(timeToMinutes('-1109610:43:00')).toBeNull();
        expect(timeToMinutes('341:04:32')).toBeNull(); // 20464.53 min - real but > bound
        expect(timeToMinutes('83:35:00')).toBeNull(); // 5015.00 min - just over the bound
    });
    // "-0:00:03" (and similar "-0:xx:xx" values, 4 real rows) is NOT a
    // corrupted value worth rejecting: `parseFloat("-0") || 0` coerces the
    // zero hour to 0 (not -0), so the leading minus sign has no effect and
    // this correctly parses to a small positive, in-bounds number - same as
    // it did before this fix.
    it('does not reject a negative-zero hour ("-0:MM:SS"), which parses as positive', () => {
        expect(timeToMinutes('-0:00:03')).toBeCloseTo(0.05, 5);
    });
    it('parses MM:SS values', () => {
        expect(timeToMinutes('2:30')).toBeCloseTo(2.5, 5);
    });
    it('rejects out-of-bound MM:SS values', () => {
        expect(timeToMinutes('-5:00')).toBeNull();
        expect(timeToMinutes('99999:00')).toBeNull();
    });
});

describe('normalizeBuildVersion', () => {
    // Per Hemanth's confirmation: every real Build/Version value refers to
    // the same single build, canonically "1.0" - not a typo-cleanup merge
    // of otherwise-distinct values, so every non-blank input collapses to
    // the same output regardless of what it originally was.
    it('normalizes every real value - old canonical spellings, typo variants, and NA/NIL alike - to "1.0"', () => {
        expect(normalizeBuildVersion('0.1')).toBe('1.0');
        expect(normalizeBuildVersion('0.0')).toBe('1.0');
        expect(normalizeBuildVersion('NA')).toBe('1.0');
        expect(normalizeBuildVersion('NIL')).toBe('1.0');
        expect(normalizeBuildVersion('0,1')).toBe('1.0');
        expect(normalizeBuildVersion('0-1')).toBe('1.0');
        expect(normalizeBuildVersion('0..1')).toBe('1.0');
        expect(normalizeBuildVersion('o.1')).toBe('1.0');
        expect(normalizeBuildVersion('0')).toBe('1.0');
        expect(normalizeBuildVersion('1.0')).toBe('1.0');
    });
    it('preserves blank (missing data, not a value to normalize)', () => {
        expect(normalizeBuildVersion('')).toBe('');
        expect(normalizeBuildVersion(undefined)).toBe('');
    });
});

describe('normalizeDefectSeverity', () => {
    it('collapses all "no defect" spellings/typos to NA', () => {
        // "NO DEFECT": 2225, "NO Defect": 1110, "NIL": 1014, "No defect": 774,
        // "NA": 655, "No Defect": 328, "NO": 118, "NO defect": 64,
        // "No DEFECT": 22, "No": 17, "N A": 6, "nil": 5, "NO DFECT": 1.
        for (const v of ['NO DEFECT', 'NO Defect', 'NIL', 'No defect', 'NA', 'No Defect', 'NO', 'NO defect', 'No', 'N A', 'nil', 'NO DFECT']) {
            expect(normalizeDefectSeverity(v)).toBe('NA');
        }
    });
    it('maps known severities regardless of casing, including the "Crtical" typo', () => {
        expect(normalizeDefectSeverity('Critical')).toBe('Critical'); // 103
        expect(normalizeDefectSeverity('CRITICAL')).toBe('Critical'); // 11
        expect(normalizeDefectSeverity('critical')).toBe('Critical'); // 4
        expect(normalizeDefectSeverity('Crtical')).toBe('Critical'); // 1 - typo
        expect(normalizeDefectSeverity('High')).toBe('High'); // 227
        expect(normalizeDefectSeverity('high')).toBe('High'); // 12
        expect(normalizeDefectSeverity('MEDIUM')).toBe('Medium'); // 14
        expect(normalizeDefectSeverity('Low')).toBe('Low'); // 79
    });
    it('merges "Extreme" into "Critical" (team-confirmed same thing, not a distinct level)', () => {
        expect(normalizeDefectSeverity('Extreme')).toBe('Critical');
        expect(normalizeDefectSeverity('EXTREME')).toBe('Critical');
        expect(normalizeDefectSeverity('extreme')).toBe('Critical');
    });
    it('merges "Info" into "Low" (team-confirmed same thing, not a distinct level)', () => {
        expect(normalizeDefectSeverity('Info')).toBe('Low');
        expect(normalizeDefectSeverity('INFO')).toBe('Low');
        expect(normalizeDefectSeverity('info')).toBe('Low');
    });
    it('drops free-text defect descriptions and blanks', () => {
        expect(normalizeDefectSeverity('')).toBe('');
        expect(normalizeDefectSeverity('missed few points')).toBe(''); // 3
        expect(normalizeDefectSeverity('Answer is not relevant to the asked question')).toBe(''); // 1
    });
    it('does not match a trailing-punctuation variant not in the known set', () => {
        // "NO DEFECT'": 21 occurrences - has a trailing apostrophe the live
        // sheet introduced, which is NOT in NO_DEFECT_SEVERITY_VALUES (exact
        // string match), so this ports the frontend's existing behavior of
        // silently dropping it to "" rather than "NA". Flagging in case this
        // turns out to be worth fixing, but out of scope for a verbatim port.
        expect(normalizeDefectSeverity("NO DEFECT'")).toBe('');
    });
});

describe('toTitleCase', () => {
    it('title-cases and collapses whitespace', () => {
        expect(toTitleCase('web app')).toBe('Web App');
        expect(toTitleCase('WEB   APP')).toBe('Web App');
        expect(toTitleCase('')).toBe('');
    });
    // "Insect–Pest Management": 1428 real rows use an en-dash; a smaller
    // number of rows elsewhere in Question Category use a plain hyphen for
    // the same kind of compound term. Only treating spaces as word
    // boundaries left the letter after the dash lowercased.
    it('capitalizes the letter after a dash (en-dash and hyphen), not just after spaces', () => {
        expect(toTitleCase('Insect–Pest Management')).toBe('Insect–Pest Management'); // en-dash
        expect(toTitleCase('Insect-Pest Management')).toBe('Insect-Pest Management'); // hyphen
    });
    // Missing-data sentinels, not real words - same special-case pattern as
    // normalizeBuildVersion. Without this, toTitleCase("NA") produced "Na",
    // which slipped past the case-sensitive `v !== "NA"` dropdown-exclusion
    // check used by fields like Language Tested and Channel Tested.
    it('keeps NA/NIL uppercase instead of title-casing them to Na/Nil', () => {
        expect(toTitleCase('NA')).toBe('NA');
        expect(toTitleCase('na')).toBe('NA');
        expect(toTitleCase('NIL')).toBe('NIL');
    });
});

describe('normalizeQuestionCategory', () => {
    it('title-cases plain categories the same as toTitleCase', () => {
        expect(normalizeQuestionCategory('Disease Management')).toBe('Disease Management'); // 1160
        expect(normalizeQuestionCategory('')).toBe('');
    });
    // "&" and "and" are the same category in the live sheet - collapses
    // both to the same output. Real pairs: "Climate, Weather and Stress
    // Management" (879) vs "Climate, Weather & Stress Management" (31);
    // "Market Prices, MSP and Marketing" (407) vs "Market Prices, MSP &
    // Marketing" (40); "Agricultural Schemes and Subsidies" (301) vs
    // "Agricultural Schemes & Subsidies" (8).
    it('collapses "&" to "and" so both spellings produce the same output', () => {
        expect(normalizeQuestionCategory('Climate, Weather and Stress Management')).toBe(
            'Climate, Weather And Stress Management',
        );
        expect(normalizeQuestionCategory('Climate, Weather & Stress Management')).toBe(
            'Climate, Weather And Stress Management',
        );
        expect(normalizeQuestionCategory('Market Prices, MSP and Marketing')).toBe('Market Prices, Msp And Marketing');
        expect(normalizeQuestionCategory('Market Prices, MSP & Marketing')).toBe('Market Prices, Msp And Marketing');
    });
    it('only collapses a standalone "&" (surrounded by whitespace), not one embedded in a token', () => {
        // No real Question Category value has a non-spaced "&", but this
        // confirms the regex doesn't over-match - "A&B" has no "&"
        // surrounded by whitespace on both sides, so it's left alone
        // (still passes through toTitleCase normally).
        expect(normalizeQuestionCategory('A&B Testing')).toBe('A&b Testing');
    });
    // Test Log 2.0 confirmed word-order swaps - merges into the
    // numerically-dominant spelling (122 vs 6, and 48 vs 5), same
    // direction confirmed via a fresh CSV pull, not assumed. Output uses
    // en-dash (not hyphen) in "Bio-Fertilizers"/"Bio-Pesticides" - dash
    // canonicalization runs before this lookup, see the dedicated dash
    // test below.
    it('applies the confirmed Bio-Fertilizers/Bio-Pesticides word-order merge', () => {
        expect(normalizeQuestionCategory('Bio-fertilizers and Bio-pesticides')).toBe('Bio–Fertilizers And Bio–Pesticides'); // 122
        expect(normalizeQuestionCategory('Bio-Pesticides and Bio-Fertilizers')).toBe('Bio–Fertilizers And Bio–Pesticides'); // 6
    });
    it('applies the confirmed Extension/Capacity Building word-order merge', () => {
        expect(normalizeQuestionCategory('Extension & Capacity Building')).toBe('Extension And Capacity Building'); // 48
        expect(normalizeQuestionCategory('Capacity Building & Extension')).toBe('Extension And Capacity Building'); // 5
    });
    // "Insect–Pest Management" (en-dash, no spaces - 1515 rows) and
    // "Insect - Pest Management" (hyphen, spaced - 354 rows) are the same
    // category with two different dash renderings - confirmed via a full
    // scan of live Question Category data as the only such pair currently
    // in the sheet. Canonicalizes to en-dash (the dominant spelling), no
    // spaces, since the en-dash version has far more rows.
    it('canonicalizes hyphen-vs-en-dash spacing variants to the dominant en-dash spelling', () => {
        expect(normalizeQuestionCategory('Insect–Pest Management')).toBe('Insect–Pest Management'); // 1515, en-dash
        expect(normalizeQuestionCategory('Insect - Pest Management')).toBe('Insect–Pest Management'); // 354, hyphen+spaces
    });
    it('canonicalizes a hyphen with no surrounding spaces to en-dash too, not just the spaced form', () => {
        // Not itself a live duplicate (no en-dash counterpart exists for
        // this one), but confirms the transform applies uniformly to any
        // hyphen, not just the specific Insect-Pest spacing pattern.
        expect(normalizeQuestionCategory('Post-Harvest Management')).toBe('Post–Harvest Management');
    });
});

describe('normalizeChannel', () => {
    it('maps known channel spellings explicitly', () => {
        expect(normalizeChannel('Web App')).toBe('Web App'); // 6842
        expect(normalizeChannel('webapp')).toBe('Web App'); // 1
        expect(normalizeChannel('Web app')).toBe('Web App'); // 1
        expect(normalizeChannel('WhatsApp')).toBe('WhatsApp'); // 3227
        expect(normalizeChannel('Whats App')).toBe('WhatsApp'); // 63
        expect(normalizeChannel('Both')).toBe('Both'); // 131
        expect(normalizeChannel('BOTH')).toBe('Both'); // 5
        expect(normalizeChannel('both')).toBe('Both'); // 1
    });
    it('falls back to title case for unrecognized channels', () => {
        expect(normalizeChannel('English')).toBe('English'); // 2 - real stray value
        expect(normalizeChannel('')).toBe('');
    });
});

describe('normalizeTypeOfQuestion', () => {
    it('collapses GDB/GDP variants to GDB', () => {
        expect(normalizeTypeOfQuestion('GDB')).toBe('GDB'); // 2931
        expect(normalizeTypeOfQuestion('gdb')).toBe('GDB'); // 196
    });
    it('collapses Unique/Uniuqe variants', () => {
        expect(normalizeTypeOfQuestion('Unique')).toBe('Unique'); // 2799
        expect(normalizeTypeOfQuestion('UNIQUE')).toBe('Unique'); // 578
        expect(normalizeTypeOfQuestion('unique')).toBe('Unique'); // 54
        expect(normalizeTypeOfQuestion('Uniuqe')).toBe('Unique'); // 1 - typo
    });
    it('collapses Dynamic/Dynmic variants', () => {
        expect(normalizeTypeOfQuestion('DYNAMIC')).toBe('Dynamic'); // 93
        expect(normalizeTypeOfQuestion('dynamic')).toBe('Dynamic'); // 34
        expect(normalizeTypeOfQuestion('Dynmic')).toBe('Dynamic'); // 1 - typo
    });
    it('title-cases dynamic sub-category values unchanged (not collapsed here)', () => {
        // These stay as their own distinct values at this layer - bucketing
        // them under "Dynamic" is diagnostics-layer logic (Phase 4), not
        // this normalizer's job.
        expect(normalizeTypeOfQuestion('WEATHER DYNAMIC')).toBe('Weather Dynamic'); // 338
        expect(normalizeTypeOfQuestion('SCHEME DYNAMIC')).toBe('Scheme Dynamic'); // 133
        expect(normalizeTypeOfQuestion('MANDI DYNAMIC')).toBe('Mandi Dynamic'); // 70
    });
    it('title-cases everything else, including Quality Checking', () => {
        expect(normalizeTypeOfQuestion('quality checking')).toBe('Quality Checking'); // 37
        expect(normalizeTypeOfQuestion('')).toBe('');
    });
});

describe('normalizeTestStatus', () => {
    it('maps known statuses regardless of casing, including the "Pas" typo', () => {
        expect(normalizeTestStatus('PASS')).toBe('Pass'); // 4457
        expect(normalizeTestStatus('Pass')).toBe('Pass'); // 2132
        expect(normalizeTestStatus('pass')).toBe('Pass'); // 19
        expect(normalizeTestStatus('Pas')).toBe('Pass'); // 1 - typo
        expect(normalizeTestStatus('PARTIAL')).toBe('Partial'); // 253
        expect(normalizeTestStatus('Partial')).toBe('Partial'); // 82
        expect(normalizeTestStatus('FAIL')).toBe('Fail'); // 97
        expect(normalizeTestStatus('Fail')).toBe('Fail'); // 27
        expect(normalizeTestStatus('fail')).toBe('Fail'); // 1
        expect(normalizeTestStatus('NA')).toBe('NA'); // 97
    });
    it('drops unrecognized/garbage values, including the literal backslash row', () => {
        expect(normalizeTestStatus('\\')).toBe(''); // 1 - garbage data
        expect(normalizeTestStatus('NO')).toBe(''); // 1 - not a real status here
        expect(normalizeTestStatus('')).toBe('');
    });
});

describe('normalizeSlaStatus', () => {
    // Real values confirmed directly against the live CSV before the SLA
    // Compliance card was built (13,931 rows): "Within SLA" (6,388),
    // "SLA Breached" (3,783), plus casing/wording/typo variants below.
    it('maps every known "Within SLA" spelling/casing variant', () => {
        expect(normalizeSlaStatus('Within SLA')).toBe('Within SLA');
        expect(normalizeSlaStatus('WITHIN SLA')).toBe('Within SLA');
        expect(normalizeSlaStatus('within SLA')).toBe('Within SLA');
        expect(normalizeSlaStatus('Within the SLA')).toBe('Within SLA');
    });

    it('maps every known "SLA Breached" spelling/word-order/typo variant', () => {
        expect(normalizeSlaStatus('SLA Breached')).toBe('SLA Breached');
        expect(normalizeSlaStatus('Breached SLA')).toBe('SLA Breached'); // word-order swap
        expect(normalizeSlaStatus('SLA  Breached')).toBe('SLA Breached'); // double-space
        expect(normalizeSlaStatus('SLA Breachd')).toBe('SLA Breached'); // typo
        expect(normalizeSlaStatus('SLA breached')).toBe('SLA Breached'); // casing
    });

    it('excludes blank/NA/Not Applicable/garbage - returns null, not a bogus 3rd category', () => {
        expect(normalizeSlaStatus('')).toBeNull();
        expect(normalizeSlaStatus(undefined)).toBeNull();
        expect(normalizeSlaStatus('NA')).toBeNull();
        expect(normalizeSlaStatus('Not Applicable')).toBeNull();
        expect(normalizeSlaStatus('\\')).toBeNull(); // garbage data, same as other fields
    });

    it('excludes an arbitrary unrecognized value rather than guessing a bucket for it', () => {
        expect(normalizeSlaStatus('Some Other Random Value')).toBeNull();
    });
});

describe('normalizeTesterName', () => {
    it('applies the confirmed Jhoydeep -> Joydeep typo fix', () => {
        expect(normalizeTesterName('JHOYDEEP')).toBe('Joydeep');
        expect(normalizeTesterName('Jhoydeep')).toBe('Joydeep');
    });
    // Test Log 2.0 spelled these two people's names out in full instead of
    // using the dominant initial-abbreviated form. Confirmed same person,
    // not a different tester - merges into the majority spelling (843/769
    // combined rows) rather than the other way around.
    it('applies the confirmed Kalaga Deni Sudha -> K. Deni Sudha merge', () => {
        expect(normalizeTesterName('Kalaga Deni Sudha')).toBe('K. Deni Sudha'); // 270
        expect(normalizeTesterName('KALAGA DENI SUDHA')).toBe('K. Deni Sudha');
    });
    it('applies the confirmed Tulala Vishnu Vardhan -> T. Vishnu Vardhan merge', () => {
        expect(normalizeTesterName('Tulala vishnu Vardhan')).toBe('T. Vishnu Vardhan'); // 257
        expect(normalizeTesterName('TULALA VISHNU VARDHAN')).toBe('T. Vishnu Vardhan');
    });
    it('applies the confirmed Lavanya -> Lavanya Mathialagan merge', () => {
        expect(normalizeTesterName('Lavanya')).toBe('Lavanya Mathialagan'); // 24
        expect(normalizeTesterName('LAVANYA')).toBe('Lavanya Mathialagan');
    });
    it('applies the confirmed Joydeep Singha Roy -> Joydeep merge', () => {
        expect(normalizeTesterName('Joydeep Singha Roy')).toBe('Joydeep'); // 729
        expect(normalizeTesterName('JOYDEEP SINGHA ROY')).toBe('Joydeep'); // 390
        // The numerically-dominant spelling itself is untouched by the map -
        // it falls through to plain title-casing, same result either way.
        expect(normalizeTesterName('Joydeep')).toBe('Joydeep'); // 789
    });
    it('inserts a space after a period used as an initial separator', () => {
        expect(normalizeTesterName('CH.Sharmila')).toBe('Ch. Sharmila'); // 398
        expect(normalizeTesterName('CH.sharmila')).toBe('Ch. Sharmila'); // 2
        expect(normalizeTesterName('K.Deni sudha')).toBe('K. Deni Sudha'); // 843
        expect(normalizeTesterName('T.Vishnu Vardhan')).toBe('T. Vishnu Vardhan'); // 598
    });
    // "Dhaarani S." (233 rows, Sheet 2.0) vs "Dhaarani S" (1328 rows) is a
    // mechanical formatting difference, not a name typo: the period-spacing
    // regex above only fires when a non-space character follows the period
    // ((?=\S)), so a trailing period at end-of-string was previously never
    // touched and the two spellings stayed split. A single trailing period
    // is now stripped before title-casing, so both forms merge.
    it('strips a trailing period so it merges with the no-period form', () => {
        expect(normalizeTesterName('Dhaarani S.')).toBe('Dhaarani S');
        expect(normalizeTesterName('Dhaarani S')).toBe('Dhaarani S');
    });
    it('title-cases plain names', () => {
        // "JOYDEEP SINGHA ROY" now merges to "Joydeep" - see the dedicated
        // merge test above - so it's no longer a plain title-casing example.
        expect(normalizeTesterName('Lavanya Mathialagan')).toBe('Lavanya Mathialagan'); // 1131
        expect(normalizeTesterName('')).toBe('');
    });
});

describe('isSourceLinkRelevant', () => {
    it('matches the dominant real positive value and its casings', () => {
        expect(isSourceLinkRelevant('Provided & Relevant')).toBe(true); // 3364
        expect(isSourceLinkRelevant('Provided and relevant')).toBe(true); // 509
        expect(isSourceLinkRelevant('provided and relevant')).toBe(true); // 68
        expect(isSourceLinkRelevant('Provided and Relevant')).toBe(true); // 40
    });
    it('matches known typo variants', () => {
        expect(isSourceLinkRelevant('Provioded and relevant')).toBe(true); // 7
        expect(isSourceLinkRelevant('Provided & Revelant')).toBe(true); // 2
        expect(isSourceLinkRelevant('Provident and relevant')).toBe(true); // 2
    });
    it('rejects irrelevant/not-provided values even though they contain "relevant"', () => {
        expect(isSourceLinkRelevant('Provided & Irrelevant')).toBe(false); // 25
        expect(isSourceLinkRelevant('Not Provided')).toBe(false); // 13
        expect(isSourceLinkRelevant('Provided & Not Relevant')).toBe(false); // 2
    });
    it('rejects plain affirmatives and unrelated text that lack the word "relevant"', () => {
        // "Yes"/"yes"/"YES": 1164+953+651 - a plain yes is NOT treated as
        // confirming link relevance by this function (that's handled
        // elsewhere via isYes for other fields, not this one).
        expect(isSourceLinkRelevant('Yes')).toBe(false);
        expect(isSourceLinkRelevant('Successfully Identified as Duplicate')).toBe(false); // 32
        expect(isSourceLinkRelevant('YTES')).toBe(false); // 1 - typo, no known mapping
    });
});

describe('voiceQualityScore', () => {
    it('scores Clear as 10 and Good/Yes/Correct as 8', () => {
        expect(voiceQualityScore('Clear')).toBe(10); // 3636 (input) / 4253 (output)
        expect(voiceQualityScore('CLEAR')).toBe(10); // 177
        expect(voiceQualityScore('clear')).toBe(10); // 54
        expect(voiceQualityScore('GOOD')).toBe(8); // 129
        expect(voiceQualityScore('YES')).toBe(8); // 427
        expect(voiceQualityScore('Correct')).toBe(8); // 49
    });
    it('scores Distorted and Low Volume on the low end', () => {
        expect(voiceQualityScore('Distorted')).toBe(3); // 9
        expect(voiceQualityScore('Low Volume')).toBe(4); // 3 (output only)
    });
    it('scores No Output / No Input variants as 0', () => {
        expect(voiceQualityScore('No Output')).toBe(0); // 96 (input) / 413 (output)
        expect(voiceQualityScore('no input')).toBe(0); // 55
        expect(voiceQualityScore('No ouput')).toBe(0); // 1 - typo, output column
    });
    it('returns null for NA-like and unrecognized values', () => {
        expect(voiceQualityScore('NA')).toBeNull(); // 3226
        expect(voiceQualityScore('')).toBeNull(); // 3001
        expect(voiceQualityScore('Claear')).toBeNull(); // 1 - typo, not in known mapping
    });
});

describe('parseTestDateToISO', () => {
    it('parses the dominant DD-MM-YYYY real values', () => {
        expect(parseTestDateToISO('06-08-2026')).toBe('2026-08-06'); // 334
        expect(parseTestDateToISO('30-06-2026')).toBe('2026-06-30'); // 243
    });
    it('parses DD/MM/YYYY', () => {
        expect(parseTestDateToISO('03/07/2026')).toBe('2026-07-03'); // 160
    });
    it('parses a 2-digit year', () => {
        expect(parseTestDateToISO('01-06-26')).toBe('2026-06-01');
    });
    it('parses DD-Month-YYYY', () => {
        expect(parseTestDateToISO('5-Aug-2026')).toBe('2026-08-05');
        expect(parseTestDateToISO('5 August 2026')).toBe('2026-08-05');
    });
    it('returns null for blank/NA-like values', () => {
        expect(parseTestDateToISO('')).toBeNull(); // 785
        expect(parseTestDateToISO('NA')).toBeNull();
    });
    it('rejects the known drag-to-fill year-overflow artifact (>2026)', () => {
        expect(parseTestDateToISO('14-06-2027')).toBeNull();
        expect(parseTestDateToISO('14-06-2039')).toBeNull();
    });
    it('rejects a 3-digit corrupted year rather than guessing, unless it is a reviewed known typo', () => {
        // A novel/unreviewed 3-digit year still falls through to the generic
        // rejection - only the specific values in KNOWN_DATE_TYPOS below are
        // resolved automatically.
        expect(parseTestDateToISO('20-06-206')).toBeNull();
    });
    it('rejects an out-of-range day/month', () => {
        expect(parseTestDateToISO('32-01-2026')).toBeNull();
        expect(parseTestDateToISO('01-13-2026')).toBeNull();
    });
});

describe('parseTestDateToISO - KNOWN_DATE_TYPOS lookup', () => {
    it('resolves a stray-double-dash typo', () => {
        expect(parseTestDateToISO('25-07--2026')).toBe('2026-07-25');
        expect(parseTestDateToISO('24-07--2026')).toBe('2026-07-24');
    });
    it('resolves a dash-instead-of-digit typo mid-year', () => {
        expect(parseTestDateToISO('25-06-2-26')).toBe('2026-06-25');
    });
    it('resolves a 3-digit-year typo that the generic rule would otherwise reject', () => {
        expect(parseTestDateToISO('14-06-206')).toBe('2026-06-14');
        expect(parseTestDateToISO('14-07-026')).toBe('2026-07-14');
    });
    it('resolves a dot-separator variant', () => {
        expect(parseTestDateToISO('10.06.2026')).toBe('2026-06-10');
    });
    it('resolves a stray-space-around-dash typo', () => {
        expect(parseTestDateToISO('12-06 -2026')).toBe('2026-06-12');
    });
    it('resolves a stray-leading-zero-split typo', () => {
        expect(parseTestDateToISO('25-0-6-2026')).toBe('2026-06-25');
    });
    it('does not affect values outside the reviewed table - still genuinely ambiguous/unparseable', () => {
        // These were deliberately left excluded (not part of KNOWN_DATE_TYPOS)
        // as genuinely ambiguous or not real dates at all.
        expect(parseTestDateToISO('11-13-2026')).toBeNull();
        expect(parseTestDateToISO('15-20-2026')).toBeNull();
        expect(parseTestDateToISO('TL-2522')).toBeNull();
    });
});

describe('getTodayIST', () => {
    it('returns the IST calendar date, not the UTC date, when they differ across midnight', () => {
        // 2026-08-13T20:00:00Z is 2026-08-14 01:30 IST - past midnight IST
        // but still Aug 13 in UTC. This is exactly the boundary that made
        // the "Today" filter silently use the wrong day when todayISO was
        // computed from now.toISOString() (UTC) instead of IST.
        expect(getTodayIST(new Date('2026-08-13T20:00:00.000Z'))).toBe('2026-08-14');
    });

    it('matches the UTC date when both timezones agree (daytime IST)', () => {
        // 2026-08-13T10:03:32Z is 2026-08-13 15:33 IST - same calendar day
        // in both, so this should NOT regress the common case.
        expect(getTodayIST(new Date('2026-08-13T10:03:32.000Z'))).toBe('2026-08-13');
    });

    it('handles the exact IST midnight instant correctly', () => {
        // 2026-08-13T18:30:00Z is exactly 2026-08-14 00:00:00 IST.
        expect(getTodayIST(new Date('2026-08-13T18:30:00.000Z'))).toBe('2026-08-14');
        // One second earlier is still 2026-08-13 23:59:59 IST.
        expect(getTodayIST(new Date('2026-08-13T18:29:59.000Z'))).toBe('2026-08-13');
    });
});
