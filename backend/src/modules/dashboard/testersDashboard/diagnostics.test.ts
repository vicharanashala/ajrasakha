import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import csv from 'csv-parser';
import type { TestersDashboardRecord } from '../interfaces/ITestersDashboardService.js';
import { normalizeDefectSeverity, isNAlike, matchesAny, normalizeTestStatus, normalizeSlaStatus } from './normalize.js';
import {
    TAT_STAGES,
    moduleGroupFor,
    dynamicSubBucketFor,
    MIN_ROWS_FOR_WEAKEST_MODULE,
    MODULE_PERFORMANCE_BUCKETS,
    buildModulePerformanceEntry,
    calculateDiagnostics,
} from './diagnostics.js';

// Same loader as filters.test.ts/kpis.test.ts - real live CSV, parsed the
// same way TestersDashboardService.parseCSV does. Pulled FRESH at test run
// time (not a cached snapshot) - this session has repeatedly confirmed the
// live sheet keeps changing between sessions (the 302-vs-316 defect-count
// drift, the *_DYNAMIC row-count drift, the Joydeep-total drift), so every
// number asserted below was independently computed against this exact same
// file immediately before writing these assertions, not carried over from
// an earlier phase's snapshot.
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

describe('moduleGroupFor', () => {
    it('buckets GDB/GDP variants as GDB', () => {
        expect(moduleGroupFor('GDB')).toBe('GDB');
        expect(moduleGroupFor('gdb')).toBe('GDB');
        expect(moduleGroupFor('GDP')).toBe('GDB');
    });

    it('buckets plain Dynamic/Dynmic as Dynamic', () => {
        expect(moduleGroupFor('Dynamic')).toBe('Dynamic');
        expect(moduleGroupFor('Dynmic')).toBe('Dynamic');
    });

    // The fix landed earlier this session: an exact `=== "Dynamic"` check
    // was silently excluding ~550 real Test Log 2.0 rows from Weakest
    // Module. This must still bucket the Weather/Mandi/Scheme compound
    // variants as Dynamic (their subtypes are Dynamic's own sub-breakdown,
    // see dynamicSubBucketFor below).
    it('buckets Test Log 2.0 compound Dynamic variants as Dynamic (the *_DYNAMIC fix)', () => {
        expect(moduleGroupFor('WEATHER DYNAMIC')).toBe('Dynamic');
        expect(moduleGroupFor('MANDI DYNAMIC')).toBe('Dynamic');
        expect(moduleGroupFor('SCHEME DYNAMIC')).toBe('Dynamic');
    });

    // Static Dynamic was briefly its own top-level module (an earlier
    // confirmation from Hemanth), but he later explicitly reversed that:
    // "You can remove static dynamic category." It must now return null -
    // same as any other unrecognized value - and specifically must NOT fall
    // into the general "contains dynamic" match either, even though the
    // string "static dynamic" does contain "dynamic" as a substring; that
    // exclusion check has to run first, before the general match, for
    // exactly this reason.
    it('excludes Static Dynamic entirely - returns null, not its own bucket and not absorbed into Dynamic', () => {
        expect(moduleGroupFor('STATIC DYNAMIC')).toBeNull();
        expect(moduleGroupFor('Static Dynamic')).toBeNull();
        expect(moduleGroupFor('static dynamic')).toBeNull();
    });

    it('buckets Unique/Uniuqe as Unique Questions and Outreach as Outreach', () => {
        expect(moduleGroupFor('Unique')).toBe('Unique Questions');
        expect(moduleGroupFor('Uniuqe')).toBe('Unique Questions');
        expect(moduleGroupFor('Outreach')).toBe('Outreach');
    });

    it('returns null for unmapped values (Quality Checking, blank, leaked garbage)', () => {
        expect(moduleGroupFor('Quality Checking')).toBeNull();
        expect(moduleGroupFor('')).toBeNull();
        expect(moduleGroupFor('Ithagani Shireesha')).toBeNull();
    });
});

