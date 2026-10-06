import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import csv from 'csv-parser';
import { describe, it, expect } from 'vitest';
import { streamAggregateSummary } from './streamAggregator.js';
import { EMPTY_FILTERS, applyFilters, buildFilterOptions } from './filters.js';
import { calculateKpis, calculatePreviousPeriodStats, calculateChannelStats, calculateLanguageStats } from './kpis.js';
import { calculateDiagnostics } from './diagnostics.js';
import { calculateChartData } from './chartData.js';
import { isFutureTestDate } from './normalize.js';
import type { TestersDashboardRecord } from '../interfaces/ITestersDashboardService.js';

const CSV_PATH =
    process.env.TESTERS_DASHBOARD_CSV_PATH ||
    path.join(process.cwd(), 'data', 'testers-dashboard', 'updated.csv');

async function loadRecordsInOldWay(): Promise<TestersDashboardRecord[]> {
    const fileContent = fs.readFileSync(CSV_PATH, 'utf8');
    const headerIndex = fileContent.indexOf('Test ID,');
    const content = headerIndex !== -1 ? fileContent.substring(headerIndex) : fileContent;

    return new Promise((resolve, reject) => {
        const results: TestersDashboardRecord[] = [];
        Readable.from([content])
            .pipe(csv())
            .on('data', (data: TestersDashboardRecord) => {
                const testId = data['Test ID'] ? data['Test ID'].trim() : '';
                if (testId && !testId.startsWith('Project:') && !testId.startsWith('Test ID') && !isFutureTestDate(data['Test Date'])) {
                    results.push(data);
                }
            })
            .on('end', () => resolve(results))
            .on('error', reject);
    });
}

describe('streamAggregator vs in-memory aggregation parity', () => {
    it('matches in-memory aggregation exactly for default empty filters', async () => {
        const allRecords = await loadRecordsInOldWay();
        const filteredRows = applyFilters(allRecords, EMPTY_FILTERS, false, undefined, undefined);

        const expectedKpis = calculateKpis(filteredRows, EMPTY_FILTERS.typeBranch);
        const expectedDiagnostics = calculateDiagnostics(filteredRows, {});
        const expectedChartData = calculateChartData(filteredRows, undefined, EMPTY_FILTERS.typeBranch);
        const expectedChannelStats = calculateChannelStats(filteredRows);
        const expectedLanguageStats = calculateLanguageStats(filteredRows);
        const expectedFilterOptions = buildFilterOptions(allRecords);

        const streamed = await streamAggregateSummary(CSV_PATH, EMPTY_FILTERS, false, undefined, undefined, {});

        expect(streamed.totalRecords).toBe(allRecords.length);
        expect(streamed.kpis).toEqual(expectedKpis);
        expect(streamed.diagnostics).toEqual(expectedDiagnostics);
        expect(streamed.chartData).toEqual(expectedChartData);
        expect(streamed.channelStats).toEqual(expectedChannelStats);
        expect(streamed.languageStats).toEqual(expectedLanguageStats);
        expect(streamed.filterOptions).toEqual(expectedFilterOptions);
        expect(streamed.previousPeriodStats).toBeNull();
    });

    it('matches in-memory aggregation for 7days date range with previousPeriodStats', async () => {
        const allRecords = await loadRecordsInOldWay();
        const filters = { ...EMPTY_FILTERS, dateRange: '7days' as const };
        const filteredRows = applyFilters(allRecords, filters, false, undefined, undefined);

        const expectedKpis = calculateKpis(filteredRows, filters.typeBranch);
        const expectedPrevStats = calculatePreviousPeriodStats(allRecords, filters, false, undefined, undefined);

        const streamed = await streamAggregateSummary(CSV_PATH, filters, false, undefined, undefined, {});

        expect(streamed.kpis).toEqual(expectedKpis);
        expect(streamed.previousPeriodStats).toEqual(expectedPrevStats);
    });

    it('matches in-memory aggregation for type=GDB filter with excludeFailures=true', async () => {
        const allRecords = await loadRecordsInOldWay();
        const filters = { ...EMPTY_FILTERS, type: 'GDB' };
        const filteredRows = applyFilters(allRecords, filters, true, undefined, undefined);

        const expectedKpis = calculateKpis(filteredRows, filters.typeBranch);
        const expectedDiagnostics = calculateDiagnostics(filteredRows, {});

        const streamed = await streamAggregateSummary(CSV_PATH, filters, true, undefined, undefined, {});

        expect(streamed.kpis).toEqual(expectedKpis);
        expect(streamed.diagnostics).toEqual(expectedDiagnostics);
    });
});
