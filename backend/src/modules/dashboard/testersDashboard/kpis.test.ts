import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import csv from 'csv-parser';
import type { TestersDashboardRecord } from '../interfaces/ITestersDashboardService.js';
import {
    matchesAny,
    normalize,
    isYes,
    isNAlike,
    isSourceLinkRelevant,
    isSourceLinkApplicable,
    pct,
    normalizeDefectSeverity,
    normalizeSlaStatus,
    normalizeChannel,
    normalizeTestStatus,
    timeToMinutes,
    parseTestDateToISO,
    calculateNotificationSuccess,
} from './normalize.js';
import { EMPTY_FILTERS, getPreviousPeriodRows, RESPONSE_TIME_KEY } from './filters.js';
import { dynamicSubBucketFor, isScientificAccuracyEligible } from './diagnostics.js';
import {
    calculateTrustScore,
    calculateExperienceScore,
    calculateVoiceSuccess,
    calculateKpis,
    calculateCriticalFailureCategories,
    calculateReleaseHealth,
    releaseHealthDecision,
    calculatePreviousPeriodStats,
    periodDelta,
    trustScoreHasData,
    experienceScoreHasData,
} from './kpis.js';

// Same loader as filters.test.ts - real live CSV, parsed the same way
// TestersDashboardService.parseCSV does. Numbers asserted below were
// independently computed by running this exact ported logic against this
// same file - re-derive them with a one-off script against
// backend/data/testers-dashboard/updated.csv to spot-check.
function loadRealRecords(): Promise<TestersDashboardRecord[]> {
    const csvPath = path.join(process.cwd(), 'data', 'testers-dashboard', 'updated.csv');
    let fileContent = fs.readFileSync(csvPath, 'utf8');
    const headerIndex = fileContent.indexOf('Test ID,');
    if (headerIndex !== -1) {
        fileContent = fileContent.substring(headerIndex);
    }

    return new Promise((resolve, reject) => {
        const results: TestersDashboardRecord[] = [];
        Readable.from([fileContent])
            .pipe(csv())
            .on('data', (data: TestersDashboardRecord) => {
                const testId = data['Test ID'] ? data['Test ID'].trim() : '';
                if (testId && !testId.startsWith('Project:') && !testId.startsWith('Test ID')) {
                    results.push(data);
                }
            })
            .on('end', () => resolve(results))
            .on('error', reject);
    });
}

let records: TestersDashboardRecord[];

beforeAll(async () => {
    records = await loadRealRecords();
});

describe('calculateTrustScore v2 on the full unfiltered dataset (real CSV)', () => {
    // Trust Score v2: 25% Scientific Accuracy (every row - Static and
    // Dynamic alike - with a real Type of Question tag and a non-blank
    // answer) + 30% Dynamic Accuracy (Weather/Mandi/Schemes, each scoped to
    // its own Question Category bucket, averaged equally) + 15% Correct
    // Source Links + 10% Question Properly Framed (new) + 10% Translation
    // Quality + 10% SLA. Expert Matching and Channel Consistency are gone
    // entirely. All 6 components exclude blank/NA from their own
    // denominator; a value that's neither the clear positive nor blank/NA
    // (e.g. "Partially Correct", "Ambiguous") stays in the denominator but
    // isn't counted as correct.
    //
    // Scientific Accuracy used to be scoped to Static rows only
    // (GDB/Unique/Outreach) - that scoping was removed so Dynamic rows with
    // a real answer (Weather/Mandi Prices/Government Schemes) count too.
    // Rows with no recognized Type of Question at all (blank, "Quality
    // Checking", "Static Dynamic", leaked tester names) still don't count -
    // they were never Static OR Dynamic, just untagged/garbage rows that
    // happen to have a value in this field.
    //
    // Numbers below independently re-verified against a fresh CSV pull
    // immediately before writing this test - re-derive with a one-off
    // script against backend/data/testers-dashboard/updated.csv to
    // spot-check, since (like every other real-data count in this file)
    // this WILL drift as the live sheet keeps changing.
    it('matches independently-computed sub-component percentages for all 6 components', () => {
        const N = records.length;
        expect(N).toBe(17872);

        const { score, breakdown } = calculateTrustScore(records);

        // A_sci: every row with a recognized Type of Question (GDB, Unique,
        // Outreach, OR Dynamic) and a non-blank answer, via the shared
        // isScientificAccuracyEligible (diagnostics.ts) - also reused by
        // Agri Advisory and Knowledge & GDB's Scientific Accuracy
        // sub-metrics (diagnostics.test.ts), so all three stay in sync.
        // "correct" or "yes"/"y" counts as correct.
        const sciEligibleRows = records.filter((r) => isScientificAccuracyEligible(r['Type of Question']));
        const sciApplicable = sciEligibleRows.filter((r) => !isNAlike(r['Answer Scientifically Correct?']));
        expect(sciApplicable.length).toBe(10795);
        const A_sci = Math.round(
            (sciApplicable.filter((r) => matchesAny(r['Answer Scientifically Correct?'], ['correct', 'yes', 'y'])).length /
                sciApplicable.length) *
                100,
        );
        expect(breakdown.A_sci).toBe(A_sci);
        expect(breakdown.A_sci).toBe(95);
        expect(sciApplicable.filter((r) => matchesAny(r['Answer Scientifically Correct?'], ['correct', 'yes', 'y'])).length).toBe(10301);

        // A_dom: each domain scoped to its own Question Category bucket via
        // dynamicSubBucketFor, then averaged equally (10%+10%+10%).
        const domainAcc = (bucket: 'Weather' | 'Mandi Prices' | 'Government Schemes', field: string) => {
            const bucketRows = records.filter((r) => dynamicSubBucketFor(r['Question Category'], r['Type of Question']) === bucket);
            const applicable = bucketRows.filter((r) => !isNAlike(r[field]));
            return { pct: applicable.length ? Math.round((applicable.filter((r) => isYes(r[field])).length / applicable.length) * 100) : 100, applicable: applicable.length };
        };
        const weather = domainAcc('Weather', 'Weather Q Answered Correctly?');
        const mandi = domainAcc('Mandi Prices', 'Mandi Price Q Correct?');
        const scheme = domainAcc('Government Schemes', 'Scheme Q Correct?');
        expect(weather).toEqual({ pct: 99, applicable: 1496 });
        expect(mandi).toEqual({ pct: 90, applicable: 384 });
        expect(scheme).toEqual({ pct: 100, applicable: 410 });
        expect(breakdown.A_dom).toBe(Math.round((weather.pct + mandi.pct + scheme.pct) / 3));
        expect(breakdown.A_dom).toBe(96);

        // S_lnk: isSourceLinkApplicable() excludes blank/NA plus the leaked
        // "Successfully Identified as Duplicate"/"0:00:00" values;
        // isSourceLinkRelevant() accepts both the "Yes" and "Provided &
        // Relevant" answer styles as the same positive meaning.
        const lnkApplicable = records.filter((r) => isSourceLinkApplicable(r['Correct Source Links Provided?']));
        expect(lnkApplicable.length).toBe(9565);
        const S_lnk = Math.round(
            (lnkApplicable.filter((r) => isSourceLinkRelevant(r['Correct Source Links Provided?'])).length / lnkApplicable.length) * 100,
        );
        expect(breakdown.S_lnk).toBe(S_lnk);
        expect(breakdown.S_lnk).toBe(99);
        expect(lnkApplicable.filter((r) => isSourceLinkRelevant(r['Correct Source Links Provided?'])).length).toBe(9500);

        // Q_frm: new component. "English" (leaked Language Tested value) is
        // excluded from the denominator alongside blank/NA.
        const frmApplicable = records.filter(
            (r) => !isNAlike(r['Question Correctly Framed?']) && normalize(r['Question Correctly Framed?']) !== 'english',
        );
        expect(frmApplicable.length).toBe(14329);
        const Q_frm = Math.round(
            (frmApplicable.filter((r) => {
                const n = normalize(r['Question Correctly Framed?']);
                return (n.includes('well framed') && !n.includes('not well framed')) || matchesAny(r['Question Correctly Framed?'], ['yes', 'y']);
            }).length /
                frmApplicable.length) *
                100,
        );
        expect(breakdown.Q_frm).toBe(Q_frm);
        expect(breakdown.Q_frm).toBe(100);

        // Q_trn/S_sla: unchanged shared formulas.
        const trnApplicable = records.filter((r) => !isNAlike(r['Translation Quality']));
        expect(trnApplicable.length).toBe(11939);
        expect(breakdown.Q_trn).toBe(
            Math.round((trnApplicable.filter((r) => matchesAny(r['Translation Quality'], ['correct', 'good'])).length / trnApplicable.length) * 100),
        );
        expect(breakdown.Q_trn).toBe(98);

        const slaValid = records.filter((r) => normalizeSlaStatus(r['SLA Status']) !== null);
        expect(slaValid.length).toBe(13090);
        expect(breakdown.S_sla).toBe(
            Math.round((slaValid.filter((r) => normalizeSlaStatus(r['SLA Status']) === 'Within SLA').length / slaValid.length) * 100),
        );
        expect(breakdown.S_sla).toBe(66);

        // Weighted-sum cross-check, then the final score.
        expect(score).toBe(
            Math.round(0.25 * breakdown.A_sci + 0.3 * breakdown.A_dom + 0.15 * breakdown.S_lnk + 0.1 * breakdown.Q_frm + 0.1 * breakdown.Q_trn + 0.1 * breakdown.S_sla),
        );
        expect(score).toBe(94);
    });

    // A_sci must exclude rows with no recognized Type of Question at all
    // (blank/"Quality Checking"/"Static Dynamic"/leaked names) from the
    // denominator entirely, while including BOTH Static and Dynamic rows.
    it('A_sci includes both Static and Dynamic rows, excluding only rows with no recognized Type of Question (synthetic)', () => {
        const { breakdown } = calculateTrustScore([
            { 'Type of Question': 'GDB', 'Answer Scientifically Correct?': 'Correct' }, // Static, correct
            { 'Type of Question': 'GDB', 'Answer Scientifically Correct?': 'Incorrect' }, // Static, incorrect
            { 'Type of Question': 'Weather Dynamic', 'Answer Scientifically Correct?': 'Correct' }, // Dynamic, correct - now included
            { 'Type of Question': 'Quality Checking', 'Answer Scientifically Correct?': 'Correct' }, // unrecognized type - excluded entirely
        ]);
        // Static + Dynamic rows only: 2/3 = 67%. The unrecognized-type row
        // never enters the denominator at all (not even as a non-match).
        expect(breakdown.A_sci).toBe(67);
    });

    // "Yes"/"y" counts as correct alongside "Correct" - a real, sizeable
    // share of Static rows use "Yes" instead of "Correct".
    it('A_sci counts "yes"/"y" as correct in addition to "correct" (synthetic)', () => {
        const { breakdown } = calculateTrustScore([
            { 'Type of Question': 'GDB', 'Answer Scientifically Correct?': 'Correct' },
            { 'Type of Question': 'GDB', 'Answer Scientifically Correct?': 'Yes' },
            { 'Type of Question': 'GDB', 'Answer Scientifically Correct?': 'y' },
            { 'Type of Question': 'GDB', 'Answer Scientifically Correct?': 'Incorrect' },
        ]);
        expect(breakdown.A_sci).toBe(75);
    });

    // Partial values stay in the denominator but don't count as correct -
    // the "only the clear positive value counts" rule, applied to A_sci.
    it('A_sci counts "Partially Correct" as incorrect, not excluded (synthetic)', () => {
        const { breakdown } = calculateTrustScore([
            { 'Type of Question': 'GDB', 'Answer Scientifically Correct?': 'Correct' },
            { 'Type of Question': 'GDB', 'Answer Scientifically Correct?': 'Partially Correct' },
        ]);
        // If excluded like blank/NA: 1/1 = 100%. Counted as incorrect: 1/2 = 50%.
        expect(breakdown.A_sci).toBe(50);
    });

    // A_dom's category scoping: a non-blank domain-correctness answer on a
    // row OUTSIDE that domain's own category bucket must not count, even
    // though the old (pre-v2) formula would have included it.
    it('A_dom scopes each domain to its own Question Category bucket, excluding non-blank answers outside it (synthetic)', () => {
        const { breakdown } = calculateTrustScore([
            { 'Type of Question': 'Weather Dynamic', 'Question Category': 'Climate, Weather', 'Weather Q Answered Correctly?': 'Yes' }, // in-bucket, correct
            { 'Type of Question': 'Weather Dynamic', 'Question Category': 'Climate, Weather', 'Weather Q Answered Correctly?': 'No' }, // in-bucket, incorrect
            // Non-blank Weather answer on a row that ISN'T a Weather-category Dynamic row - excluded from the bucket.
            { 'Type of Question': 'GDB', 'Weather Q Answered Correctly?': 'Yes' },
        ]);
        // If the leaked 3rd row counted: 2/3 = 67%. Category-scoped: 1/2 = 50%.
        // Mandi/Scheme both have zero applicable rows and default to 100.
        expect(breakdown.A_dom).toBe(Math.round((50 + 100 + 100) / 3));
    });

    // Testers answer "Correct Source Links Provided?" two different ways -
    // a plain "Yes"/"No", or a "Provided & Relevant"-style value - both
    // meaning the same thing. Counting only the "relevant" style as correct
    // wrongly failed every "Yes" row.
    it('S_lnk treats "Yes" and "Provided & Relevant" as the same positive meaning (synthetic)', () => {
        const { breakdown } = calculateTrustScore([
            { 'Correct Source Links Provided?': 'Provided & Relevant' },
            { 'Correct Source Links Provided?': 'Yes' },
            { 'Correct Source Links Provided?': 'No' },
        ]);
        expect(breakdown.S_lnk).toBe(67);
    });

    it('S_lnk rejects "Provided & Not Relevant" as incorrect, not a false substring match on "relevant" (synthetic)', () => {
        const { breakdown } = calculateTrustScore([
            { 'Correct Source Links Provided?': 'Provided & Relevant' },
            { 'Correct Source Links Provided?': 'Provided & Not Relevant' },
        ]);
        expect(breakdown.S_lnk).toBe(50);
    });

    it('S_lnk excludes the leaked "Successfully Identified as Duplicate" and "0:00:00" values from the denominator, alongside blank/NA (synthetic)', () => {
        const { breakdown } = calculateTrustScore([
            { 'Correct Source Links Provided?': 'Provided & Relevant' },
            { 'Correct Source Links Provided?': 'Not Provided' },
            { 'Correct Source Links Provided?': 'Successfully Identified as Duplicate' }, // leaked from Q-ID Consistent - excluded
            { 'Correct Source Links Provided?': '0:00:00' }, // leaked time value - excluded
            { 'Correct Source Links Provided?': 'NA' },
            { 'Correct Source Links Provided?': '' },
        ]);
        // If either leaked value counted as a non-match: 1/4 = 25%. Excluded: 1/2 = 50%.
        expect(breakdown.S_lnk).toBe(50);
    });

    it('Q_frm excludes the leaked "English" value from the denominator, alongside blank/NA (synthetic)', () => {
        const { breakdown } = calculateTrustScore([
            { 'Question Correctly Framed?': 'Well Framed' },
            { 'Question Correctly Framed?': 'Incorrectly Framed' },
            { 'Question Correctly Framed?': 'English' }, // leaked Language Tested value - excluded
            { 'Question Correctly Framed?': 'NA' },
            { 'Question Correctly Framed?': '' },
        ]);
        // If "English" counted as a non-match: 1/3 = 33%. Excluded: 1/2 = 50%.
        expect(breakdown.Q_frm).toBe(50);
    });

    it('Q_frm treats "well Framed" casing variants and "yes" as correct, and "not well framed" as incorrect, not a false substring match (synthetic)', () => {
        const { breakdown } = calculateTrustScore([
            { 'Question Correctly Framed?': 'Well Framed' },
            { 'Question Correctly Framed?': 'well Framed' },
            { 'Question Correctly Framed?': 'Yes' },
            { 'Question Correctly Framed?': 'not well framed' }, // contains "well framed" as a substring but must NOT match
            { 'Question Correctly Framed?': 'Ambiguous' },
        ]);
        expect(breakdown.Q_frm).toBe(60);
    });

    it('S_sla reuses calculateSlaCompliance unchanged - the leaked "Well Framed" value falls out via the same unrecognized-value exclusion as any other garbage (synthetic)', () => {
        const { breakdown } = calculateTrustScore([
            { 'SLA Status': 'Within SLA' },
            { 'SLA Status': 'SLA Breached' },
            { 'SLA Status': 'Well Framed' }, // leaked from Question Correctly Framed - excluded, not counted as breached
        ]);
        expect(breakdown.S_sla).toBe(50);
    });

    it('returns all-zero for an empty dataset', () => {
        expect(calculateTrustScore([])).toEqual({
            score: 0,
            breakdown: { A_sci: 0, A_dom: 0, S_lnk: 0, Q_frm: 0, Q_trn: 0, S_sla: 0 },
        });
    });
});