describe('dynamicSubBucketFor', () => {
    it('resolves from Question Category first (Sheet 1.0 signal)', () => {
        expect(dynamicSubBucketFor('Climate, Weather and Stress Management', undefined)).toBe('Weather');
        expect(dynamicSubBucketFor('Market Prices, MSP and Marketing', undefined)).toBe('Mandi Prices');
        expect(dynamicSubBucketFor('Agricultural Schemes and Subsidies', undefined)).toBe('Government Schemes');
    });

    it('falls back to Type of Question when Category does not resolve (Test Log 2.0 fix)', () => {
        expect(dynamicSubBucketFor('', 'WEATHER DYNAMIC')).toBe('Weather');
        expect(dynamicSubBucketFor(undefined, 'MANDI DYNAMIC')).toBe('Mandi Prices');
        expect(dynamicSubBucketFor('', 'SCHEME DYNAMIC')).toBe('Government Schemes');
    });

    // Static Dynamic used to be a 4th dynamicSubBucketFor bucket (replacing
    // the old "Soil Testing", which never had any real identifying field in
    // the data), then was briefly promoted to its own top-level module
    // instead (see moduleGroupFor) - and per Hemanth's final confirmation
    // ("You can remove static dynamic category") it's now excluded from the
    // Weakest Modules system entirely, at every level. Either way, this
    // function itself was never the one resolving it (moduleGroupFor routes
    // it away before dynamicSubBucketFor is ever called), so this
    // function's own behavior/assertions are unchanged by that reversal -
    // still confirming it correctly resolves to nothing.
    it('does not resolve Static Dynamic to any sub-bucket', () => {
        expect(dynamicSubBucketFor('', 'STATIC DYNAMIC')).toBeNull();
        expect(dynamicSubBucketFor(undefined, 'Static Dynamic')).toBeNull();
        expect(dynamicSubBucketFor('Some Unrelated Category', 'STATIC DYNAMIC')).toBeNull();
    });

    it('prefers Category over Type of Question when both would resolve differently', () => {
        // Category should win - it's checked first and only falls through
        // to Type of Question when Category itself is empty/unresolved.
        expect(dynamicSubBucketFor('Market Prices, MSP and Marketing', 'WEATHER DYNAMIC')).toBe('Mandi Prices');
    });

    it('returns null when neither field resolves', () => {
        expect(dynamicSubBucketFor('Some Unrelated Category', 'Some Unrelated Type')).toBeNull();
        expect(dynamicSubBucketFor(undefined, undefined)).toBeNull();
    });
});

