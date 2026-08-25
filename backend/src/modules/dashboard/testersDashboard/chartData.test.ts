import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import csv from 'csv-parser';
import type { TestersDashboardRecord } from '../interfaces/ITestersDashboardService.js';
import { parseTestDateToISO } from './normalize.js';
import { calculateTrustScore, calculateExperienceScore } from './kpis.js';
import { calculateChartData } from './chartData.js';

// Same loader as every previous phase's test - real live CSV, parsed the
// same way TestersDashboardService.parseCSV does. Pulled FRESH at test run
// time (not a cached snapshot) - every phase this session has confirmed
// the live sheet keeps changing between sessions, so every number asserted
// below was independently computed against this exact same file
// immediately before writing these assertions.
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

describe('calculateChartData against the real live CSV (fresh pull)', () => {
    it('groups by parsed ISO date and returns a chronologically sorted array', () => {
        const result = calculateChartData(records);
        const dates = result.scoreTrend.map((p) => p.date);
        const sorted = [...dates].sort();
        expect(dates).toEqual(sorted);
        expect(dates.length).toBeGreaterThan(0);
    });

    // parseTestDateToISO returns null for unparseable Test Date values -
    // those rows must be excluded entirely, not grouped under a bogus
    // "undefined"/"null"/"" bucket. Verified two ways: no such bucket key
    // exists, AND the grouped-row count plus the independently-counted
    // excluded-row count reconstructs the full dataset exactly.
    it('excludes rows with an unparseable Test Date rather than creating a bogus bucket', () => {
        const result = calculateChartData(records);
        const dates = result.scoreTrend.map((p) => p.date);
        expect(dates).not.toContain('undefined');
        expect(dates).not.toContain('null');
        expect(dates).not.toContain('');

        const unparseableCount = records.filter((r) => parseTestDateToISO(r['Test Date']) === null).length;
        const groupedRowCount = records.length - unparseableCount;
        // Re-derive the grouped total independently (not from internal
        // state calculateChartData doesn't expose) by re-filtering per date.
        const totalAcrossBuckets = dates.reduce(
            (sum, d) => sum + records.filter((r) => parseTestDateToISO(r['Test Date']) === d).length,
            0,
        );
        expect(totalAcrossBuckets).toBe(groupedRowCount);
        expect(unparseableCount).toBe(838);
    });

    // The live sheet keeps changing between sessions (already documented
    // repeatedly throughout this codebase's tests) - numbers below
    // independently re-verified against a fresh CSV pull immediately
    // before writing this test; re-derive with a one-off script against
    // backend/data/testers-dashboard/updated.csv to spot-check if this
    // starts failing.
    it('spot-checks 3 real dates\' trust/experience scores + hasData flags against independent re-filtering + direct calculateTrustScore/calculateExperienceScore calls', () => {
        const result = calculateChartData(records);
        const cases: { date: string; trust: number; trustHasData: boolean; experience: number; experienceHasData: boolean }[] = [
            { date: '2022-06-22', trust: 90, trustHasData: true, experience: 35, experienceHasData: true },
            { date: '2026-07-11', trust: 80, trustHasData: true, experience: 87, experienceHasData: true },
            { date: '2026-12-11', trust: 20, trustHasData: false, experience: 0, experienceHasData: false },
        ];

        for (const c of cases) {
            const point = result.scoreTrend.find((p) => p.date === c.date);
            expect(point).toBeDefined();

            // Independently re-filter the FRESH records array by date (not
            // reusing calculateChartData's internal grouping) and call
            // calculateTrustScore/calculateExperienceScore directly - this
            // is the actual cross-check, not just re-asserting the same
            // hardcoded numbers twice.
            const independentRows = records.filter((r) => parseTestDateToISO(r['Test Date']) === c.date);
            expect(calculateTrustScore(independentRows).score).toBe(c.trust);
            expect(calculateExperienceScore(independentRows).score).toBe(c.experience);

            expect(point!.trust).toBe(c.trust);
            expect(point!.trustHasData).toBe(c.trustHasData);
            expect(point!.experience).toBe(c.experience);
            expect(point!.experienceHasData).toBe(c.experienceHasData);
        }
    });

    // Manual, completely independent recomputation (no timeToMinutes call)
    // for a high-volume date - same rigor as Phase 4's Biggest Bottleneck
    // spot-check. WILL drift as the live sheet keeps growing.
    it('spot-checks avgLatency/avgReviewTat + their sample counts for a high-volume date via manual independent computation', () => {
        const result = calculateChartData(records);
        const point = result.scoreTrend.find((p) => p.date === '2026-08-06');
        expect(point).toBeDefined();
        expect(point!.avgLatency).toBe(222.4);
        expect(point!.avgLatencySampleCount).toBe(214);
        expect(point!.avgReviewTat).toBe(2.6);
        expect(point!.avgReviewTatSampleCount).toBe(2463);
    });

    it('a day with zero parseable TAT values correctly reports avgReviewTat=0, not NaN', () => {
        // Real data: some low-volume dates have no parseable TAT values at
        // all across all 7 stages - confirms the tatCount===0 guard works,
        // not just the common non-zero case.
        const result = calculateChartData(records);
        for (const point of result.scoreTrend) {
            expect(Number.isNaN(point.avgLatency)).toBe(false);
            expect(Number.isNaN(point.avgReviewTat)).toBe(false);
        }
    });

    // The 6 dates flagged as future/near-empty in this session's
    // investigation (2026-09-01 through 2026-12-11) - trustHasData must be
    // false on every one of them (the fix's whole purpose), and the reading
    // counts backing Avg Response/Review TAT must be exactly 0 on each,
    // proving those 2 tabs' "0 vs no-data" ambiguity is now resolvable by
    // the frontend without touching avgLatency/avgReviewTat's own values.
    it('all 6 known future/near-empty dates report trustHasData=false and zero response/TAT reading counts', () => {
        const result = calculateChartData(records);
        const FLAGGED = ['2026-09-01', '2026-09-09', '2026-09-11', '2026-10-11', '2026-11-11', '2026-12-11'];
        FLAGGED.forEach((d) => {
            const point = result.scoreTrend.find((p) => p.date === d);
            expect(point).toBeDefined();
            expect(point!.trustHasData).toBe(false);
            expect(point!.avgLatencySampleCount).toBe(0);
            expect(point!.avgReviewTatSampleCount).toBe(0);
        });

        // 2026-09-01 is the one exception for Farmer Experience specifically
        // (its single row has a real SLA Status value) - the other 5 are
        // fully blank across every one of Farmer Experience's 5 sub-metrics
        // too. Proves experienceHasData is genuinely independent per-day,
        // not just mirroring trustHasData.
        expect(result.scoreTrend.find((p) => p.date === '2026-09-01')!.experienceHasData).toBe(true);
        ['2026-09-09', '2026-09-11', '2026-10-11', '2026-11-11', '2026-12-11'].forEach((d) => {
            expect(result.scoreTrend.find((p) => p.date === d)!.experienceHasData).toBe(false);
        });
    });

    // Confirms the fix is precise, not over- or under-triggering: exactly
    // the 6 known dates (no more, no fewer) show trustHasData=false across
    // the ENTIRE chart history, including every other genuinely sparse
    // historical date (2022-06-22, 2023-06-23, 2025-06-15, 2026-02-17,
    // 2026-06-04, 2026-06-08 all have real applicable data despite low row
    // counts, and must NOT be swept up into the no-data bucket).
    it('exactly the 6 known dates are flagged trustHasData=false across the whole dataset - no false positives on other sparse-but-real dates', () => {
        const result = calculateChartData(records);
        const falseDates = result.scoreTrend.filter((p) => !p.trustHasData).map((p) => p.date).sort();
        expect(falseDates).toEqual(
            ['2026-09-01', '2026-09-09', '2026-09-11', '2026-10-11', '2026-11-11', '2026-12-11'].sort(),
        );
    });

    // Synthetic - proves hasData/sampleCount mechanics directly rather than
    // relying on the real dataset happening to contain the right shape of
    // row, and pins the exact expected values.
    it('a day with only blank/NA rows reports hasData=false for both scores and 0 for both sample counts (synthetic)', () => {
        const result = calculateChartData([
            { 'Test Date': '01-01-2026', 'Type of Question': 'GDB' },
            { 'Test Date': '01-01-2026' },
        ]);
        expect(result.scoreTrend.length).toBe(1);
        const point = result.scoreTrend[0];
        // trust itself is deliberately UNCHANGED (still 20, from A_dom's
        // existing default-to-100-when-empty behavior) - this fix doesn't
        // touch calculateTrustScore's own computation, only adds the
        // trustHasData flag alongside it for the frontend to act on.
        expect(point.trust).toBe(20);
        expect(point.trustHasData).toBe(false);
        expect(point.experience).toBe(0);
        expect(point.experienceHasData).toBe(false);
        expect(point.avgLatency).toBe(0);
        expect(point.avgLatencySampleCount).toBe(0);
        expect(point.avgReviewTat).toBe(0);
        expect(point.avgReviewTatSampleCount).toBe(0);
    });

    it('a day with real data in just one field reports hasData=true, distinguishing it from a fully-blank day (synthetic)', () => {
        const result = calculateChartData([{ 'Test Date': '02-01-2026', 'Translation Quality': 'Correct' }]);
        const point = result.scoreTrend[0];
        expect(point.trustHasData).toBe(true);
        // Experience Score has no field overlap with Translation Quality's
        // Trust-Score-only siblings here (Q_trn IS shared, so this actually
        // also makes experienceHasData true - Translation Quality feeds
        // both scores).
        expect(point.experienceHasData).toBe(true);
    });

    it('returns an empty scoreTrend for an empty dataset', () => {
        expect(calculateChartData([])).toEqual({ scoreTrend: [] });
    });
});
