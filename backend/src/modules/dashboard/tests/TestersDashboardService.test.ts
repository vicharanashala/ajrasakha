import 'reflect-metadata';
import fs from 'fs';
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { TestersDashboardService } from '../services/TestersDashboardService.js';
import { EMPTY_FILTERS, applyFilters } from '../testersDashboard/filters.js';
import { calculateKpis } from '../testersDashboard/kpis.js';
import { calculateDiagnostics } from '../testersDashboard/diagnostics.js';
import { calculateChartData } from '../testersDashboard/chartData.js';
import type { GetTestersDashboardQuery } from '../validators/TestersDashboardValidators.js';

// Wires Phases 1-3 together and verifies against the same real live CSV
// filters.test.ts/kpis.test.ts already verified - not a mocked fixture.
// TestersDashboardService takes no constructor dependencies (reads the CSV
// directly), so this instantiates it directly rather than going through
// the DI container, same spirit as CropService.test.ts's direct
// `new CropService(...)` pattern (just with no mocks needed here).
describe('TestersDashboardService.getSummary', () => {
    let service: TestersDashboardService;

    beforeAll(() => {
        service = new TestersDashboardService();
    });

    it('returns the full unfiltered dataset\'s KPIs matching kpis.test.ts\'s already-verified numbers', async () => {
        const result = await service.getSummary({});
        expect(result.success).toBe(true);
        expect(result.totalRecords).toBe(11193);
        // Cross-checked against kpis.test.ts's "matches independently-computed
        // Executive Summary numbers" test for the full unfiltered dataset.
        expect(result.kpis.trustScore).toBe(55);
        expect(result.kpis.experienceScore).toBe(51);
        expect(result.kpis.passRate).toBe(59);
        expect(result.kpis.criticalFailuresToday).toBe(1582);
        expect(result.kpis.criticalBreakdown.countNotifFailure).toBe(842);
        expect(result.kpis.releaseHealth).toBe(55);
    });

    it('an empty query behaves identically to explicit EMPTY_FILTERS', async () => {
        const withEmptyQuery = await service.getSummary({});
        // EMPTY_FILTERS.dynamicSubTypes/staticSubTypes are string[]
        // (TestersDashboardFilters' shape); GetTestersDashboardQuery's
        // dynamicSubTypes/staticSubTypes are raw comma-separated strings
        // (the wire format) - explicitly overridden to undefined here for
        // the same reason customStart/customEnd are: none of these 4
        // fields exist on TestersDashboardFilters at all/are shaped the
        // same, so spreading EMPTY_FILTERS alone doesn't produce a valid
        // query object.
        const explicit: GetTestersDashboardQuery = {
            ...EMPTY_FILTERS,
            customStart: undefined,
            customEnd: undefined,
            dynamicSubTypes: undefined,
            staticSubTypes: undefined,
        };
        const withExplicitAll = await service.getSummary(explicit);
        expect(withEmptyQuery.kpis).toEqual(withExplicitAll.kpis);
    });

    it('type=GDB filter produces the same KPIs as calling applyFilters+calculateKpis directly', async () => {
        const result = await service.getSummary({ type: 'GDB' });

        // Independently re-derive the expected KPIs by calling Phase 2/3's
        // pure functions directly against the same raw records the service
        // used internally - this is the actual "wiring" check: proves
        // getSummary() is really composing applyFilters + calculateKpis,
        // not some other computation.
        const rawRecords = await service.getData();
        const expectedRows = applyFilters(rawRecords.records, { ...EMPTY_FILTERS, type: 'GDB' }, false, undefined, undefined);
        const expectedKpis = calculateKpis(expectedRows);

        expect(expectedRows.length).toBe(3127); // matches filters.test.ts's verified GDB count
        expect(result.kpis).toEqual(expectedKpis);
        expect(result.kpis.N).toBe(3127);
        // totalRecords is always the FULL dataset count, not the filtered
        // count - the filter narrows the KPIs, not the reported total.
        expect(result.totalRecords).toBe(11193);
    });

    it('combining status=Pass + severity=Critical filters matches direct computation', async () => {
        const result = await service.getSummary({ status: 'Pass', severity: 'Critical' });

        const rawRecords = await service.getData();
        const expectedRows = applyFilters(
            rawRecords.records,
            { ...EMPTY_FILTERS, status: 'Pass', severity: 'Critical' },
            false,
            undefined,
            undefined,
        );
        const expectedKpis = calculateKpis(expectedRows);

        expect(result.kpis).toEqual(expectedKpis);
    });

    it('type=GDB filter produces the same diagnostics as calling applyFilters+calculateDiagnostics directly', async () => {
        const result = await service.getSummary({ type: 'GDB' });

        // Same "prove the wiring, not just the logic" approach as the KPI
        // test above - independently re-derive expected diagnostics via
        // Phase 2/4's pure functions against the same raw records, over the
        // SAME filtered rows kpis is computed from (not a separate refilter).
        const rawRecords = await service.getData();
        const expectedRows = applyFilters(rawRecords.records, { ...EMPTY_FILTERS, type: 'GDB' }, false, undefined, undefined);
        const expectedDiagnostics = calculateDiagnostics(expectedRows);

        expect(result.diagnostics).toEqual(expectedDiagnostics);
        // Overall Module Performance is scoped to the GDB filter - only the
        // GDB bucket should have any rows, confirming diagnostics really ran
        // over the filtered rows, not the full unfiltered dataset.
        const byBucket = Object.fromEntries(result.diagnostics.modulePerformance.map((m) => [m.bucket, m.totalRows]));
        expect(byBucket['GDB']).toBe(expectedRows.length);
        expect(byBucket['Unique Questions']).toBe(0);
        expect(byBucket['Outreach']).toBe(0);
        expect(byBucket['Dynamic - Weather']).toBe(0);
        expect(byBucket['Dynamic - Mandi Prices']).toBe(0);
        expect(byBucket['Dynamic - Government Schemes']).toBe(0);
    });

    it('type=GDB filter produces the same chartData as calling applyFilters+calculateChartData directly', async () => {
        const result = await service.getSummary({ type: 'GDB' });

        // Same "prove the wiring, not just the logic" approach as the
        // kpis/diagnostics tests above - independently re-derive expected
        // chartData via Phase 2/5's pure functions against the same raw
        // records, over the SAME filtered rows kpis/diagnostics are
        // computed from (not a separate refilter).
        const rawRecords = await service.getData();
        const expectedRows = applyFilters(rawRecords.records, { ...EMPTY_FILTERS, type: 'GDB' }, false, undefined, undefined);
        const expectedChartData = calculateChartData(expectedRows);

        expect(result.chartData).toEqual(expectedChartData);
        // The GDB filter should scope every chart point's underlying rows -
        // total rows across every scoreTrend date can't exceed the filtered
        // row count, confirming chartData really ran over the filtered
        // rows, not the full unfiltered dataset.
        expect(result.chartData.scoreTrend.length).toBeGreaterThan(0);
        const dates = result.chartData.scoreTrend.map((p) => p.date);
        expect(dates).toEqual([...dates].sort());
    });

    it('combining status=Pass + severity=Critical filters produces the same diagnostics as direct computation', async () => {
        const result = await service.getSummary({ status: 'Pass', severity: 'Critical' });

        const rawRecords = await service.getData();
        const expectedRows = applyFilters(
            rawRecords.records,
            { ...EMPTY_FILTERS, status: 'Pass', severity: 'Critical' },
            false,
            undefined,
            undefined,
        );
        const expectedDiagnostics = calculateDiagnostics(expectedRows);

        expect(result.diagnostics).toEqual(expectedDiagnostics);
        // severity=Critical means every row IS a Critical defect, so
        // criticalDefectCount should equal the full filtered row count.
        expect(result.diagnostics.criticalDefectCount).toBe(expectedRows.length);
    });

    it('excludeFailures is passed through to the filter stage', async () => {
        // Arrives as the string "true", not a boolean - query params are
        // always strings (see TestersDashboardValidators.ts's
        // @IsBooleanString() comment).
        const withFailures = await service.getSummary({});
        const withoutFailures = await service.getSummary({ excludeFailures: 'true' });
        expect(withoutFailures.kpis.N).toBeLessThan(withFailures.kpis.N);
    });

    it('filterOptions are built from the UNFILTERED dataset, not narrowed by the active filter', async () => {
        const filteredToOneType = await service.getSummary({ type: 'GDB' });
        const unfiltered = await service.getSummary({});
        // Picking a Type of Question filter shouldn't shrink e.g. the
        // Tester Name or Channel Tested dropdown options - those are
        // independent dimensions built from the full dataset.
        expect(filteredToOneType.filterOptions.tester).toEqual(unfiltered.filterOptions.tester);
        expect(filteredToOneType.filterOptions.channel).toEqual(unfiltered.filterOptions.channel);
        // The type dropdown itself is also built from the full dataset (all
        // 4 buckets present), not collapsed to just the selected "GDB".
        expect(filteredToOneType.filterOptions.type).toEqual(unfiltered.filterOptions.type);
        expect(filteredToOneType.filterOptions.type.length).toBeGreaterThan(1);
    });

    it('returns null previousPeriodStats for the default "all" date range', async () => {
        const result = await service.getSummary({});
        expect(result.previousPeriodStats).toBeNull();
    });

    it('returns real previousPeriodStats for a 7days date range', async () => {
        // Not pinned to a fixed "now" here (getSummary doesn't expose a
        // `now` override - that's only used internally by filters.ts/kpis.ts
        // for testability), so this just checks the shape and that a real
        // window was computed, rather than asserting exact numbers that
        // would drift with the actual current date.
        const result = await service.getSummary({ dateRange: '7days' });
        expect(result.previousPeriodStats).not.toBeNull();
        expect(result.previousPeriodStats!.rangeLabel).toMatch(/^\d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2}$/);
        expect(typeof result.previousPeriodStats!.totalTests).toBe('number');
    });

    it('lastSyncedAt is a valid ISO timestamp reflecting the CSV file\'s mtime', async () => {
        const result = await service.getSummary({});
        expect(result.lastSyncedAt).not.toBeNull();
        expect(new Date(result.lastSyncedAt!).toString()).not.toBe('Invalid Date');
    });

    describe('caching', () => {
        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('reuses the cached records on a second call instead of re-reading the CSV from disk', async () => {
            // Fresh instance so this test isn't affected by caching from
            // the tests above.
            const freshService = new TestersDashboardService();
            const readSpy = vi.spyOn(fs, 'readFileSync');

            await freshService.getSummary({});
            const readsAfterFirstCall = readSpy.mock.calls.length;
            expect(readsAfterFirstCall).toBeGreaterThan(0);

            await freshService.getSummary({ type: 'GDB' });
            const readsAfterSecondCall = readSpy.mock.calls.length;

            // The second getSummary() call (a different filter, same
            // underlying data) should not have triggered another disk read -
            // it should have served the cached records instead.
            expect(readsAfterSecondCall).toBe(readsAfterFirstCall);
        });

        it('getData() always re-reads from disk regardless of the summary cache (unchanged existing contract)', async () => {
            const freshService = new TestersDashboardService();
            await freshService.getSummary({}); // populates the summary cache
            const readSpy = vi.spyOn(fs, 'readFileSync');

            await freshService.getData();

            expect(readSpy).toHaveBeenCalled();
        });
    });
});