describe('calculateDiagnostics against the real live CSV (fresh pull)', () => {
    // Overall Module Performance replaces the old single-metric Weakest
    // Module logic with 6 first-class buckets - GDB/Unique Questions/
    // Outreach as before, but Dynamic is no longer one of them: it's split
    // immediately into its 3 sub-types (Weather/Mandi Prices/Government
    // Schemes), which now compete directly instead of being blended into
    // one "Dynamic" number or nested under a separate sub-breakdown.
    // Independently verified via a fresh CSV pull immediately before
    // writing this test - re-derive with a one-off script against
    // backend/data/testers-dashboard/updated.csv to spot-check, since this
    // WILL drift as the live sheet keeps changing.
    it('modulePerformance bucket counts match a fresh independent computation, with Static Dynamic and unresolved rows absent from every bucket', () => {
        const result = calculateDiagnostics(records);
        expect(records.length).toBe(14911);

        const byBucket = Object.fromEntries(result.modulePerformance.map((m) => [m.bucket, m.totalRows]));
        expect(byBucket['GDB']).toBe(3817);
        expect(byBucket['Unique Questions']).toBe(4192);
        expect(byBucket['Outreach']).toBe(2084);
        expect(byBucket['Dynamic - Weather']).toBe(1524);
        expect(byBucket['Dynamic - Mandi Prices']).toBe(570);
        expect(byBucket['Dynamic - Government Schemes']).toBe(546);

        // Exactly these 6 buckets, no more, no less - Static Dynamic (its
        // own top-level module briefly, then explicitly removed per
        // Hemanth: "You can remove static dynamic category") and Dynamic
        // rows dynamicSubBucketFor can't resolve a sub-type for both fall
        // through unbucketed entirely, not into a phantom 7th bucket.
        expect(result.modulePerformance.map((m) => m.bucket).sort()).toEqual([...MODULE_PERFORMANCE_BUCKETS].sort());
        expect(result.modulePerformance.length).toBe(6);

        // modulePerformance is in the fixed MODULE_PERFORMANCE_BUCKETS
        // grouping order (GDB, Unique Questions, Outreach, then Dynamic's 3
        // sub-types together) - NOT sorted by score, per Hemanth's
        // confirmation that score-sorting scattered Dynamic's sub-types
        // apart and made the list hard to scan.
        expect(result.modulePerformance.map((m) => m.bucket)).toEqual(MODULE_PERFORMANCE_BUCKETS);

        // Bucketed + unmatched must equal the total row count - proves rows
        // are neither double-bucketed nor silently dropped.
        const bucketed = result.modulePerformance.reduce((sum, m) => sum + m.totalRows, 0);
        const unmatchedByModuleGroup = records.filter((r) => moduleGroupFor(r['Type of Question']) === null).length;
        const dynamicRows = records.filter((r) => moduleGroupFor(r['Type of Question']) === 'Dynamic');
        const unmatchedDynamicSubType = dynamicRows.filter(
            (r) => dynamicSubBucketFor(r['Question Category'], r['Type of Question']) === null,
        ).length;
        expect(bucketed + unmatchedByModuleGroup + unmatchedDynamicSubType).toBe(records.length);
    });

    // modulePerformance's display order is fixed grouping order
    // (GDB/Unique Questions/Outreach/Dynamic's 3 sub-types), never
    // score-sorted - synthetic fixture where Outreach (3rd in the fixed
    // order) is deliberately the worst-scoring bucket, to prove
    // weakestModule still finds it correctly without the array itself
    // moving it to the front.
    it('modulePerformance stays in fixed grouping order even when the weakest bucket is NOT first (synthetic)', () => {
        const goodRows = (type: string, count: number): TestersDashboardRecord[] =>
            Array.from({ length: count }, () => ({ 'Type of Question': type, 'Overall Test Status': 'Pass' }));
        const badOutreachRows: TestersDashboardRecord[] = Array.from({ length: 12 }, () => ({
            'Type of Question': 'Outreach',
            'Overall Test Status': 'Fail',
            'Defect Severity': 'Critical',
        }));
        const rows = [...goodRows('GDB', 12), ...goodRows('Unique', 12), ...badOutreachRows, ...goodRows('Dynamic', 12)];
        const result = calculateDiagnostics(rows);

        // Fixed order preserved regardless of scores.
        expect(result.modulePerformance.map((m) => m.bucket)).toEqual(MODULE_PERFORMANCE_BUCKETS);
        // Outreach (index 2) correctly identified as weakest even though
        // it's neither first in the array nor first among the buckets that
        // actually have any rows.
        expect(result.weakestModule).toBe('Outreach');
        const outreachEntry = result.modulePerformance.find((m) => m.bucket === 'Outreach')!;
        expect(outreachEntry.overallScore).toBeLessThan(50);
        result.modulePerformance
            .filter((m) => m.bucket !== 'Outreach' && m.eligible && m.overallScore !== null)
            .forEach((m) => expect(m.overallScore).toBeGreaterThan(outreachEntry.overallScore!));
    });

    // The Overall Module Score / weakest-bucket ranking this backend now
    // computes must match today's separately-validated prototype
    // investigation (Mandi Prices weakest, driven by Notification
    // Experience and Scientific Accuracy being its two lowest sub-metrics)
    // - confirms the wired-in implementation didn't silently diverge from
    // what was validated for Hemanth. The exact overallScore/row count
    // below WILL drift as the live sheet keeps syncing (confirmed directly:
    // it moved from 567 rows/81.6% to 570 rows/81.8% between this file's
    // first draft and this re-pin, a few minutes apart) - re-derive with a
    // one-off script against backend/data/testers-dashboard/updated.csv to
    // spot-check if this starts failing again.
    it('weakestModule matches the validated prototype finding: Dynamic - Mandi Prices, mainly Notification Experience + Scientific Accuracy', () => {
        const result = calculateDiagnostics(records);
        expect(result.weakestModule).toBe('Dynamic - Mandi Prices');
        expect(result.weakestModuleScore).toBe(81.8);
        expect(result.weakestModuleRowCount).toBe(570);
        expect(result.weakestModuleReason).toEqual(['Notification Experience', 'Scientific Accuracy']);

        const mandiEntry = result.modulePerformance.find((m) => m.bucket === 'Dynamic - Mandi Prices')!;
        expect(mandiEntry.overallScore).toBe(81.8);
        expect(mandiEntry.metricsUsedCount).toBe(8); // all 8 metrics applicable, including Domain Accuracy
        expect(mandiEntry.notificationExperience).toEqual({ value: 63, applicable: 24 });
        expect(mandiEntry.scientificAccuracy).toEqual({ value: 65, applicable: 248 });

        // weakestModule is independent of modulePerformance's array order -
        // Mandi Prices sits at index 4 (5th) in the fixed grouping order,
        // NOT first, yet must still be correctly identified as weakest.
        // Every other eligible bucket's score must be at or above it.
        expect(result.modulePerformance.findIndex((m) => m.bucket === 'Dynamic - Mandi Prices')).toBe(4);
        result.modulePerformance.forEach((m) => {
            if (m.bucket !== 'Dynamic - Mandi Prices' && m.eligible && m.overallScore !== null) {
                expect(m.overallScore).toBeGreaterThanOrEqual(81.8);
            }
        });
    });

    // Independent cross-check (not calling buildModulePerformanceEntry) of
    // 3 of the 8 sub-metrics for the weakest bucket, proving
    // buildModulePerformanceEntry's own NA-exclusion behavior against real
    // data, not just synthetic fixtures.
    it('independently recomputes Mandi Prices\' Pass Rate, SLA Compliance, and Domain Accuracy from raw records', () => {
        const dynamicRows = records.filter((r) => moduleGroupFor(r['Type of Question']) === 'Dynamic');
        const mandiRows = dynamicRows.filter(
            (r) => dynamicSubBucketFor(r['Question Category'], r['Type of Question']) === 'Mandi Prices',
        );
        expect(mandiRows.length).toBe(570);

        const passed = mandiRows.filter((r) => normalizeTestStatus(r['Overall Test Status']) === 'Pass').length;
        const failed = mandiRows.filter((r) => normalizeTestStatus(r['Overall Test Status']) === 'Fail').length;
        const passRate = Math.round((passed / (passed + failed)) * 100);

        const validSla = mandiRows.filter((r) => normalizeSlaStatus(r['SLA Status']) !== null);
        const withinSla = validSla.filter((r) => normalizeSlaStatus(r['SLA Status']) === 'Within SLA').length;
        const slaPct = Math.round((withinSla / validSla.length) * 100);

        const domainApplicable = mandiRows.filter((r) => !isNAlike(r['Mandi Price Q Correct?']));
        const domainYes = domainApplicable.filter((r) => matchesAny(r['Mandi Price Q Correct?'], ['yes', 'y'])).length;
        const domainPct = Math.round((domainYes / domainApplicable.length) * 100);

        const entry = buildModulePerformanceEntry('Dynamic - Mandi Prices', mandiRows);
        expect(entry.passRate).toEqual({ value: passRate, applicable: passed + failed });
        expect(entry.slaCompliance).toEqual({ value: slaPct, applicable: validSla.length });
        expect(entry.domainAccuracy).toEqual({ value: domainPct, applicable: domainApplicable.length });
    });

    // Critical+High (this diagnostic) is a deliberately WIDER scope than
    // kpis.ts's countCriticalBugs (Critical only) - same distinction
    // already documented in kpis.ts's calculatePreviousPeriodStats. Both
    // scopes are still genuinely needed: criticalDefectCount stays
    // Critical+High here because the frontend's separate "Critical Defect
    // Tickets" card (diagnostics.openTickets) is intentionally that wider
    // scope too - its own empty state literally reads "No active
    // critical/high defects." Only the "All Critical Defects" SUMMARY
    // card's headline number moved to Critical-only
    // (kpis.criticalBreakdown.countCriticalBugs), matching Release
    // Health's Critical Defects count - this diagnostics.ts field itself
    // was deliberately left unchanged, per that card's audit.
    //
    // criticalOnly is computed via normalizeDefectSeverity (not a hand-
    // rolled CRITICAL/CRTICAL check) so it exercises the exact same
    // definition kpis.ts's countCriticalBugs uses, including the
    // "Extreme" -> "Critical" merge - a plain CRITICAL/CRTICAL check would
    // undercount by however many EXTREME rows exist (1, in this dataset),
    // silently drifting from what countCriticalBugs actually returns.
    it('criticalDefectCount is Critical+High, a wider scope than kpis.ts countCriticalBugs (Critical only)', () => {
        const result = calculateDiagnostics(records);
        const criticalOnly = records.filter((r) => normalizeDefectSeverity(r['Defect Severity']) === 'Critical').length;
        expect(criticalOnly).toBe(120); // matches kpis.test.ts's countCriticalBugs
        expect(result.criticalDefectCount).toBe(382);
        expect(result.criticalDefectCount).toBeGreaterThan(criticalOnly);
    });

    it('openTickets deduplicates by URL and only includes rows with a valid http link', () => {
        const result = calculateDiagnostics(records);
        expect(result.openTickets.length).toBe(17);
        const urls = result.openTickets.map((t) => t.url);
        expect(new Set(urls).size).toBe(urls.length); // no duplicate URLs
        for (const ticket of result.openTickets) {
            expect(ticket.url.toLowerCase().startsWith('http')).toBe(true);
            expect(['Critical', 'High']).toContain(ticket.severity);
        }
    });

    it('Biggest Bottleneck stage averages match a fresh independent computation (2 stages spot-checked)', () => {
        const result = calculateDiagnostics(records);
        const byName = Object.fromEntries(result.stageStats.map((s) => [s.name, s.avg]));
        // Independently recomputed via a completely separate manual loop
        // (not calling timeToMinutes) immediately before writing this test.
        expect(byName['Review 1']).toBeCloseTo(5.2106, 3);
        expect(byName['Moderator']).toBeCloseTo(21.2097, 3);
        expect(result.bottleneckName).toBe('Moderator');
        expect(result.bottleneckTime).toBeCloseTo(21.2097, 3);
    });

    it('stageStats covers all 7 TAT_STAGES in order', () => {
        const result = calculateDiagnostics(records);
        expect(result.stageStats.map((s) => s.name)).toEqual(TAT_STAGES.map((s) => s.name));
    });

    it('returns sane defaults for an empty dataset', () => {
        const result = calculateDiagnostics([]);
        expect(result.bottleneckName).toBe('None');
        expect(result.bottleneckTime).toBe(0);
        expect(result.weakestModule).toBe('None');
        expect(result.weakestModuleScore).toBeNull();
        expect(result.weakestModuleRowCount).toBe(0);
        expect(result.weakestModuleReason).toEqual([]);
        expect(result.criticalDefectCount).toBe(0);
        expect(result.openTickets).toEqual([]);
        expect(result.modulePerformance.length).toBe(6);
        expect(
            result.modulePerformance.every((m) => m.totalRows === 0 && m.eligible === false && m.overallScore === null),
        ).toBe(true);
    });
});

