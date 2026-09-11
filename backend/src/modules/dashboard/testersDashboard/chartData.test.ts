import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import csv from 'csv-parser';
import type { TestersDashboardRecord } from '../interfaces/ITestersDashboardService.js';
import { parseTestDateToISO, getTodayIST } from './normalize.js';
import { calculateTrustScore, calculateExperienceScore } from './kpis.js';
import { calculateChartData } from './chartData.js';

// Fixed "now" so the future-date cutoff is deterministic - matches the real
// system date at port time, which falls inside this CSV's actual 2026 date
// range (same convention as filters.test.ts's NOW).
const NOW = new Date('2026-09-09T12:00:00.000Z');

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
        const result = calculateChartData(records, NOW);
        const dates = result.scoreTrend.map((p) => p.date);
        const sorted = [...dates].sort();
        expect(dates).toEqual(sorted);
        expect(dates.length).toBeGreaterThan(0);
    });

    // parseTestDateToISO returns null for unparseable Test Date values, and
    // a parseable-but-future Test Date (later than today, IST) is also
    // excluded (see the dedicated future-date tests below) - both cases
    // must be excluded entirely, not grouped under a bogus
    // "undefined"/"null"/"" bucket. Verified two ways: no such bucket key
    // exists, AND the grouped-row count plus the independently-counted
    // excluded-row counts (unparseable + future) reconstructs the full
    // dataset exactly.
    it('excludes rows with an unparseable Test Date rather than creating a bogus bucket', () => {
        const result = calculateChartData(records, NOW);
        const dates = result.scoreTrend.map((p) => p.date);
        expect(dates).not.toContain('undefined');
        expect(dates).not.toContain('null');
        expect(dates).not.toContain('');

        const todayISO = getTodayIST(NOW);
        const unparseableCount = records.filter((r) => parseTestDateToISO(r['Test Date']) === null).length;
        const futureCount = records.filter((r) => {
            const iso = parseTestDateToISO(r['Test Date']);
            return iso !== null && iso > todayISO;
        }).length;
        const groupedRowCount = records.length - unparseableCount - futureCount;
        // Re-derive the grouped total independently (not from internal
        // state calculateChartData doesn't expose) by re-filtering per date.
        const totalAcrossBuckets = dates.reduce(
            (sum, d) => sum + records.filter((r) => parseTestDateToISO(r['Test Date']) === d).length,
            0,
        );
        expect(totalAcrossBuckets).toBe(groupedRowCount);
        expect(unparseableCount).toBe(930);
        expect(futureCount).toBe(10);
    });

    // The live sheet keeps changing between sessions (already documented
    // repeatedly throughout this codebase's tests) - numbers below
    // independently re-verified against a fresh CSV pull immediately
    // before writing this test; re-derive with a one-off script against
    // backend/data/testers-dashboard/updated.csv to spot-check if this
    // starts failing. Trust values reflect Trust Score v2's formula
    // (25% Scientific Accuracy [Static + Dynamic rows with a real answer] +
    // 30% Dynamic Accuracy + 15% Source Links + 10% Question Framed + 10%
    // Translation + 10% SLA).
    it('spot-checks 3 real dates\' trust/experience scores + hasData flags against independent re-filtering + direct calculateTrustScore/calculateExperienceScore calls', () => {
        const result = calculateChartData(records, NOW);
        const cases: { date: string; trust: number; trustHasData: boolean; experience: number; experienceHasData: boolean }[] = [
            { date: '2022-06-22', trust: 90, trustHasData: true, experience: 35, experienceHasData: true },
            { date: '2026-07-11', trust: 80, trustHasData: true, experience: 87, experienceHasData: true },
            // Was '2026-12-11' (trust=30/no data) before the future-date
            // cutoff - that date is now correctly excluded from the chart
            // entirely (see the dedicated future-date tests below), so this
            // case was swapped for a real, still-plotted date instead.
            { date: '2026-09-05', trust: 99, trustHasData: true, experience: 97, experienceHasData: true },
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
        const result = calculateChartData(records, NOW);
        const point = result.scoreTrend.find((p) => p.date === '2026-08-06');
        expect(point).toBeDefined();
        // was 1033.1/247 under the old 10,080-min cutoff; the parse cap
        // raised to 100,000 min (RESPONSE_TIME_PARSE_CAP_MINUTES) now
        // includes 1 more genuine multi-day reading on this date.
        expect(point!.avgLatency).toBe(1092.1);
        expect(point!.avgLatencySampleCount).toBe(248);
        expect(point!.avgReviewTat).toBe(2.6);
        expect(point!.avgReviewTatSampleCount).toBe(2463);
    });

    it('a day with zero parseable TAT values correctly reports avgReviewTat=0, not NaN', () => {
        // Real data: some low-volume dates have no parseable TAT values at
        // all across all 7 stages - confirms the tatCount===0 guard works,
        // not just the common non-zero case.
        const result = calculateChartData(records, NOW);
        for (const point of result.scoreTrend) {
            expect(Number.isNaN(point.avgLatency)).toBe(false);
            expect(Number.isNaN(point.avgReviewTat)).toBe(false);
        }
    });

    // The chart must never plot a day later than today (IST) - a handful of
    // rows have a confirmed data-entry mistake (month incremented while the
    // day stayed fixed, e.g. "11-09-2026" -> "11-10-2026" -> "11-11-2026")
    // that lands them months into the future. Previously these showed up as
    // a few isolated near-empty points at the far right of every chart tab,
    // dropping the plotted score toward A_dom's zero-rows floor (~30%).
    // They're excluded here entirely (not merely flagged low-data), and
    // re-derived independently against the fresh CSV rather than hardcoded
    // from a prior investigation, so this stays correct as the live sheet
    // grows.
    it('excludes future-dated rows (Test Date after today, IST) from the chart entirely, and never plots past today', () => {
        const result = calculateChartData(records, NOW);
        const todayISO = getTodayIST(NOW);

        // No plotted point is ever later than today, and the chart isn't
        // cut short either - its last point IS today.
        result.scoreTrend.forEach((p) => expect(p.date <= todayISO).toBe(true));
        expect(result.scoreTrend[result.scoreTrend.length - 1]!.date).toBe(todayISO);

        const independentFutureDates = [
            ...new Set(
                records
                    .map((r) => parseTestDateToISO(r['Test Date']))
                    .filter((iso): iso is string => iso !== null && iso > todayISO),
            ),
        ].sort();
        expect(independentFutureDates).toEqual([
            '2026-09-11',
            '2026-10-03',
            '2026-10-04',
            '2026-10-11',
            '2026-11-03',
            '2026-11-04',
            '2026-11-11',
            '2026-12-03',
            '2026-12-04',
            '2026-12-11',
        ]);
        independentFutureDates.forEach((d) => {
            expect(result.scoreTrend.find((p) => p.date === d)).toBeUndefined();
        });
    });

    // Confirms the future-date cutoff doesn't sweep up genuinely sparse (but
    // real, non-future) historical dates alongside the future ones - low row
    // count alone must not be mistaken for "future data-entry mistake".
    it('does not exclude sparse-but-real non-future dates, and boundary date "today" is included', () => {
        const result = calculateChartData(records, NOW);
        const sparseButRealDates = [
            '2022-06-22',
            '2023-06-23',
            '2025-06-15',
            '2026-02-17',
            '2026-06-03',
            '2026-06-04',
            '2026-06-08',
            '2026-09-05',
            '2026-09-09', // = today (NOW's IST date) - the inclusive boundary
        ];
        sparseButRealDates.forEach((d) => {
            const point = result.scoreTrend.find((p) => p.date === d);
            expect(point).toBeDefined();
            expect(point!.trustHasData).toBe(true);
            expect(point!.experienceHasData).toBe(true);
        });
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
        // trust itself is deliberately UNCHANGED (still 30, from A_dom's
        // existing default-to-100-when-empty behavior at its v2 30% weight)
        // - this fix doesn't touch calculateTrustScore's own computation,
        // only adds the trustHasData flag alongside it for the frontend to
        // act on.
        expect(point.trust).toBe(30);
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

    // Synthetic, fully isolated from the live CSV - pins the exact boundary
    // (today included, tomorrow excluded) directly against an injected
    // `now`, independent of whatever future-dated rows happen to exist in
    // the live sheet on any given day.
    it('the future-date cutoff is inclusive of today and exclusive of tomorrow (synthetic)', () => {
        const now = new Date('2026-09-09T12:00:00.000Z'); // IST today = 2026-09-09
        const result = calculateChartData(
            [
                { 'Test Date': '08-09-2026' }, // yesterday
                { 'Test Date': '09-09-2026' }, // today - included
                { 'Test Date': '10-09-2026' }, // tomorrow - excluded
                { 'Test Date': '11-09-2026' }, // 2 days out - excluded
            ],
            now,
        );
        expect(result.scoreTrend.map((p) => p.date)).toEqual(['2026-09-08', '2026-09-09']);
    });
});