describe('calculateExperienceScore on the full unfiltered dataset (real CSV)', () => {
    // Q_trn's value is shared with calculateTrustScore via
    // translationQualityPct() (see the cross-check test below). S_rsp now
    // uses a smooth 0-120min linear scale instead of the old
    // 15min-threshold/120min-ceiling curve - there was no confirmed
    // business justification for the 15min threshold, only the 120min SLA
    // limit is confirmed. S_sla now reuses the exact same
    // normalizeSlaStatus-based calculation the standalone SLA Compliance
    // card uses (denominator = Within SLA + SLA Breached rows only,
    // excluding blank/NA/Not Applicable/garbage) instead of its own cruder
    // matchesAny(...'within sla') ÷ all-N-rows formula - the two
    // previously disagreed (45% vs 63% on this dataset) and now can't, by
    // construction (see the cross-check test below). N_exp now excludes
    // blank/NA rows from its denominator too - per a live-data
    // investigation, blanks in the 3 notification fields are NOT spread
    // evenly (72%-96% blank rate across Type of Question, concentrated in
    // Dynamic/unmapped types), unlike A_sci/S_lnk/E_exp/Q_trn where the
    // same fix was already applied - only ~16% of rows even have a complete
    // 3-field notification record. V_io's 4 sub-fields now each scope to
    // their own non-blank rows independently (via applicablePct()) instead
    // of sharing ÷N - per a live-data investigation, each field is blank on
    // 57%-60% of rows, moderately concentrated by Type of Question
    // (50%-78% blank rate). The strict pass conditions themselves are
    // unchanged throughout, only denominators moved from ÷N to ÷applicable.
    // Refreshed against a fresh CSV pull.
    it('matches independently-computed sub-component percentages', () => {
        const { score, breakdown } = calculateExperienceScore(records);

        const validSlaRows = records.filter((r) => normalizeSlaStatus(r['SLA Status']) !== null);
        const S_sla = Math.round(
            (validSlaRows.filter((r) => normalizeSlaStatus(r['SLA Status']) === 'Within SLA').length / validSlaRows.length) *
                100,
        );
        expect(breakdown.S_sla).toBe(S_sla);
        expect(breakdown.S_sla).toBe(66);

        const applicableNotifRows = records.filter(
            (r) =>
                !isNAlike(r['Notification Received?']) &&
                !isNAlike(r['Notification on Same Thread?']) &&
                !isNAlike(r['Notification Linked Correct Q-ID?']),
        );
        const N_exp = Math.round(
            (applicableNotifRows.filter(
                (r) =>
                    matchesAny(r['Notification Received?'], ['received on time', 'received late', 'yes']) &&
                    isYes(r['Notification on Same Thread?']) &&
                    isYes(r['Notification Linked Correct Q-ID?']),
            ).length /
                applicableNotifRows.length) *
                100,
        );
        expect(breakdown.N_exp).toBe(N_exp);
        expect(breakdown.N_exp).toBe(86);

        const voiceField = (field: string, matchFn: (r: TestersDashboardRecord) => boolean) => {
            const applicable = records.filter((r) => !isNAlike(r[field]));
            return applicable.length ? Math.round((applicable.filter(matchFn).length / applicable.length) * 100) : 0;
        };
        const V_io = Math.round(
            (voiceField('Voice Input Working?', (r) => isYes(r['Voice Input Working?'])) +
                voiceField('Voice Output Working?', (r) => isYes(r['Voice Output Working?'])) +
                voiceField('Voice Input Quality', (r) => matchesAny(r['Voice Input Quality'], ['clear'])) +
                voiceField('Voice Output Quality', (r) => matchesAny(r['Voice Output Quality'], ['clear']))) /
                4,
        );
        expect(breakdown.V_io).toBe(V_io);
        expect(breakdown.V_io).toBe(87);

        expect(breakdown.S_rsp).toBe(80);
        expect(breakdown.Q_trn).toBe(98);
        expect(score).toBe(82);
    });

    // V_io: excluding blank/NA from each field's own denominator produces a
    // real, sizeable gap vs the old ÷N-for-all-4 formula (not a no-op) - in
    // line with the ~51-point gap the investigation found.
    it('V_io: excluding blank/NA from each field\'s own denominator produces a real, sizeable gap vs the old ÷N formula (not a no-op)', () => {
        const { breakdown } = calculateExperienceScore(records);
        const N = records.length;
        const V_io_old = Math.round(
            (pct(records.filter((r) => isYes(r['Voice Input Working?'])).length, N) +
                pct(records.filter((r) => isYes(r['Voice Output Working?'])).length, N) +
                pct(records.filter((r) => matchesAny(r['Voice Input Quality'], ['clear'])).length, N) +
                pct(records.filter((r) => matchesAny(r['Voice Output Quality'], ['clear'])).length, N)) /
                4,
        );
        expect(V_io_old).toBe(35);
        expect(breakdown.V_io).toBeGreaterThan(V_io_old);
        expect(breakdown.V_io - V_io_old).toBe(52);
    });

    // Synthetic - proves each of the 4 voice fields is scoped to its OWN
    // non-blank rows independently, not a shared "all 4 filled" set (unlike
    // N_exp's shared applicable set) - a row blank in one voice field still
    // contributes to the other 3 fields' denominators.
    it('V_io scopes each field to its own non-blank rows independently, not a shared all-4-filled set (synthetic)', () => {
        const { breakdown } = calculateExperienceScore([
            {
                'Voice Input Working?': 'Yes',
                'Voice Output Working?': 'Yes',
                'Voice Input Quality': 'Clear',
                'Voice Output Quality': 'Clear',
            }, // all 4 filled, all pass
            {
                'Voice Input Working?': 'No',
                'Voice Output Working?': '', // blank - excluded from Voice Output Working's own denominator only
                'Voice Input Quality': 'Distorted',
                'Voice Output Quality': '', // blank - excluded from Voice Output Quality's own denominator only
            },
        ]);
        // Voice Input Working: applicable=2 (Yes, No), 1 pass -> 50%
        // Voice Output Working: applicable=1 (Yes only, row 2 blank), 1 pass -> 100%
        // Voice Input Quality: applicable=2 (Clear, Distorted), 1 pass -> 50%
        // Voice Output Quality: applicable=1 (Clear only, row 2 blank), 1 pass -> 100%
        // V_io = (50 + 100 + 50 + 100) / 4 = 75
        expect(breakdown.V_io).toBe(75);
    });

    // N_exp excluding blank/NA from its denominator produces a real,
    // sizeable gap vs the old ÷N formula (not a no-op) - the 13% -> 84%
    // swing seen in the investigation is far larger than the earlier
    // A_sci/S_lnk/E_exp/Q_trn fixes' gaps, since notification fields are
    // blank on the large majority of rows.
    it('N_exp: excluding blank/NA from the denominator produces a real, sizeable gap vs the old ÷N formula (not a no-op)', () => {
        const { breakdown } = calculateExperienceScore(records);
        const N_exp_old = pct(
            records.filter(
                (r) =>
                    matchesAny(r['Notification Received?'], ['received on time', 'received late', 'yes']) &&
                    isYes(r['Notification on Same Thread?']) &&
                    isYes(r['Notification Linked Correct Q-ID?']),
            ).length,
            records.length,
        );
        expect(N_exp_old).toBe(13);
        expect(breakdown.N_exp).toBeGreaterThan(N_exp_old);
        expect(breakdown.N_exp - N_exp_old).toBe(73);
    });

    // Synthetic - proves a row with ANY of the 3 notification fields
    // blank/NA is excluded from both the numerator AND the denominator,
    // not just silently failing the strict pass condition.
    it('N_exp excludes a row from both numerator and denominator if any of the 3 notification fields is blank/NA (synthetic)', () => {
        const { breakdown } = calculateExperienceScore([
            {
                'Notification Received?': 'Received on Time',
                'Notification on Same Thread?': 'Yes',
                'Notification Linked Correct Q-ID?': 'Yes',
            }, // applicable, passes all 3
            {
                'Notification Received?': 'Not Received',
                'Notification on Same Thread?': 'Yes',
                'Notification Linked Correct Q-ID?': 'Yes',
            }, // applicable, fails (not received)
            {
                'Notification Received?': '',
                'Notification on Same Thread?': 'Yes',
                'Notification Linked Correct Q-ID?': 'Yes',
            }, // excluded - Received blank
            {
                'Notification Received?': 'Received on Time',
                'Notification on Same Thread?': 'NA',
                'Notification Linked Correct Q-ID?': 'Yes',
            }, // excluded - Same Thread NA
            {
                'Notification Received?': 'Received on Time',
                'Notification on Same Thread?': 'Yes',
                'Notification Linked Correct Q-ID?': '',
            }, // excluded - Q-ID blank
        ]);
        // Old (÷N=5) would give 20%; new (÷applicable=2) gives 50%.
        expect(breakdown.N_exp).toBe(50);
    });

    // S_sla must agree with the standalone SLA Compliance card's
    // withinSlaPct exactly - both call calculateSlaCompliance() now, so a
    // divergence here would mean the extraction didn't actually unify them.
    it('S_sla matches the standalone SLA Compliance card\'s withinSlaPct exactly (real CSV)', () => {
        const { breakdown } = calculateExperienceScore(records);
        const kpis = calculateKpis(records);
        expect(breakdown.S_sla).toBe(kpis.slaBreakdown.withinSlaPct);
    });

    it('returns all-zero for an empty dataset', () => {
        expect(calculateExperienceScore([])).toEqual({
            score: 0,
            breakdown: { S_rsp: 0, S_sla: 0, V_io: 0, Q_trn: 0, N_exp: 0 },
        });
    });

    // The 15min-threshold-removal fix: S_rsp is now a smooth straight-line
    // scale from 0min (100) to 120min (0), with no flat "grace period" up
    // front - every extra minute of wait now costs some score, not just
    // minutes past 15. Synthetic rows since the real dataset's response
    // times don't land on exact round numbers.
    it('S_rsp follows a smooth 0-120min linear scale with no 15min threshold (synthetic)', () => {
        const rows: TestersDashboardRecord[] = [
            { [RESPONSE_TIME_KEY]: '0' }, // 0 min -> 100
            { [RESPONSE_TIME_KEY]: '60' }, // 60 min -> 50 (midpoint)
            { [RESPONSE_TIME_KEY]: '120' }, // 120 min -> 0
        ];
        const zero = calculateExperienceScore([rows[0]]);
        expect(zero.breakdown.S_rsp).toBe(100);

        const midpoint = calculateExperienceScore([rows[1]]);
        expect(midpoint.breakdown.S_rsp).toBe(50);

        const atLimit = calculateExperienceScore([rows[2]]);
        expect(atLimit.breakdown.S_rsp).toBe(0);
    });

    // Anything past the 120min SLA limit stays floored at 0, never negative.
    it('S_rsp floors at 0 (not negative) for response times over 120min (synthetic)', () => {
        const { breakdown } = calculateExperienceScore([
            { [RESPONSE_TIME_KEY]: '121' },
            { [RESPONSE_TIME_KEY]: '500' },
        ]);
        expect(breakdown.S_rsp).toBe(0);
    });

    // Both calculateTrustScore and calculateExperienceScore compute their
    // own Q_trn independently, over the same rows, with the identical
    // formula - they must always agree.
    it('computes the same Q_trn as calculateTrustScore (same formula, same rows)', () => {
        const trust = calculateTrustScore(records);
        const experience = calculateExperienceScore(records);
        expect(experience.breakdown.Q_trn).toBe(trust.breakdown.Q_trn);
    });
});