describe('buildModulePerformanceEntry - Overall Module Performance formula', () => {
    // Pass Rate: NA-excluded - Partial/NA/other non-Pass/Fail statuses must
    // not appear in either the numerator or the denominator.
    it('Pass Rate excludes Partial/NA/unrecognized statuses from its denominator (synthetic)', () => {
        const rows: TestersDashboardRecord[] = [
            { 'Overall Test Status': 'Pass' },
            { 'Overall Test Status': 'Pass' },
            { 'Overall Test Status': 'Fail' },
            { 'Overall Test Status': 'Partial' },
            { 'Overall Test Status': 'NA' },
            { 'Overall Test Status': '' },
        ];
        const entry = buildModulePerformanceEntry('GDB', rows);
        // 2 Pass / (2 Pass + 1 Fail) = 67%, NOT 2/6 = 33%.
        expect(entry.passRate).toEqual({ value: 67, applicable: 3 });
    });

    it('Pass Rate is null (no applicable data), not 0, when every row is Partial/NA/blank (synthetic)', () => {
        const rows: TestersDashboardRecord[] = [{ 'Overall Test Status': 'Partial' }, { 'Overall Test Status': 'NA' }];
        const entry = buildModulePerformanceEntry('GDB', rows);
        expect(entry.passRate).toBeNull();
    });

    // Scientific Accuracy: same NA-exclusion pattern as Trust Score's A_sci.
    it('Scientific Accuracy excludes blank/NA rows from its denominator (synthetic)', () => {
        const rows: TestersDashboardRecord[] = [
            { 'Answer Scientifically Correct?': 'Correct' },
            { 'Answer Scientifically Correct?': 'Incorrect' },
            { 'Answer Scientifically Correct?': '' },
            { 'Answer Scientifically Correct?': 'NA' },
        ];
        const entry = buildModulePerformanceEntry('GDB', rows);
        // Old (÷N=4) would give 25%; new (÷applicable=2) gives 50%.
        expect(entry.scientificAccuracy).toEqual({ value: 50, applicable: 2 });
    });

    // Critical Failure Rate is the one metric NOT NA-scoped - its
    // denominator is every row in the bucket, since a blank Defect Severity
    // simply isn't Critical (there's nothing to exclude).
    it('Critical Failure Rate (positive) denominator is every row, not NA-excluded (synthetic)', () => {
        const rows: TestersDashboardRecord[] = [
            { 'Defect Severity': 'Critical' },
            { 'Defect Severity': '' },
            { 'Defect Severity': '' },
            { 'Defect Severity': 'Low' },
        ];
        const entry = buildModulePerformanceEntry('GDB', rows);
        // 1 Critical out of 4 total rows -> 100 - 25 = 75%, applicable = 4 (all rows).
        expect(entry.criticalFailureRate).toEqual({ value: 75, applicable: 4 });
    });

    // Domain Accuracy: structurally skipped (null, not 0) for GDB/Unique
    // Questions/Outreach, even when the row data happens to contain values
    // in the domain fields (a handful of real rows do, per this session's
    // investigation - confirmed leaked/mistagged, not genuine domain tests
    // outside Dynamic).
    it.each(['GDB', 'Unique Questions', 'Outreach'] as const)(
        'Domain Accuracy is always null for %s, even with domain-field data present in the rows',
        (bucket) => {
            const rows: TestersDashboardRecord[] = [
                { 'Weather Q Answered Correctly?': 'Yes' },
                { 'Mandi Price Q Correct?': 'Yes' },
                { 'Scheme Q Correct?': 'Yes' },
            ];
            const entry = buildModulePerformanceEntry(bucket, rows);
            expect(entry.domainAccuracy).toBeNull();
        },
    );

    // Domain Accuracy: each Dynamic sub-type bucket uses ONLY its own
    // single field, not the other 2 sub-types' fields, even when a row
    // (unrealistically) has values in more than one.
    it('Domain Accuracy uses only the bucket-specific single field, ignoring the other 2 domain fields (synthetic)', () => {
        const rows: TestersDashboardRecord[] = [
            { 'Weather Q Answered Correctly?': 'Yes', 'Mandi Price Q Correct?': 'No', 'Scheme Q Correct?': 'No' },
            { 'Weather Q Answered Correctly?': 'No', 'Mandi Price Q Correct?': 'Yes', 'Scheme Q Correct?': 'Yes' },
        ];
        const weather = buildModulePerformanceEntry('Dynamic - Weather', rows);
        // Only 'Weather Q Answered Correctly?' counted: 1 Yes / 2 -> 50%.
        expect(weather.domainAccuracy).toEqual({ value: 50, applicable: 2 });

        const mandi = buildModulePerformanceEntry('Dynamic - Mandi Prices', rows);
        // Only 'Mandi Price Q Correct?' counted: 1 Yes / 2 -> 50% (same
        // number here purely by this fixture's symmetry, but a different
        // field entirely).
        expect(mandi.domainAccuracy).toEqual({ value: 50, applicable: 2 });
    });

    it('Domain Accuracy is null (no applicable data), not 0, when its field is entirely blank/NA (synthetic)', () => {
        const rows: TestersDashboardRecord[] = [{ 'Weather Q Answered Correctly?': '' }, { 'Weather Q Answered Correctly?': 'NA' }];
        const entry = buildModulePerformanceEntry('Dynamic - Weather', rows);
        expect(entry.domainAccuracy).toBeNull();
    });

    // Overall Module Score: skips true N/A metrics entirely rather than
    // treating them as a 0 - a bucket where every metric except one has no
    // applicable data must still score based on that one real metric, not
    // get dragged toward 0 by 7 phantom zeros.
    it('Overall Module Score averages only metrics with real applicable data, never treating a null metric as 0', () => {
        const rows: TestersDashboardRecord[] = [
            { 'Overall Test Status': 'Pass' },
            { 'Overall Test Status': 'Pass' },
            { 'Overall Test Status': 'Pass' },
            { 'Overall Test Status': 'Pass' },
            { 'Overall Test Status': 'Pass' },
            { 'Overall Test Status': 'Pass' },
            { 'Overall Test Status': 'Pass' },
            { 'Overall Test Status': 'Pass' },
            { 'Overall Test Status': 'Pass' },
            { 'Overall Test Status': 'Pass' },
        ];
        const entry = buildModulePerformanceEntry('GDB', rows);
        // Only Pass Rate (100%) and Critical Failure Rate (100%, no
        // Critical severities present) have real applicable data - every
        // other metric (Scientific Accuracy, Translation Quality, Voice
        // Performance, SLA Compliance, Notification Experience) is entirely
        // blank across these 10 rows, so all 5 are null. Domain Accuracy is
        // structurally null for GDB regardless. If any null metric were
        // wrongly treated as a 0, overallScore would collapse toward 0
        // instead of staying at 100.
        expect(entry.passRate).toEqual({ value: 100, applicable: 10 });
        expect(entry.criticalFailureRate).toEqual({ value: 100, applicable: 10 });
        expect(entry.scientificAccuracy).toBeNull();
        expect(entry.translationQuality).toBeNull();
        expect(entry.voicePerformance).toBeNull();
        expect(entry.slaCompliance).toBeNull();
        expect(entry.notificationExperience).toBeNull();
        expect(entry.domainAccuracy).toBeNull();
        expect(entry.metricsUsedCount).toBe(2);
        expect(entry.overallScore).toBe(100);
    });

    // Minimum sample size: a bucket below MIN_ROWS_FOR_WEAKEST_MODULE rows
    // is never eligible, even if it would otherwise have the single lowest
    // overallScore of every bucket - it just doesn't get to compete for the
    // title, same rule the old single-metric logic already enforced.
    it('a bucket below MIN_ROWS_FOR_WEAKEST_MODULE rows is ineligible regardless of how low its score is', () => {
        expect(MIN_ROWS_FOR_WEAKEST_MODULE).toBe(10);
        const terribleButTinyRows: TestersDashboardRecord[] = Array.from({ length: 9 }, () => ({
            'Overall Test Status': 'Fail',
            'Defect Severity': 'Critical',
        }));
        const entry = buildModulePerformanceEntry('Outreach', terribleButTinyRows);
        expect(entry.totalRows).toBe(9);
        expect(entry.eligible).toBe(false);
        // Its score is genuinely terrible (0% Pass Rate, 0% Critical
        // Failure Rate positive) - eligible must still be false purely on
        // row count, independent of how bad overallScore is.
        expect(entry.overallScore).toBeLessThan(10);
    });

    it('calculateDiagnostics never selects an ineligible bucket as weakestModule, even when it scores lower than every eligible bucket', () => {
        const tinyTerribleRows: TestersDashboardRecord[] = Array.from({ length: 5 }, () => ({
            'Type of Question': 'Outreach',
            'Overall Test Status': 'Fail',
            'Defect Severity': 'Critical',
        }));
        const healthyGdbRows: TestersDashboardRecord[] = Array.from({ length: 12 }, () => ({
            'Type of Question': 'GDB',
            'Overall Test Status': 'Pass',
        }));
        const result = calculateDiagnostics([...tinyTerribleRows, ...healthyGdbRows]);
        const outreach = result.modulePerformance.find((m) => m.bucket === 'Outreach')!;
        expect(outreach.eligible).toBe(false);
        expect(outreach.totalRows).toBe(5);
        // Outreach would win on score alone (it's far worse than GDB's
        // 100%), but its ineligibility must keep GDB as weakestModule.
        expect(result.weakestModule).toBe('GDB');
    });

    // "Mainly affected by X and Y" - weakestMetricLabels must be genuinely
    // derived from ranking THIS bucket's own applicable metric values, not
    // a hardcoded per-bucket guess. Constructed so exactly one metric
    // (Pass Rate) is deliberately far worse than every other applicable
    // metric, and asserts it's the one label returned.
    it('weakestMetricLabels is genuinely derived from the bucket\'s own lowest-scoring applicable metrics, not hardcoded (synthetic)', () => {
        const rows: TestersDashboardRecord[] = [
            // Pass Rate: 1 Pass / 4 = 25% - deliberately the worst.
            { 'Overall Test Status': 'Pass', 'Answer Scientifically Correct?': 'Correct', 'Translation Quality': 'Correct' },
            { 'Overall Test Status': 'Fail', 'Answer Scientifically Correct?': 'Correct', 'Translation Quality': 'Correct' },
            { 'Overall Test Status': 'Fail', 'Answer Scientifically Correct?': 'Correct', 'Translation Quality': 'Correct' },
            { 'Overall Test Status': 'Fail', 'Answer Scientifically Correct?': 'Correct', 'Translation Quality': 'Correct' },
        ];
        const entry = buildModulePerformanceEntry('Outreach', rows);
        expect(entry.passRate).toEqual({ value: 25, applicable: 4 });
        expect(entry.scientificAccuracy).toEqual({ value: 100, applicable: 4 });
        expect(entry.translationQuality).toEqual({ value: 100, applicable: 4 });
        // Pass Rate (25%) must be the single worst label, ranked first.
        expect(entry.weakestMetricLabels[0]).toBe('Pass Rate');
    });

    // Reruns the same synthetic fixture with Scientific Accuracy made the
    // worst instead, proving the ranking genuinely follows the data rather
    // than always defaulting to whichever metric happens to be computed
    // first (Pass Rate is metrics[0] in MODULE_PERFORMANCE_METRIC_LABELS).
    it('weakestMetricLabels correctly re-ranks when a DIFFERENT metric (not Pass Rate) is the worst (synthetic)', () => {
        const rows: TestersDashboardRecord[] = [
            { 'Overall Test Status': 'Pass', 'Answer Scientifically Correct?': 'Correct' },
            { 'Overall Test Status': 'Pass', 'Answer Scientifically Correct?': 'Incorrect' },
            { 'Overall Test Status': 'Pass', 'Answer Scientifically Correct?': 'Incorrect' },
            { 'Overall Test Status': 'Pass', 'Answer Scientifically Correct?': 'Incorrect' },
        ];
        const entry = buildModulePerformanceEntry('Outreach', rows);
        expect(entry.passRate).toEqual({ value: 100, applicable: 4 });
        expect(entry.scientificAccuracy).toEqual({ value: 25, applicable: 4 });
        expect(entry.weakestMetricLabels[0]).toBe('Scientific Accuracy');
    });
});