describe('trustScoreHasData / experienceScoreHasData - chart-only "real data" detection', () => {
    // These exist purely for the daily trend chart (chartData.ts) to
    // distinguish a genuine score from A_dom's (Trust Score) or a
    // zero-denominator pct()'s (Experience Score) empty-data defaults -
    // neither function changes calculateTrustScore/calculateExperienceScore
    // themselves, which the main dashboard's cards still rely on unchanged.
    it('both return false for an empty row set', () => {
        expect(trustScoreHasData([])).toBe(false);
        expect(experienceScoreHasData([])).toBe(false);
    });

    it('trustScoreHasData is false when all 6 sub-metric fields are blank/NA, even with rows present (synthetic)', () => {
        const rows: TestersDashboardRecord[] = [
            { 'Type of Question': 'GDB', 'Overall Test Status': '' }, // fields outside the 6 sub-metrics don't count
            {},
        ];
        expect(trustScoreHasData(rows)).toBe(false);
    });

    // A_sci's hasData check mirrors calculateTrustScore's own (now
    // scope-free-across-Static/Dynamic) A_sci scoping - both a Static and a
    // Dynamic row with a non-blank Scientific Accuracy answer count as "has
    // data", but a row with no recognized Type of Question at all does not.
    it('trustScoreHasData is true for both a Static and a Dynamic row with a real Scientific Accuracy answer, but not an unrecognized-type row (synthetic)', () => {
        expect(trustScoreHasData([{ 'Type of Question': 'GDB', 'Answer Scientifically Correct?': 'Correct' }])).toBe(true);
        expect(trustScoreHasData([{ 'Type of Question': 'Weather Dynamic', 'Answer Scientifically Correct?': 'Correct' }])).toBe(true);
        expect(trustScoreHasData([{ 'Type of Question': 'Quality Checking', 'Answer Scientifically Correct?': 'Correct' }])).toBe(false);
    });

    // The critical case this function exists for: a row with ONLY a real,
    // correctly-categorized domain field (Weather/Mandi/Scheme) and nothing
    // else must still count as "has data" - A_dom would compute a real
    // (non-default) value here, even though the other 5 sub-metrics are
    // still genuinely 0. Mirrors A_dom's own category-bucket scoping - a
    // non-blank domain answer OUTSIDE its own category bucket doesn't count.
    it('trustScoreHasData is true when only a category-scoped domain field (Weather/Mandi/Scheme) has real data (synthetic)', () => {
        expect(trustScoreHasData([{ 'Type of Question': 'Weather Dynamic', 'Question Category': 'Weather', 'Weather Q Answered Correctly?': 'Yes' }])).toBe(true);
        expect(trustScoreHasData([{ 'Type of Question': 'Mandi Dynamic', 'Question Category': 'Market Prices', 'Mandi Price Q Correct?': 'No' }])).toBe(true);
        expect(trustScoreHasData([{ 'Type of Question': 'Scheme Dynamic', 'Question Category': 'Government Schemes', 'Scheme Q Correct?': 'Yes' }])).toBe(true);
        // Not scoped into any domain bucket (plain GDB row) - excluded even with a non-blank value.
        expect(trustScoreHasData([{ 'Type of Question': 'GDB', 'Weather Q Answered Correctly?': 'Yes' }])).toBe(false);
    });

    it.each([
        ['Correct Source Links Provided?', 'Provided and Relevant'],
        ['Translation Quality', 'Correct'],
    ] as const)('trustScoreHasData is true when only %s has real data (synthetic)', (field, value) => {
        expect(trustScoreHasData([{ [field]: value }])).toBe(true);
    });

    it('trustScoreHasData is true when only Question Correctly Framed has real, applicable data - not when it\'s only the leaked "English" value (synthetic)', () => {
        expect(trustScoreHasData([{ 'Question Correctly Framed?': 'Well Framed' }])).toBe(true);
        expect(trustScoreHasData([{ 'Question Correctly Framed?': 'English' }])).toBe(false);
    });

    it('trustScoreHasData is true when only a recognized SLA Status exists, not when it\'s only the leaked "Well Framed" value (synthetic)', () => {
        expect(trustScoreHasData([{ 'SLA Status': 'Within SLA' }])).toBe(true);
        expect(trustScoreHasData([{ 'SLA Status': 'Well Framed' }])).toBe(false);
    });

    it('experienceScoreHasData is false when all 5 sub-metric fields are blank/NA, even with rows present (synthetic)', () => {
        expect(experienceScoreHasData([{ 'Type of Question': 'GDB' }, {}])).toBe(false);
    });

    it('experienceScoreHasData is true when only SLA Status has real data (synthetic)', () => {
        expect(experienceScoreHasData([{ 'SLA Status': 'Within SLA' }])).toBe(true);
    });

    it('experienceScoreHasData is true when only Response Time has real data (synthetic)', () => {
        expect(experienceScoreHasData([{ [RESPONSE_TIME_KEY]: '45' }])).toBe(true);
    });

    it('experienceScoreHasData is true when only a Voice sub-field has real data (synthetic)', () => {
        expect(experienceScoreHasData([{ 'Voice Input Quality': 'Clear' }])).toBe(true);
    });

    // Real-CSV cross-check against the currently known future/near-empty
    // dates - pinned exact values, so a future drift shows up as a visible
    // diff. Re-derive with a one-off script against
    // backend/data/testers-dashboard/updated.csv to spot-check if this
    // starts failing (the live sheet keeps growing, so this list itself has
    // already changed twice this session as more real rows landed on
    // previously-near-empty dates - most of the original 13 now have enough
    // real data that both flags read true, leaving only the "-11" dates
    // genuinely empty for both metrics today).
    it('correctly flags the currently-empty dates as no-data for both Trust Score and Farmer Experience', () => {
        const byDate = (iso: string) => records.filter((r) => parseTestDateToISO(r['Test Date']) === iso);
        const noDataDates = ['2026-09-11', '2026-10-11', '2026-11-11', '2026-12-11'];
        noDataDates.forEach((d) => {
            expect(trustScoreHasData(byDate(d))).toBe(false);
            expect(experienceScoreHasData(byDate(d))).toBe(false);
        });

        // The independence of the two flags (a day can have Farmer
        // Experience data without Trust Score data, or vice versa) is
        // covered by the synthetic tests above instead - live data on these
        // exact dates no longer demonstrates a mixed result.
        const nowHasDataDates = [
            '2026-06-03', '2026-09-05', '2026-09-09',
            '2026-10-03', '2026-10-04', '2026-11-03', '2026-11-04', '2026-12-03', '2026-12-04',
        ];
        nowHasDataDates.forEach((d) => {
            expect(trustScoreHasData(byDate(d))).toBe(true);
            expect(experienceScoreHasData(byDate(d))).toBe(true);
        });
    });

    // A normal, real-data-rich date must show hasData=true for both.
    it('a normal historical date with real data shows hasData=true for both', () => {
        const rows = records.filter((r) => parseTestDateToISO(r['Test Date']) === '2026-08-06');
        expect(rows.length).toBeGreaterThan(0);
        expect(trustScoreHasData(rows)).toBe(true);
        expect(experienceScoreHasData(rows)).toBe(true);
    });
});