// Sheet 3.0's real Test Log tab was fetched and inspected before merging it
// in (Step 0 of the Sheet 3.0 sync work) - every distinct Type of
// Question/Question Category value it actually contains was tabulated
// against the live sheet and confirmed by name here, NOT assumed. This
// isn't testing sheetMerge.ts's merge mechanics (see sheetMerge.test.ts for
// that, with synthetic fixtures) - it's confirming that once Sheet 3.0's
// real rows are physically present in updated.csv (post-sync), the
// EXISTING generic moduleGroupFor/dynamicSubBucketFor logic - unchanged by
// the Sheet 3.0 work - resolves all of them correctly with zero new
// per-value mapping code, exactly as the Step 0 investigation predicted.
describe('Sheet 3.0 real values resolve via the existing moduleGroupFor/dynamicSubBucketFor logic (no new mapping needed)', () => {
    // Confirmed via a direct Sheets API fetch of Sheet 3.0's "Test Log" tab
    // immediately before this test was written - the complete, exact set of
    // Type of Question values found there (1006 real data rows): GDB (173),
    // Unique (201), Outreach (228), Dynamic (56), WEATHER DYNAMIC (202),
    // MANDI DYNAMIC (31), SCHEME DYNAMIC (77), STATIC DYNAMIC (3), and 4
    // blank rows. No value outside this list exists in Sheet 3.0.
    it('every Type of Question value confirmed present in Sheet 3.0 resolves to the correct moduleGroupFor bucket', () => {
        expect(moduleGroupFor('GDB')).toBe('GDB');
        expect(moduleGroupFor('Unique')).toBe('Unique Questions');
        expect(moduleGroupFor('Outreach')).toBe('Outreach');
        expect(moduleGroupFor('Dynamic')).toBe('Dynamic');
        expect(moduleGroupFor('WEATHER DYNAMIC')).toBe('Dynamic');
        expect(moduleGroupFor('MANDI DYNAMIC')).toBe('Dynamic');
        expect(moduleGroupFor('SCHEME DYNAMIC')).toBe('Dynamic');
        // Static Dynamic was excluded from every moduleGroupFor bucket
        // after this test was originally written (Hemanth: "You can remove
        // static dynamic category") - Sheet 3.0's 3 confirmed STATIC
        // DYNAMIC rows now resolve to null here too, same as any other
        // unrecognized value, not their own bucket.
        expect(moduleGroupFor('STATIC DYNAMIC')).toBeNull();
        expect(moduleGroupFor('')).toBeNull();
    });

    it('the 3 compound *_DYNAMIC values confirmed in Sheet 3.0 resolve to their correct Dynamic sub-bucket', () => {
        expect(dynamicSubBucketFor('', 'WEATHER DYNAMIC')).toBe('Weather');
        expect(dynamicSubBucketFor('', 'MANDI DYNAMIC')).toBe('Mandi Prices');
        expect(dynamicSubBucketFor('', 'SCHEME DYNAMIC')).toBe('Government Schemes');
    });

    // Sheet 1.0+2.0 ALONE (i.e. updated.csv before Sheet 3.0 was ever added
    // to TESTERS_DASHBOARD_SHEETS) were independently measured immediately
    // before the Sheet 3.0 sync work: WEATHER DYNAMIC=626, MANDI
    // DYNAMIC=111, SCHEME DYNAMIC=245, STATIC DYNAMIC=10. Asserting merely
    // "count > 0" or "count >= Sheet 3.0's own contribution" would be true
    // even WITHOUT Sheet 3.0 ever having merged (2.0 alone already clears
    // Sheet 3.0's individual counts) - not a real proof the merge happened.
    // Asserting >= that pre-3.0 baseline PLUS Sheet 3.0's own confirmed
    // contribution (202/31/77/3 - see the comment above) is what actually
    // distinguishes "3.0 merged in" from "3.0 never ran."
    it('WEATHER DYNAMIC/MANDI DYNAMIC/SCHEME DYNAMIC/STATIC DYNAMIC counts include Sheet 3.0s contribution on top of the pre-3.0 baseline', () => {
        const rawTypeCounts = new Map<string, number>();
        for (const r of records) {
            const raw = (r['Type of Question'] || '').trim().toUpperCase();
            if (['WEATHER DYNAMIC', 'MANDI DYNAMIC', 'SCHEME DYNAMIC', 'STATIC DYNAMIC'].includes(raw)) {
                rawTypeCounts.set(raw, (rawTypeCounts.get(raw) || 0) + 1);
            }
        }
        expect(rawTypeCounts.get('WEATHER DYNAMIC') || 0).toBeGreaterThanOrEqual(626 + 202);
        expect(rawTypeCounts.get('MANDI DYNAMIC') || 0).toBeGreaterThanOrEqual(111 + 31);
        expect(rawTypeCounts.get('SCHEME DYNAMIC') || 0).toBeGreaterThanOrEqual(245 + 77);
        expect(rawTypeCounts.get('STATIC DYNAMIC') || 0).toBeGreaterThanOrEqual(10 + 3);
    });
});