describe('calculateCriticalFailureCategories - Critical Failures card v2 (real CSV)', () => {
    // Numbers below independently re-verified against a fresh CSV pull
    // immediately before writing this test - re-derive with a one-off
    // script against backend/data/testers-dashboard/updated.csv to
    // spot-check, since (like every other real-data count in this file)
    // this WILL drift as the live sheet keeps changing.
    it('has exactly 13 rows (8 unchanged + Answer Never Received + 3 SLA rows + GDB Retrieval Failure) with matching Failures/Successes counts', () => {
        const result = calculateCriticalFailureCategories(records);
        expect(result.categories.map((c) => c.key)).toEqual([
            'incorrect_answer',
            'weather_incorrect',
            'mandi_incorrect',
            'scheme_incorrect',
            'db_failure',
            'notif_failure',
            'duplicate_qid',
            'critical_bug',
            'answer_never_received',
            'sla_breach_2hr',
            'sla_breach_24hr',
            'sla_breach_7day',
            'gdb_retrieval_failure',
        ]);

        const byKey = (key: string) => result.categories.find((c) => c.key === key)!;

        // Categories 1-8 are UNCHANGED - same values as the pre-existing
        // criticalBreakdown fields calculateKpis has always returned.
        expect(byKey('incorrect_answer').failureCount).toBe(254);
        expect(byKey('weather_incorrect').failureCount).toBe(63);
        expect(byKey('mandi_incorrect').failureCount).toBe(67);
        expect(byKey('scheme_incorrect').failureCount).toBe(49);
        expect(byKey('db_failure').failureCount).toBe(1055);
        expect(byKey('notif_failure').failureCount).toBe(950);
        expect(byKey('duplicate_qid').failureCount).toBe(57);
        expect(byKey('critical_bug').failureCount).toBe(121);

        // Category 9 (NEW) - independently cross-checked: both signals must
        // agree (blank Time Answer Received AND no valid Response Time).
        const timeAnsField = 'Time Answer Received (HH:MM:SS)';
        const answerNeverReceived = records.filter(
            (r) => isNAlike(r[timeAnsField]) && timeToMinutes(r[RESPONSE_TIME_KEY]) === null,
        );
        expect(answerNeverReceived.length).toBe(3046);
        expect(byKey('answer_never_received').failureCount).toBe(answerNeverReceived.length);
        const answerReceived = records.filter(
            (r) => !isNAlike(r[timeAnsField]) && timeToMinutes(r[RESPONSE_TIME_KEY]) !== null,
        );
        expect(byKey('answer_never_received').successCount).toBe(answerReceived.length);

        // Category 10 (NEW) - 3 independent (non-exclusive) SLA benchmark
        // rows, using the raised 100,000-min parse cap (RESPONSE_TIME_PARSE_CAP_MINUTES)
        // so the 7-day row can see genuine multi-day delays at all.
        const validReadings = records
            .map((r) => timeToMinutes(r[RESPONSE_TIME_KEY]))
            .filter((m): m is number => m !== null);
        expect(validReadings.filter((m) => m > 120).length).toBe(2228);
        expect(validReadings.filter((m) => m > 1440).length).toBe(913);
        expect(validReadings.filter((m) => m > 10080).length).toBe(113);
        expect(byKey('sla_breach_2hr').failureCount).toBe(2228);
        expect(byKey('sla_breach_24hr').failureCount).toBe(913);
        expect(byKey('sla_breach_7day').failureCount).toBe(113);
        // Cumulative nesting: every 7-day breach is also a 24-hour and
        // 2-hour breach, so the counts must be monotonically non-increasing
        // as the threshold rises.
        expect(byKey('sla_breach_2hr').failureCount).toBeGreaterThanOrEqual(byKey('sla_breach_24hr').failureCount);
        expect(byKey('sla_breach_24hr').failureCount).toBeGreaterThanOrEqual(byKey('sla_breach_7day').failureCount);

        // Category 11 - GDB Retrieval Failure: built from Type of Question
        // === GDB (any casing/whitespace variant) AND 120-min Msg Shown to
        // User? === Yes, both via existing normalize.ts helpers. No longer a
        // pending placeholder - see kpis.ts's category-11 comment for the
        // rule and the known data quality concern.
        expect(byKey('gdb_retrieval_failure')).toEqual({
            key: 'gdb_retrieval_failure',
            label: 'GDB Retrieval Failure (API)',
            successLabel: 'GDB Retrieved Successfully',
            failureCount: 674,
            successCount: 453,
        });

        // Totals: sum of all 13 rows' counts, and distinct Test IDs counted
        // in at least one category - the latter is meaningfully smaller,
        // confirming the overlap the task called out (grows further with
        // Category 9/10/11 layered on top of the original 8).
        expect(result.failuresTotal).toBe(9590);
        expect(result.successesTotal).toBe(76550);
        expect(result.distinctFailureRows).toBe(7485);
        expect(result.distinctSuccessRows).toBe(14579);
        // evaluableRows (Fix 1): rows counted on EITHER tab of at least one
        // category - Pass Rate's new denominator.
        expect(result.evaluableRows).toBe(16945);
        expect(result.distinctFailureRows).toBeLessThan(result.failuresTotal);
        expect(result.distinctSuccessRows).toBeLessThan(result.successesTotal);
    });

    // Each category's Successes-tab label must be its own distinct,
    // sensible description of "this check passed" - NOT a reuse of the
    // Failures-tab label (which reads as nonsense on the success side, e.g.
    // "SLA Breached - 7 Days: 12,151" shown as a success). The Failures-tab
    // label itself must stay exactly as it always was.
    it('every category has a distinct, sensible successLabel - the Failures label is unchanged', () => {
        const result = calculateCriticalFailureCategories(records);
        const byKey = (key: string) => result.categories.find((c) => c.key === key)!;

        const expected: Record<string, { label: string; successLabel: string }> = {
            incorrect_answer: { label: 'Incorrect Answers', successLabel: 'Correct Answers' },
            weather_incorrect: { label: 'Weather Q Incorrect', successLabel: 'Weather Q Correct' },
            mandi_incorrect: { label: 'Mandi Price Q Incorrect', successLabel: 'Mandi Price Q Correct' },
            scheme_incorrect: { label: 'Scheme Q Incorrect', successLabel: 'Scheme Q Correct' },
            db_failure: { label: 'Not Saved in DB', successLabel: 'Saved in DB' },
            notif_failure: { label: 'Notification Failure', successLabel: 'Notification Delivered' },
            duplicate_qid: { label: 'Duplicate Q-ID Detected', successLabel: 'Q-ID Consistent' },
            critical_bug: { label: 'Critical Severity Bugs', successLabel: 'No Critical Bugs' },
            answer_never_received: { label: 'Answer Never Received', successLabel: 'Answer Received' },
            sla_breach_2hr: { label: 'SLA Breached - 2 Hours', successLabel: 'Within SLA - 2 Hours' },
            sla_breach_24hr: { label: 'SLA Breached - 24 Hours', successLabel: 'Within SLA - 24 Hours' },
            sla_breach_7day: { label: 'SLA Breached - 7 Days', successLabel: 'Within SLA - 7 Days' },
            gdb_retrieval_failure: { label: 'GDB Retrieval Failure (API)', successLabel: 'GDB Retrieved Successfully' },
        };

        Object.entries(expected).forEach(([key, { label, successLabel }]) => {
            expect(byKey(key).label).toBe(label);
            expect(byKey(key).successLabel).toBe(successLabel);
            // No category reuses its own failure label as its success label.
            expect(byKey(key).successLabel).not.toBe(byKey(key).label);
        });

        // Every successLabel is unique across categories - no two categories
        // collide on the Successes tab.
        const successLabels = result.categories.map((c) => c.successLabel);
        expect(new Set(successLabels).size).toBe(successLabels.length);
    });

    // calculateKpis' legacy criticalBreakdown/criticalFailuresToday must
    // stay bit-identical to the original 8-category-only computation - they
    // are now DERIVED from this same category list (not re-filtered), so
    // this also guards against the two silently drifting apart.
    it('calculateKpis derives its legacy criticalBreakdown/criticalFailuresToday from these same 8 categories, unaffected by the 5 new ones', () => {
        const categories = calculateCriticalFailureCategories(records);
        const kpis = calculateKpis(records);
        expect(kpis.criticalBreakdown).toEqual({
            countIncorrect: categories.categories.find((c) => c.key === 'incorrect_answer')!.failureCount,
            countWeatherIncorrect: categories.categories.find((c) => c.key === 'weather_incorrect')!.failureCount,
            countMandiIncorrect: categories.categories.find((c) => c.key === 'mandi_incorrect')!.failureCount,
            countSchemeIncorrect: categories.categories.find((c) => c.key === 'scheme_incorrect')!.failureCount,
            countDbFailure: categories.categories.find((c) => c.key === 'db_failure')!.failureCount,
            countNotifFailure: categories.categories.find((c) => c.key === 'notif_failure')!.failureCount,
            countDuplicateFailure: categories.categories.find((c) => c.key === 'duplicate_qid')!.failureCount,
            countCriticalBugs: categories.categories.find((c) => c.key === 'critical_bug')!.failureCount,
        });
        const sumOf8 =
            kpis.criticalBreakdown.countIncorrect +
            kpis.criticalBreakdown.countWeatherIncorrect +
            kpis.criticalBreakdown.countMandiIncorrect +
            kpis.criticalBreakdown.countSchemeIncorrect +
            kpis.criticalBreakdown.countDbFailure +
            kpis.criticalBreakdown.countNotifFailure +
            kpis.criticalBreakdown.countDuplicateFailure +
            kpis.criticalBreakdown.countCriticalBugs;
        expect(kpis.criticalFailuresToday).toBe(sumOf8);
        // The new card's total is strictly larger - it includes Categories
        // 9/10 on top of the same 8.
        expect(kpis.criticalFailureCategories.failuresTotal).toBeGreaterThan(kpis.criticalFailuresToday);
    });

    // Synthetic - proves the Answer Never Received mechanics directly:
    // both signals must agree, and a disagreement lands on neither tab.
    it('Answer Never Received requires BOTH signals to agree; a disagreement is excluded from both tabs (synthetic)', () => {
        const result = calculateCriticalFailureCategories([
            { 'Time Answer Received (HH:MM:SS)': '', [RESPONSE_TIME_KEY]: '' }, // both blank - failure
            { 'Time Answer Received (HH:MM:SS)': '10:30:00 AM', [RESPONSE_TIME_KEY]: '45' }, // both present - success
            { 'Time Answer Received (HH:MM:SS)': '10:30:00 AM', [RESPONSE_TIME_KEY]: '' }, // disagree - neither
            { 'Time Answer Received (HH:MM:SS)': '', [RESPONSE_TIME_KEY]: '45' }, // disagree - neither
        ]);
        const cat = result.categories.find((c) => c.key === 'answer_never_received')!;
        expect(cat.failureCount).toBe(1);
        expect(cat.successCount).toBe(1);
    });

    // Synthetic - proves the SLA Breached thresholds are inclusive on the
    // "success" side (exactly at the boundary counts as within-SLA, not
    // breached) and non-exclusive across the 3 rows.
    it('SLA Breached: exactly-at-threshold counts as success, and a 7-day breach also counts in the 2-hour/24-hour rows (synthetic)', () => {
        const result = calculateCriticalFailureCategories([
            { [RESPONSE_TIME_KEY]: '120' }, // exactly 2hrs - success for the 2hr row
            { [RESPONSE_TIME_KEY]: '121' }, // just over 2hrs - failure for 2hr row, success for 24hr/7day rows
            { [RESPONSE_TIME_KEY]: '20000' }, // beyond all 3 thresholds - failure for all 3 rows
        ]);
        const at2hr = result.categories.find((c) => c.key === 'sla_breach_2hr')!;
        const at24hr = result.categories.find((c) => c.key === 'sla_breach_24hr')!;
        const at7day = result.categories.find((c) => c.key === 'sla_breach_7day')!;
        expect(at2hr).toMatchObject({ failureCount: 2, successCount: 1 });
        expect(at24hr).toMatchObject({ failureCount: 1, successCount: 2 });
        expect(at7day).toMatchObject({ failureCount: 1, successCount: 2 });
    });

    // Fix 1 - evaluableRows: the union of every category's failure/success
    // sets, i.e. rows with real, evaluable data in AT LEAST ONE of the 13
    // categories. A row untested everywhere (no field trips any category
    // either way) must be excluded from this union, not silently counted as
    // "passing by elimination" - Pass Rate's whole point in switching to this
    // denominator. Test IDs are required here - addCategory dedupes by
    // r['Test ID'], so ID-less rows would all collapse into a single
    // "undefined" bucket and hide the distinction this test is proving.
    // Each row also carries a real Time Answer Received + Response Time (or
    // deliberately withholds both) so it doesn't incidentally also trip
    // Category 9 (Answer Never Received), which fires on any row missing
    // BOTH - blank fields aren't automatically "no signal anywhere" the way
    // they are for every other category.
    it('evaluableRows excludes a row with no evaluable data anywhere, but counts a row evaluable in only one category (synthetic)', () => {
        const result = calculateCriticalFailureCategories([
            // Has an answer timestamp but no Response Time reading - a
            // Category 9 disagreement (neither tab), and no other field set -
            // not evaluable in any of the 13 categories.
            { 'Test ID': 'T1', 'Time Answer Received (HH:MM:SS)': '10:00:00 AM' },
            // Evaluable via incorrect_answer only (fails it); real time
            // fields keep it out of Category 9 entirely.
            {
                'Test ID': 'T2',
                'Answer Scientifically Correct?': 'Incorrect',
                'Time Answer Received (HH:MM:SS)': '10:00:00 AM',
                [RESPONSE_TIME_KEY]: '10',
            },
            // Evaluable via incorrect_answer only (succeeds it); same real
            // time fields.
            {
                'Test ID': 'T3',
                'Answer Scientifically Correct?': 'Correct',
                'Time Answer Received (HH:MM:SS)': '10:00:00 AM',
                [RESPONSE_TIME_KEY]: '10',
            },
        ]);
        expect(result.evaluableRows).toBe(2);
        expect(result.distinctFailureRows).toBe(1);
    });

    // Synthetic - proves the compound categories' Successes side requires
    // BOTH/ALL underlying fields to explicitly agree, not just "not a
    // failure" - an ambiguous value (e.g. "Duplicate", a bare "Yes" for
    // Not Saved in DB) lands on neither tab.
    it('Not Saved in DB success requires BOTH fields to say "Saved" - ambiguous values count as neither (synthetic)', () => {
        const result = calculateCriticalFailureCategories([
            { 'Question Saved in DB?': 'Saved', 'Answer Saved in DB?': 'Saved' }, // success
            { 'Question Saved in DB?': 'Not Saved', 'Answer Saved in DB?': 'Saved' }, // failure
            { 'Question Saved in DB?': 'Duplicate', 'Answer Saved in DB?': 'Saved' }, // ambiguous - neither
        ]);
        const cat = result.categories.find((c) => c.key === 'db_failure')!;
        expect(cat.failureCount).toBe(1);
        expect(cat.successCount).toBe(1);
    });

    // Synthetic - proves the GDB Retrieval Failure rule: Type of Question
    // matches GDB across casing/trailing-space variants (via
    // moduleGroupFor), the disclaimer column is read via isYes/isNo (not a
    // dedicated sheet column), a non-GDB row is excluded regardless of the
    // disclaimer value, and the duplicate-detection values that share the
    // disclaimer column count as neither yes nor no.
    it('GDB Retrieval Failure matches Type of Question = GDB (any casing/whitespace) AND the 2-hour disclaimer shown, excluding duplicate-detection values and non-GDB rows (synthetic)', () => {
        const result = calculateCriticalFailureCategories([
            { 'Type of Question': 'GDB', '120-min Msg Shown to User?': 'Yes' }, // failure
            { 'Type of Question': 'gdb', '120-min Msg Shown to User?': 'YES' }, // failure - casing variant
            { 'Type of Question': 'GDB ', '120-min Msg Shown to User?': 'yes' }, // failure - trailing space + casing
            { 'Type of Question': 'GDB', '120-min Msg Shown to User?': 'No' }, // success
            { 'Type of Question': 'GDB', '120-min Msg Shown to User?': 'Successfully Identified as Duplicate' }, // neither - overloaded column
            { 'Type of Question': 'GDB', '120-min Msg Shown to User?': '' }, // neither - blank
            { 'Type of Question': 'GDB', '120-min Msg Shown to User?': 'NA' }, // neither - NA
            { 'Type of Question': 'Unique', '120-min Msg Shown to User?': 'Yes' }, // neither - not a GDB row at all
        ]);
        expect(result.categories.find((c) => c.key === 'gdb_retrieval_failure')).toEqual({
            key: 'gdb_retrieval_failure',
            label: 'GDB Retrieval Failure (API)',
            successLabel: 'GDB Retrieved Successfully',
            failureCount: 3,
            successCount: 1,
        });
    });

    it('returns all-zero categories for an empty dataset', () => {
        const result = calculateCriticalFailureCategories([]);
        expect(result.failuresTotal).toBe(0);
        expect(result.successesTotal).toBe(0);
        expect(result.distinctFailureRows).toBe(0);
        expect(result.distinctSuccessRows).toBe(0);
        expect(result.evaluableRows).toBe(0);
        result.categories.forEach((c) => {
            expect(c.failureCount).toBe(0);
            expect(c.successCount).toBe(0);
        });
    });
});

describe('calculateVoiceSuccess on the full unfiltered dataset (real CSV)', () => {
    it('matches the real blended input+output average', () => {
        const voice = calculateVoiceSuccess(records);
        expect(voice.score).toBe(9.3);
        expect(voice.sampleSize).toBe(14632);
        expect(voice.inputCount).toBe(7015);
        expect(voice.outputCount).toBe(7617);
    });
});

describe('calculateKpis (Executive Summary + Critical Failures + Release Health) on real data', () => {
    it('matches independently-computed Executive Summary numbers', () => {
        const kpis = calculateKpis(records);
        // Re-verified fresh against the current live CSV. notificationSuccess/
        // notificationSuccessOnTimeCount reflect Fix 3 (calculateNotificationSuccess
        // now accepts "received on time"/"received late"/a bare "yes", not just
        // the exact phrase "received on time") - denominator is unchanged.
        expect(kpis.N).toBe(17872);
        expect(kpis.avgResponseMinutes).toBe(542.3);
        expect(kpis.avgResponseSampleCount).toBe(12173);
        const notifSuccess = calculateNotificationSuccess(records);
        expect(kpis.notificationSuccess).toBe(notifSuccess.pct);
        expect(kpis.notificationSuccess).toBe(84);
        expect(kpis.notificationSuccessOnTimeCount).toBe(5077);
        expect(kpis.notificationSuccessTotalCount).toBe(6022);
        expect(kpis.trustScore).toBe(94);
        expect(kpis.experienceScore).toBe(82);
    });

    // Regression test: the Executive Summary "Scientific Accuracy" tile used
    // to run its own narrower calculation (no Type-of-Question scoping,
    // "correct"-only matching) instead of reading Trust Score's A_sci, which
    // let the two disagree - 87% vs 95% on the live CSV - even though both
    // claim to measure the same thing. Asserting exact equality (via the
    // real dataset, whatever it is that day) makes that drift impossible to
    // reintroduce silently.
    it("Executive Summary's scientificAccuracyAllRows always equals Trust Score's A_sci - never a separate calculation", () => {
        const kpis = calculateKpis(records);
        const trust = calculateTrustScore(records);
        expect(kpis.scientificAccuracyAllRows).toBe(trust.breakdown.A_sci);
        expect(pct(kpis.sciCorrectCount, kpis.scientificAccuracyApplicableCount)).toBe(kpis.scientificAccuracyAllRows);
    });

    // Synthetic reproduction of the exact drift the bug caused: an
    // untagged-Type-of-Question row (never Static or Dynamic - "Quality
    // Checking" isn't a recognized type) and a plain "Yes" answer. The old
    // Executive Summary formula counted the untagged row in its denominator
    // (it had no Type-of-Question scoping at all) and rejected the "Yes" row
    // as incorrect (it only matched "correct") - both disagree with how
    // A_sci itself treats the same two rows.
    it('scientificAccuracyAllRows excludes untagged-Type rows and accepts "Yes", matching A_sci exactly (synthetic)', () => {
        const rows: TestersDashboardRecord[] = [
            { 'Type of Question': 'GDB', 'Answer Scientifically Correct?': 'Correct' },
            { 'Type of Question': 'GDB', 'Answer Scientifically Correct?': 'Yes' },
            { 'Type of Question': 'Quality Checking', 'Answer Scientifically Correct?': 'Correct' }, // untagged - excluded from both
        ];
        const kpis = calculateKpis(rows);
        const trust = calculateTrustScore(rows);
        // 2/2 = 100%: the untagged row is excluded, and "Yes" counts as correct.
        expect(trust.breakdown.A_sci).toBe(100);
        expect(kpis.scientificAccuracyAllRows).toBe(100);
        expect(kpis.sciCorrectCount).toBe(2);
        expect(kpis.scientificAccuracyApplicableCount).toBe(2);
    });

    // Pass Rate / Fail Rate v2: a row is a "failure" if it trips ANY
    // Critical Failure category (reuses
    // calculateCriticalFailureCategories().distinctFailureRows, not
    // recomputed independently), a "success" if it trips none. Denominator
    // is N (every row is classified one way or the other, unlike the old
    // Pass+Fail-only subset). Independently re-verified against a fresh CSV
    // pull - re-derive with a one-off script against
    // backend/data/testers-dashboard/updated.csv to spot-check.
    it('matches independently-computed Pass Rate / Fail Rate (Critical-Failures-based) on real data', () => {
        const N = records.length;
        expect(N).toBe(17845);

        const distinctFailureRows = calculateCriticalFailureCategories(records).distinctFailureRows;
        expect(distinctFailureRows).toBe(7485);

        const kpis = calculateKpis(records);
        expect(kpis.totalFailed).toBe(distinctFailureRows);
        expect(kpis.totalFailed).toBe(7485);
        expect(kpis.totalPassed).toBe(N - distinctFailureRows);
        expect(kpis.totalPassed).toBe(10360);
        expect(kpis.totalPassed + kpis.totalFailed).toBe(N); // no exclusions - every row lands on one side
        expect(kpis.passRate).toBe(58);
        expect(kpis.failRate).toBe(42);
        expect(kpis.passRate + kpis.failRate).toBe(100);
    });

    // Proves the definition genuinely changed, not just relabeled: Overall
    // Test Status is no longer consulted at all for Pass Rate / Fail Rate.
    it('Pass Rate / Fail Rate ignore Overall Test Status entirely - only Critical Failure categories decide (synthetic)', () => {
        const kpis = calculateKpis([
            { 'Overall Test Status': 'Fail' }, // no field trips any Critical Failure category -> counts as a Pass
            { 'Overall Test Status': 'Pass', 'Defect Severity': 'Critical' }, // Overall Test Status says Pass, but trips Critical Severity Bugs -> counts as a Fail
        ]);
        expect(kpis.totalPassed).toBe(1);
        expect(kpis.totalFailed).toBe(1);
        expect(kpis.passRate).toBe(50);
        expect(kpis.failRate).toBe(50);
    });

    // Unlike the old Overall-Test-Status rule (which excluded Partial/NA/
    // unrecognized statuses from the denominator), every row is classified
    // as either zero-failures or has-a-failure - none are excluded.
    it('every row lands on one side or the other - none excluded from the denominator (synthetic)', () => {
        const rows: TestersDashboardRecord[] = [
            {}, // completely blank row - zero failures -> Pass
            { 'Overall Test Status': 'Partial' }, // would have been excluded under the old rule - now just a Pass (no category tripped)
            { 'Answer Scientifically Correct?': 'Incorrect' }, // trips Incorrect Answers -> Fail
        ];
        const kpis = calculateKpis(rows);
        expect(kpis.N).toBe(3);
        expect(kpis.totalPassed + kpis.totalFailed).toBe(kpis.N);
        expect(kpis.totalPassed).toBe(2);
        expect(kpis.totalFailed).toBe(1);
        expect(kpis.passRate).toBe(67); // 2/3 = 66.67% -> rounds to 67
        expect(kpis.failRate).toBe(33); // derived as 100 - 67, not an independently-rounded 33.33->33 (this particular case happens to agree, but see the rounding-edge-case test below for where independent rounding would disagree)
    });

    // Constructed to hit the exact rounding edge case that independent
    // pct(passed, N) / pct(failed, N) calls could break: 1 failure out of 8
    // rows is exactly 12.5%/87.5%, and Math.round rounds .5 away from zero,
    // so two independent rounds would give 88% + 13% = 101%, not 100%.
    // Deriving failRate as the complement (100 - passRate) instead
    // guarantees exact 100% every time.
    it('Pass Rate + Fail Rate always sum to exactly 100%, even at the classic .5 rounding edge case', () => {
        const rows: TestersDashboardRecord[] = [
            { 'Defect Severity': 'Critical' }, // 1 failing row
            {}, {}, {}, {}, {}, {}, {}, // 7 passing rows (zero failures)
        ];
        const kpis = calculateKpis(rows);
        expect(kpis.totalFailed).toBe(1);
        expect(kpis.totalPassed).toBe(7);
        expect(kpis.passRate).toBe(88); // 7/8 = 87.5% rounds to 88
        expect(kpis.failRate).toBe(12); // derived as 100 - 88, not an independently-rounded 13 (1/8=12.5%->13, which would sum to 101)
        expect(kpis.passRate + kpis.failRate).toBe(100);
    });

    it('reuses each score function\'s own breakdown (Q_trn agrees, not a shared/stale variable)', () => {
        const kpis = calculateKpis(records);
        expect(kpis.trustBreakdown.Q_trn).toBe(kpis.experienceBreakdown.Q_trn);
        expect(kpis.trustBreakdown.Q_trn).toBe(98);
    });

    // The countNotifFailure fix: "no"/"NO" (238 real rows) should count as
    // a notification failure, not just the exact phrase "not received".
    it('countNotifFailure recognizes "no"/"NO", not just "not received"', () => {
        const noRows = records.filter((r) => normalize(r['Notification Received?']) === 'no');
        expect(noRows.length).toBe(238);

        const kpis = calculateKpis(records);
        expect(kpis.criticalBreakdown.countNotifFailure).toBe(950);
        expect(kpis.criticalFailuresToday).toBe(2552);

        // Confirms the delta is real: countNotifFailure over the dataset
        // with every "no"/"NO" row removed must drop below the full count.
        const withoutNoRows = records.filter((r) => normalize(r['Notification Received?']) !== 'no');
        const withoutNo = calculateKpis(withoutNoRows);
        expect(withoutNo.criticalBreakdown.countNotifFailure).toBeLessThan(kpis.criticalBreakdown.countNotifFailure);
    });

    it('matches independently-computed Critical Failures breakdown', () => {
        const kpis = calculateKpis(records);
        expect(kpis.criticalBreakdown.countCriticalBugs).toBe(121);
        expect(kpis.criticalBreakdown).toEqual({
            countIncorrect: 250,
            countWeatherIncorrect: 58,
            countMandiIncorrect: 67,
            countSchemeIncorrect: 49,
            countDbFailure: 1000,
            countNotifFailure: 950,
            countDuplicateFailure: 57,
            countCriticalBugs: 121,
        });
    });

    // Release Health v2: a 6-bucket weighted model (25/20/20/15/10/10%)
    // replacing the old Pass Rate - Critical Defect Rate - Data Integrity
    // Rate formula. Numbers below independently re-verified against a fresh
    // CSV pull immediately before writing this test - re-derive with a
    // one-off script against backend/data/testers-dashboard/updated.csv to
    // spot-check, since (like every other real-data count in this file)
    // this WILL drift as the live sheet keeps changing.
    it('matches independently-computed 6-bucket breakdown and weighted totals (real CSV)', () => {
        const kpis = calculateKpis(records);
        const { score, buckets } = kpis.releaseHealthBreakdown;
        expect(kpis.releaseHealth).toBe(score);
        expect(buckets.map((b) => b.key)).toEqual([
            'ai_response_quality',
            'functional_critical_quality',
            'data_integrity_persistence',
            'performance_sla',
            'farmer_experience_channel_quality',
            'reliability_critical_failure_health',
        ]);

        const byKey = (key: string) => buckets.find((b) => b.key === key)!;
        const metricByKey = (bucket: ReturnType<typeof byKey>, key: string) => bucket.metrics.find((m) => m.key === key)!;

        // Bucket 1 - AI & Response Quality: Trust Score reused directly.
        const bucket1 = byKey('ai_response_quality');
        expect(bucket1.weight).toBe(0.25);
        expect(metricByKey(bucket1, 'trust_score').value).toBe(kpis.trustScore);
        expect(bucket1.score).toBe(kpis.trustScore);
        expect(bucket1.score).toBe(94);

        // Bucket 2 - Functional & Critical Quality (Fix 1 + Fix 2). Pass
        // Rate's denominator is now evaluableRows (rows with real data in at
        // least one of the 13 Critical Failure categories), not N - a row
        // untested everywhere is excluded, not counted as a pass by
        // elimination. Critical Defects and Critical Severity Bugs are
        // merged into a single 50%-weighted Critical Defect Health, whose own
        // denominator now excludes rows with no interpretable Defect
        // Severity value at all (blank/undefined/unparseable), not every row.
        const bucket2 = byKey('functional_critical_quality');
        expect(bucket2.weight).toBe(0.2);
        const categories = calculateCriticalFailureCategories(records);
        const passRateNew = pct(categories.evaluableRows - categories.distinctFailureRows, categories.evaluableRows);
        expect(metricByKey(bucket2, 'pass_rate').value).toBe(passRateNew);
        const defectSeverityApplicable = records.filter((r) => normalizeDefectSeverity(r['Defect Severity']) !== '').length;
        const criticalDefectHealthNew = 100 - Math.round((kpis.criticalBreakdown.countCriticalBugs / defectSeverityApplicable) * 100);
        expect(metricByKey(bucket2, 'critical_defect_health').value).toBe(criticalDefectHealthNew);
        // Merged - no separate "Critical Severity Bug Health" line item left.
        expect(bucket2.metrics.map((m) => m.key)).toEqual(['pass_rate', 'critical_defect_health']);
        expect(metricByKey(bucket2, 'critical_defect_health').weight).toBe(0.5);
        expect(bucket2.score).toBe(Math.round(0.5 * passRateNew + 0.5 * criticalDefectHealthNew));

        // Bucket 3 - Data Integrity & Persistence (Fix 1). Each metric's
        // denominator now excludes rows with no interpretable signal instead
        // of dividing by N. Data Integrity Health's denominator is rows
        // where AT LEAST ONE of the 3 underlying fields carries a clear
        // verdict (Saved/Not Saved, or Yes/Wrongly Identified as Duplicate);
        // Not Saved in DB Health / Duplicate Record Health's denominators are
        // each category's own failureCount + successCount (rows confirmed
        // one way or the other), excluding the large ambiguous remainder.
        const bucket3 = byKey('data_integrity_persistence');
        expect(bucket3.weight).toBe(0.2);
        const isQSavedClear = (r: TestersDashboardRecord) =>
            matchesAny(r['Question Saved in DB?'], ['saved']) || matchesAny(r['Question Saved in DB?'], ['not saved']);
        const isASavedClear = (r: TestersDashboardRecord) =>
            matchesAny(r['Answer Saved in DB?'], ['saved']) || matchesAny(r['Answer Saved in DB?'], ['not saved']);
        const isQidClear = (r: TestersDashboardRecord) =>
            isYes(r['Q-ID Consistent Across Systems?']) ||
            matchesAny(r['Q-ID Consistent Across Systems?'], ['wrongly identified as duplicate']);
        const dataIntegrityApplicableRows = records.filter((r) => isQSavedClear(r) || isASavedClear(r) || isQidClear(r));
        const dataIntegrityFailuresNew = dataIntegrityApplicableRows.filter(
            (r) =>
                matchesAny(r['Question Saved in DB?'], ['not saved']) ||
                matchesAny(r['Answer Saved in DB?'], ['not saved']) ||
                matchesAny(r['Q-ID Consistent Across Systems?'], ['wrongly identified as duplicate']),
        ).length;
        const dataIntegrityHealthNew = 100 - Math.round((dataIntegrityFailuresNew / dataIntegrityApplicableRows.length) * 100);
        const dbCat = categories.categories.find((c) => c.key === 'db_failure')!;
        const notSavedInDbHealthNew = 100 - Math.round((dbCat.failureCount / (dbCat.failureCount + dbCat.successCount)) * 100);
        const dupCat = categories.categories.find((c) => c.key === 'duplicate_qid')!;
        const duplicateRecordHealthNew = 100 - Math.round((dupCat.failureCount / (dupCat.failureCount + dupCat.successCount)) * 100);
        expect(metricByKey(bucket3, 'data_integrity_health').value).toBe(dataIntegrityHealthNew);
        expect(metricByKey(bucket3, 'not_saved_in_db_health').value).toBe(notSavedInDbHealthNew);
        expect(metricByKey(bucket3, 'duplicate_record_health').value).toBe(duplicateRecordHealthNew);
        expect(bucket3.score).toBe(
            Math.round(0.5 * dataIntegrityHealthNew + 0.3 * notSavedInDbHealthNew + 0.2 * duplicateRecordHealthNew),
        );

        // Bucket 4 - Performance & SLA: 50% SLA Compliance + 30% Response
        // Time Health (NEW, 0-1440min straight line) + 20% Response Speed
        // (S_rsp).
        const bucket4 = byKey('performance_sla');
        expect(bucket4.weight).toBe(0.15);
        expect(metricByKey(bucket4, 'sla_compliance').value).toBe(kpis.slaBreakdown.withinSlaPct);
        const responseTimeHealth = Math.max(0, Math.round(100 - (kpis.avgResponseMinutes / 1440) * 100));
        expect(metricByKey(bucket4, 'response_time_health').value).toBe(responseTimeHealth);
        expect(metricByKey(bucket4, 'response_speed').value).toBe(kpis.experienceBreakdown.S_rsp);
        expect(bucket4.score).toBe(
            Math.round(0.5 * kpis.slaBreakdown.withinSlaPct + 0.3 * responseTimeHealth + 0.2 * kpis.experienceBreakdown.S_rsp),
        );

        // Bucket 5 - Farmer Experience & Channel Quality: 25% Notification
        // Success (Fix 3 - shares calculateNotificationSuccess's Received-
        // field match rule with N_exp: "received on time"/"received late",
        // or a bare "yes", not "received on time" only) + 25% Voice
        // Performance (blended score/10*100) + 20% Translation Quality +
        // 20% Channel Performance (Fix 4 - pooled total-passed/total-Pass+Fail
        // across Web App/WhatsApp/Cross-Platform, not an unweighted average
        // of the 3 channels' own pass rates) + 10% Notification Experience.
        const bucket5 = byKey('farmer_experience_channel_quality');
        expect(bucket5.weight).toBe(0.1);
        const notifSuccessNew = calculateNotificationSuccess(records);
        expect(metricByKey(bucket5, 'notification_success').value).toBe(notifSuccessNew.pct);
        // The Executive Summary tile shares the same definition, so the two never disagree.
        expect(kpis.notificationSuccess).toBe(notifSuccessNew.pct);
        const voicePerformance = Math.round((kpis.voiceSuccess.score / 10) * 100);
        expect(metricByKey(bucket5, 'voice_performance').value).toBe(voicePerformance);
        expect(metricByKey(bucket5, 'translation_quality').value).toBe(kpis.trustBreakdown.Q_trn);
        expect(metricByKey(bucket5, 'notification_experience').value).toBe(kpis.experienceBreakdown.N_exp);
        let totalChannelPassed = 0;
        let totalChannelPassPlusFail = 0;
        (['Web App', 'WhatsApp', 'Both'] as const).forEach((channel) => {
            const rows = records.filter((r) => normalizeChannel(r['Channel Tested']) === channel);
            const passed = rows.filter((r) => normalizeTestStatus(r['Overall Test Status']) === 'Pass').length;
            const failed = rows.filter((r) => normalizeTestStatus(r['Overall Test Status']) === 'Fail').length;
            totalChannelPassed += passed;
            totalChannelPassPlusFail += passed + failed;
        });
        const channelPerformanceNew = pct(totalChannelPassed, totalChannelPassPlusFail);
        expect(metricByKey(bucket5, 'channel_performance').value).toBe(channelPerformanceNew);
        expect(bucket5.score).toBe(
            Math.round(
                0.25 * notifSuccessNew.pct +
                    0.25 * voicePerformance +
                    0.2 * kpis.trustBreakdown.Q_trn +
                    0.2 * channelPerformanceNew +
                    0.1 * kpis.experienceBreakdown.N_exp,
            ),
        );

        // Bucket 6 - Reliability & Critical Failure Health: severity-weighted
        // penalty (Critical=4, High=3, Medium=2, Low=1), NOT a plain
        // 100 - failure rate. GDB Retrieval Failure is High (3) - a failed
        // retrieval means the farmer didn't get an existing stored answer
        // and had to wait, worse than a merely slow answer (Low) but less
        // severe than never receiving one or losing data (Critical).
        const bucket6 = byKey('reliability_critical_failure_health');
        expect(bucket6.weight).toBe(0.1);
        const failureCount = (key: string) => categories.categories.find((c) => c.key === key)!.failureCount;
        const weightedPenalty =
            4 * (failureCount('answer_never_received') + failureCount('db_failure') + failureCount('critical_bug')) +
            3 *
                (failureCount('incorrect_answer') +
                    failureCount('sla_breach_7day') +
                    failureCount('duplicate_qid') +
                    failureCount('gdb_retrieval_failure')) +
            2 *
                (failureCount('weather_incorrect') +
                    failureCount('mandi_incorrect') +
                    failureCount('scheme_incorrect') +
                    failureCount('sla_breach_24hr')) +
            1 * (failureCount('sla_breach_2hr') + failureCount('notif_failure'));
        const reliabilityHealth = Math.max(0, Math.round(100 - (weightedPenalty / (kpis.N * 4)) * 100));
        expect(metricByKey(bucket6, 'reliability_health').value).toBe(reliabilityHealth);
        expect(bucket6.score).toBe(reliabilityHealth);

        // Top-level weighted sum, then the final score.
        const expectedScore = Math.round(
            0.25 * bucket1.score + 0.2 * bucket2.score + 0.2 * bucket3.score + 0.15 * bucket4.score + 0.1 * bucket5.score + 0.1 * bucket6.score,
        );
        expect(score).toBe(expectedScore);
        expect(score).toBe(82);
        // 82 < 90 -> NO_GO. See releaseHealthDecision's own comment for why
        // this is score-only (mandatory release gates aren't evaluated yet).
        expect(kpis.releaseHealthBreakdown.decision).toBe('NO_GO');
    });

    it('clamps releaseHealth to [0, 100] and returns 0 (not a false-positive high score from empty-denominator defaults) for an empty dataset', () => {
        const kpis = calculateKpis([]);
        expect(kpis.releaseHealth).toBe(0);
        expect(kpis.N).toBe(0);
        expect(kpis.releaseHealthBreakdown.decision).toBe('NO_GO');
        kpis.releaseHealthBreakdown.buckets.forEach((b) => {
            expect(b.score).toBe(0);
            b.metrics.forEach((m) => expect(m.value).toBe(0));
        });
    });

    describe('calculateReleaseHealth (synthetic)', () => {
        // Response Time Health: a straight 0-1440min line, distinct from
        // S_rsp's 0-120min scale - proves the two don't share a formula.
        it('Response Time Health follows a straight 0-1440min line, floored at 0 beyond it, and does not default high with zero valid readings', () => {
            const at0 = calculateReleaseHealth([{ [RESPONSE_TIME_KEY]: '0' }]);
            expect(at0.buckets.find((b) => b.key === 'performance_sla')!.metrics.find((m) => m.key === 'response_time_health')!.value).toBe(100);

            const atMidpoint = calculateReleaseHealth([{ [RESPONSE_TIME_KEY]: '720' }]); // 12hrs -> 50
            expect(
                atMidpoint.buckets.find((b) => b.key === 'performance_sla')!.metrics.find((m) => m.key === 'response_time_health')!.value,
            ).toBe(50);

            const atLimit = calculateReleaseHealth([{ [RESPONSE_TIME_KEY]: '1440' }]);
            expect(atLimit.buckets.find((b) => b.key === 'performance_sla')!.metrics.find((m) => m.key === 'response_time_health')!.value).toBe(
                0,
            );

            const beyondLimit = calculateReleaseHealth([{ [RESPONSE_TIME_KEY]: '5000' }]);
            expect(
                beyondLimit.buckets.find((b) => b.key === 'performance_sla')!.metrics.find((m) => m.key === 'response_time_health')!.value,
            ).toBe(0);

            const noReadings = calculateReleaseHealth([{ 'Overall Test Status': 'Pass' }]);
            expect(
                noReadings.buckets.find((b) => b.key === 'performance_sla')!.metrics.find((m) => m.key === 'response_time_health')!.value,
            ).toBe(0);
        });

        // Reliability & Critical Failure Health: proves the severity
        // weighting directly, isolated from the real dataset's noise - a
        // single Critical-tier failure (4pts) costs 4x as much as a single
        // Low-tier one (1pt) against the same N*4 max.
        it('weights failures by severity (Critical=4x, High=3x, Medium=2x, Low=1x a Low-tier failure), not a plain 100 - failure rate', () => {
            // A real Time Answer Received + Response Time on every row here
            // keeps the "Answer Never Received" category (itself Critical,
            // 4pts) from also firing on these otherwise-blank synthetic
            // rows, which would confound the single-category assertions below.
            const clean = { 'Time Answer Received (HH:MM:SS)': '10:00:00 AM', [RESPONSE_TIME_KEY]: '45' };

            // 1 row, Critical Severity Bug -> weightedPenalty=4, max=1*4=4 -> health=0.
            const critical = calculateReleaseHealth([{ ...clean, 'Defect Severity': 'Critical' }]);
            expect(
                critical.buckets.find((b) => b.key === 'reliability_critical_failure_health')!.metrics[0].value,
            ).toBe(0);

            // 1 row, Notification Failure (Low, 1pt) -> max=4 -> health=100-25=75.
            const low = calculateReleaseHealth([{ ...clean, 'Notification Received?': 'Not Received' }]);
            expect(low.buckets.find((b) => b.key === 'reliability_critical_failure_health')!.metrics[0].value).toBe(75);

            // A row with no recognized failure signal at all -> weightedPenalty=0 -> health=100.
            const passing = calculateReleaseHealth([{ ...clean, 'Overall Test Status': 'Pass' }]);
            expect(passing.buckets.find((b) => b.key === 'reliability_critical_failure_health')!.metrics[0].value).toBe(100);
        });

        // Channel Performance: averages only channels with real Pass+Fail
        // data - a channel absent from the filtered rows entirely must be
        // skipped from the average, not counted as a 0.
        it('Channel Performance averages only channels with real Pass+Fail data, skipping an absent channel rather than counting it as 0', () => {
            const rows: TestersDashboardRecord[] = [
                { 'Channel Tested': 'Web App', 'Overall Test Status': 'Pass' }, // Web App: 100%
                { 'Channel Tested': 'WhatsApp', 'Overall Test Status': 'Fail' }, // WhatsApp: 0%
                // "Both" (Cross-Platform) has zero rows - must be skipped, not averaged in as 0.
            ];
            const result = calculateReleaseHealth(rows);
            const channelPerformance = result.buckets
                .find((b) => b.key === 'farmer_experience_channel_quality')!
                .metrics.find((m) => m.key === 'channel_performance')!.value;
            // If "Both" counted as 0: (100+0+0)/3 = 33. Skipped: (100+0)/2 = 50.
            expect(channelPerformance).toBe(50);
        });

        // GO / GO WITH CONDITIONS / NO-GO decision: score-only thresholds
        // (95/90) - see releaseHealthDecision's own comment for why the
        // mandatory-gates half of the rule isn't evaluated here. Covers both
        // boundaries (94/95 and 89/90) on both sides, plus the extremes.
        it('releaseHealthDecision draws the line at exactly 95 (GO) and exactly 90 (GO_WITH_CONDITIONS), never above/below by one point', () => {
            expect(releaseHealthDecision(100)).toBe('GO');
            expect(releaseHealthDecision(95)).toBe('GO'); // boundary - >=95 is GO
            expect(releaseHealthDecision(94)).toBe('GO_WITH_CONDITIONS'); // one point below the GO boundary
            expect(releaseHealthDecision(90)).toBe('GO_WITH_CONDITIONS'); // boundary - >=90 is GO_WITH_CONDITIONS
            expect(releaseHealthDecision(89)).toBe('NO_GO'); // one point below the GO_WITH_CONDITIONS boundary
            expect(releaseHealthDecision(0)).toBe('NO_GO');
        });

        // calculateReleaseHealth must wire its own score through
        // releaseHealthDecision unchanged, not recompute the thresholds
        // separately (which could drift out of sync).
        it('calculateReleaseHealth.decision always matches releaseHealthDecision(score) exactly, on both real and empty data', () => {
            const real = calculateReleaseHealth(records);
            expect(real.decision).toBe(releaseHealthDecision(real.score));

            const empty = calculateReleaseHealth([]);
            expect(empty.score).toBe(0);
            expect(empty.decision).toBe('NO_GO');
        });
    });

    // SLA Compliance card - built on the confirmed decision to trust
    // "SLA Status" as marked by testers, not a fresh Response-Time
    // recomputation. Numbers independently re-derived via a from-scratch
    // loop (calling normalizeSlaStatus/timeToMinutes directly, NOT
    // calculateKpis) against this exact same live CSV immediately before
    // writing this test - re-derive with a one-off script against
    // backend/data/testers-dashboard/updated.csv to spot-check, since (like
    // every other real-data count in this file) this WILL drift as the
    // live sheet keeps changing.
    it('matches an independently-computed SLA Compliance breakdown', () => {
        const kpis = calculateKpis(records);

        let valid = 0;
        let within = 0;
        let breached = 0;
        let breachedWithTime = 0;
        let delaySum = 0;
        for (const r of records) {
            const s = normalizeSlaStatus(r['SLA Status']);
            if (s === null) continue;
            valid++;
            if (s === 'Within SLA') within++;
            if (s === 'SLA Breached') {
                breached++;
                const mins = timeToMinutes(r['Response Time (mins) [Auto] (HH:MM:SS)']);
                if (mins !== null) {
                    breachedWithTime++;
                    delaySum += Math.max(0, mins - 120);
                }
            }
        }
        const independentAvgDelay = breachedWithTime ? Math.round((delaySum / breachedWithTime) * 10) / 10 : 0;

        expect(kpis.slaBreakdown.validRows).toBe(valid);
        expect(kpis.slaBreakdown.withinSlaCount).toBe(within);
        expect(kpis.slaBreakdown.breachedCount).toBe(breached);
        expect(kpis.slaBreakdown.breachedWithoutTimeCount).toBe(breached - breachedWithTime);
        expect(kpis.slaBreakdown.avgDelayMinutes).toBe(independentAvgDelay);

        // Pinned real values, so a future drift is visible as a diff, not
        // just a passing-by-construction cross-check against itself.
        expect(kpis.slaBreakdown.validRows).toBe(13090);
        expect(kpis.slaBreakdown.withinSlaCount).toBe(8654);
        expect(kpis.slaBreakdown.withinSlaPct).toBe(66);
        expect(kpis.slaBreakdown.exceededSlaPct).toBe(34);
        expect(kpis.slaBreakdown.withinSlaPct + kpis.slaBreakdown.exceededSlaPct).toBe(100);
        expect(kpis.slaBreakdown.breachedCount).toBe(4436);
        expect(kpis.slaBreakdown.breachedWithoutTimeCount).toBe(1621);
        expect(kpis.slaBreakdown.avgDelayMinutes).toBe(1992.1);
    });

    // blank/NA/"Not Applicable"/garbage rows must never be silently counted
    // as breached - only a real "SLA Breached" verdict should ever move
    // exceededSlaPct. Synthetic rows since asserting this against real data
    // alone wouldn't distinguish "correctly excluded" from "coincidentally
    // absent."
    it('excludes blank/NA/Not Applicable/garbage SLA Status rows from the denominator entirely', () => {
        const rows: TestersDashboardRecord[] = [
            { 'SLA Status': 'Within SLA' },
            { 'SLA Status': 'SLA Breached' },
            { 'SLA Status': '' },
            { 'SLA Status': 'NA' },
            { 'SLA Status': 'Not Applicable' },
            { 'SLA Status': '\\' },
        ];
        const kpis = calculateKpis(rows);
        expect(kpis.slaBreakdown.validRows).toBe(2);
        expect(kpis.slaBreakdown.withinSlaCount).toBe(1);
        expect(kpis.slaBreakdown.withinSlaPct).toBe(50);
        expect(kpis.slaBreakdown.exceededSlaPct).toBe(50);
    });

    it('returns 0% exceeded (not 100%) when there are zero valid SLA Status rows, not a false "all breached" reading', () => {
        const kpis = calculateKpis([{ 'SLA Status': 'NA' }, { 'SLA Status': '' }]);
        expect(kpis.slaBreakdown.validRows).toBe(0);
        expect(kpis.slaBreakdown.withinSlaPct).toBe(0);
        expect(kpis.slaBreakdown.exceededSlaPct).toBe(0);
    });

    it('avgDelayMinutes only counts breached rows with a parseable Response Time, and reports the excluded count separately', () => {
        const rows: TestersDashboardRecord[] = [
            { 'SLA Status': 'SLA Breached', 'Response Time (mins) [Auto] (HH:MM:SS)': '150' }, // delay 30
            { 'SLA Status': 'SLA Breached', 'Response Time (mins) [Auto] (HH:MM:SS)': '200' }, // delay 80
            { 'SLA Status': 'SLA Breached', 'Response Time (mins) [Auto] (HH:MM:SS)': 'NA' }, // no usable reading
            { 'SLA Status': 'SLA Breached', 'Response Time (mins) [Auto] (HH:MM:SS)': '' }, // no usable reading
            { 'SLA Status': 'Within SLA', 'Response Time (mins) [Auto] (HH:MM:SS)': '5' },
        ];
        const kpis = calculateKpis(rows);
        expect(kpis.slaBreakdown.breachedCount).toBe(4);
        expect(kpis.slaBreakdown.breachedWithoutTimeCount).toBe(2);
        // (30 + 80) / 2 = 55
        expect(kpis.slaBreakdown.avgDelayMinutes).toBe(55);
    });

    // A response logged UNDER the 120-min limit but still marked "SLA
    // Breached" (e.g. a different real-world SLA condition testers apply
    // that isn't purely response-time-based) must not produce a negative
    // delay - Math.max(0, ...) floors it.
    it('floors delay at 0 for a breached row whose logged Response Time is under 120 min', () => {
        const kpis = calculateKpis([{ 'SLA Status': 'SLA Breached', 'Response Time (mins) [Auto] (HH:MM:SS)': '50' }]);
        expect(kpis.slaBreakdown.avgDelayMinutes).toBe(0);
    });
});

describe('calculatePreviousPeriodStats against a real 7-day window', () => {
    // Matches Phase 2's already-verified previous-7days window:
    // [2026-07-29, 2026-08-04], 1097 real rows.
    const NOW = new Date('2026-08-11T12:00:00.000Z');

    it('returns null when there is no well-defined previous period', () => {
        expect(calculatePreviousPeriodStats(records, EMPTY_FILTERS, false, undefined, undefined, NOW)).toBeNull();
    });

    it('computes the full KPI subset over the real previous-7days rows', () => {
        const stats = calculatePreviousPeriodStats(
            records,
            { ...EMPTY_FILTERS, dateRange: '7days' },
            false,
            undefined,
            undefined,
            NOW,
        );
        expect(stats).not.toBeNull();
        expect(stats).toEqual({
            totalTests: 1098,
            passRate: 54,
            failRate: 46,
            avgResponseMinutes: 532.3,
            scientificAccuracy: 94,
            openCriticalDefects: 19,
            countCriticalBugs: 14,
            // Fix 3: shares calculateNotificationSuccess's wider Received-field
            // match with the current-period tile, so the trend arrow compares
            // like-for-like.
            notificationSuccess: 92,
            voiceSuccess: 8.3,
            rangeLabel: '2026-07-29 to 2026-08-04',
        });
    });

    // openCriticalDefects here is Critical+High severity - a wider scope
    // than PreviousPeriodStats.countCriticalBugs (added alongside the "All
    // Critical Defects" summary card's switch to Critical-only, so its
    // trend arrow can compare like-for-like against its now-Critical-only
    // headline number instead of this wider field). Both are real,
    // deliberately different metrics, not a copy-paste mismatch: over this
    // same real window, Critical-only is 14 rows vs 19 for Critical+High.
    it('openCriticalDefects counts Critical AND High, unlike countCriticalBugs (Critical only)', () => {
        const stats = calculatePreviousPeriodStats(
            records,
            { ...EMPTY_FILTERS, dateRange: '7days' },
            false,
            undefined,
            undefined,
            NOW,
        )!;
        const criticalOnlyOverSameWindow = getPreviousPeriodRows(
            records,
            { ...EMPTY_FILTERS, dateRange: '7days' },
            false,
            undefined,
            undefined,
            NOW,
        )!.filter((r) => normalizeDefectSeverity(r['Defect Severity']) === 'Critical').length;

        expect(criticalOnlyOverSameWindow).toBe(14);
        // stats.countCriticalBugs must independently agree with this
        // freshly-recomputed count, not just happen to also be 14 - proves
        // calculatePreviousPeriodStats' own field is wired to the same
        // 'Critical'-only definition, not copy-pasted from a different one.
        expect(stats.countCriticalBugs).toBe(criticalOnlyOverSameWindow);
        expect(stats.openCriticalDefects).toBe(19);
        expect(stats.openCriticalDefects).toBeGreaterThan(criticalOnlyOverSameWindow);
    });
});

describe('periodDelta', () => {
    it('returns null when both current and previous are zero', () => {
        expect(periodDelta(0, 0)).toBeNull();
    });
    it('returns "New" when previous is zero but current is not', () => {
        expect(periodDelta(5, 0)).toEqual({ text: 'New', className: 'text-muted-foreground' });
    });
    it('returns "No change" when there is no percentage change', () => {
        expect(periodDelta(50, 50)).toEqual({ text: '→ No change', className: 'text-muted-foreground' });
    });
    it('computes an upward delta', () => {
        const delta = periodDelta(60, 50);
        expect(delta).toEqual({ text: '↑ 20% vs previous period', className: 'text-emerald-600' });
    });
    it('computes a downward delta', () => {
        const delta = periodDelta(40, 50);
        expect(delta).toEqual({ text: '↓ 20% vs previous period', className: 'text-red-500' });
    });
});
