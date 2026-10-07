import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import {
    DB_CHANNEL_OPTIONS,
    DB_DEFECT_SEVERITY_OPTIONS,
    DB_DYNAMIC_TYPE_OPTIONS,
    DB_LANGUAGE_OPTIONS,
    DB_OVERALL_STATUS_OPTIONS,
    DB_QUESTION_CATEGORY_OPTIONS,
    DB_STATIC_TYPE_OPTIONS,
    applyDbDateFilter,
    applyDbNonDateFilters,
    buildDbFilterOptions,
    type DbFilterOption,
    type DbFilterSelection,
} from '../services/dbFilterOptions.js';
import { TestersDashboardService } from '../services/TestersDashboardService.js';
import * as testerUi from '../../frontend/src/testerLog/types.js';
import type { TesterLogEntry } from '../interfaces/ITesterLogService.js';

type Entry = Partial<TesterLogEntry>;

const NO_FILTERS: DbFilterSelection = {
    dateRange: 'all', type: 'all', category: 'all', build: 'all', channel: 'all', language: 'all',
    tester: 'all', status: 'all', severity: 'all', dynamicSubTypes: [], typeBranch: 'all', staticSubTypes: [],
};

const countOf = (options: DbFilterOption[], value: string) => options.find((o) => o.value === value)?.count;

describe('DB filter option lists mirror the Tester UI form', () => {
    it('match frontend/src/testerLog/types.ts', () => {
        expect([...DB_STATIC_TYPE_OPTIONS, ...DB_DYNAMIC_TYPE_OPTIONS].sort()).toEqual([...testerUi.TYPE_OF_QUESTION_OPTIONS].sort());
        expect(DB_QUESTION_CATEGORY_OPTIONS).toEqual(testerUi.QUESTION_CATEGORY_OPTIONS);
        expect(DB_CHANNEL_OPTIONS).toEqual(testerUi.CHANNEL_OPTIONS);
        expect(DB_LANGUAGE_OPTIONS).toEqual(testerUi.INDIAN_LANGUAGES_OPTIONS.filter((l) => l !== 'Others'));
        expect(DB_OVERALL_STATUS_OPTIONS).toEqual(testerUi.OVERALL_STATUS_OPTIONS);
        expect(DB_DEFECT_SEVERITY_OPTIONS).toEqual(testerUi.DEFECT_SEVERITY_OPTIONS);
    });
});

describe('buildDbFilterOptions', () => {
    it('keeps every supported option visible with count 0 when nothing is stored', () => {
        const { fields, typeTree } = buildDbFilterOptions([]);
        expect(fields.channel).toEqual(DB_CHANNEL_OPTIONS.map((o) => ({ value: o, label: o, count: 0 })));
        expect(fields.category.map((o) => o.value)).toEqual(DB_QUESTION_CATEGORY_OPTIONS);
        expect(fields.language.map((o) => o.value)).toEqual(DB_LANGUAGE_OPTIONS);
        expect(fields.status.map((o) => o.value)).toEqual(DB_OVERALL_STATUS_OPTIONS);
        expect(fields.severity.map((o) => o.value)).toEqual(DB_DEFECT_SEVERITY_OPTIONS);
        for (const list of [fields.category, fields.language, fields.status, fields.severity]) {
            expect(list.every((o) => o.count === 0)).toBe(true);
        }
        expect(typeTree.dynamic.map((o) => [o.value, o.count])).toEqual(DB_DYNAMIC_TYPE_OPTIONS.map((o) => [o, 0]));
        expect(typeTree.static.map((o) => [o.value, o.count])).toEqual(DB_STATIC_TYPE_OPTIONS.map((o) => [o, 0]));
        expect(fields.build).toEqual([]);
        expect(fields.tester).toEqual([]);
    });

    it('counts stored entries, matching legacy spellings to the current option without rewriting them', () => {
        const entries: Entry[] = [
            { channelTested: 'WhatsApp', overallTestStatus: 'Pass', defectSeverity: 'Nil', typeOfQuestion: 'WEATHER DYNAMIC' },
            { channelTested: 'Web App', overallTestStatus: 'pass', defectSeverity: 'NIL', typeOfQuestion: 'Weather Dynamic' },
            { channelTested: 'WebApp', overallTestStatus: 'Fail', defectSeverity: 'Critical', typeOfQuestion: 'GDB',
              questionCategory: 'Climate, Weather and Stress Management' },
            { channelTested: '', typeOfQuestion: 'Dynamic', questionCategory: 'Plant Protection', languageTested: 'Hinglish' },
        ];
        const before = JSON.stringify(entries);
        const { fields, typeTree } = buildDbFilterOptions(entries);

        expect(countOf(fields.channel, 'WhatsApp')).toBe(1);
        expect(countOf(fields.channel, 'WebApp')).toBe(2);
        expect(countOf(fields.channel, 'Both')).toBe(0);
        expect(countOf(fields.status, 'Pass')).toBe(2);
        expect(countOf(fields.status, 'Partial')).toBe(0);
        expect(countOf(fields.severity, 'NA')).toBe(2);
        expect(countOf(fields.category, 'Climate, Weather & Stress Management')).toBe(1);
        expect(countOf(typeTree.dynamic, 'Weather Dynamic')).toBe(2);
        expect(countOf(typeTree.static, 'GDB')).toBe(1);
        // Bare legacy "Dynamic" counts toward the Dynamic branch, not a sub-type.
        expect(typeTree.dynamicTotal).toBe(3);
        expect(typeTree.staticTotal).toBe(1);
        // Values matching no current option stay filterable as legacy options.
        expect(fields.category.find((o) => o.value === 'Plant Protection')).toEqual({
            value: 'Plant Protection', label: 'Plant Protection', count: 1, legacy: true,
        });
        expect(fields.language.find((o) => o.value === 'Hinglish')?.legacy).toBe(true);
        // Stored entries are never modified.
        expect(JSON.stringify(entries)).toBe(before);
    });

    it('derives Tester options from submittedByUserId, with the stored name and the active roster', () => {
        const entries: Entry[] = [
            { submittedByUserId: 'u1', testerName: 'Lavanya', createdAt: new Date('2026-09-01') },
            { submittedByUserId: 'u1', testerName: 'Lavanya M', createdAt: new Date('2026-09-02') },
            { submittedByUserId: 'u2', testerName: 'Joydeep Singha Roy', createdAt: new Date('2026-09-01') },
        ];
        const { fields } = buildDbFilterOptions(entries, [{ id: 'u3', name: 'New Tester' }]);
        expect(fields.tester).toEqual([
            // Most recent stored name - no Sheet name typo mapping
            // (the Sheet would turn "Joydeep Singha Roy" into "Joydeep").
            { value: 'u2', label: 'Joydeep Singha Roy', count: 1 },
            { value: 'u1', label: 'Lavanya M', count: 2 },
            { value: 'u3', label: 'New Tester', count: 0 },
        ]);
    });

    it('lists Build as the stored values themselves, without the Sheet collapsing every build to "1.0"', () => {
        const { fields } = buildDbFilterOptions([{ buildVersion: '0.1' }, { buildVersion: '0.1' }, { buildVersion: '1.0' }, {}]);
        expect(fields.build).toEqual([
            { value: '0.1', label: '0.1', count: 2 },
            { value: '1.0', label: '1.0', count: 1 },
        ]);
    });
});

describe('applyDbNonDateFilters / applyDbDateFilter', () => {
    const entries: (Entry & { id: string })[] = [
        { id: 'a', submittedByUserId: 'u1', channelTested: 'Web App', typeOfQuestion: 'Weather Dynamic', buildVersion: '0.1' },
        { id: 'b', submittedByUserId: 'u2', channelTested: 'WhatsApp', typeOfQuestion: 'GDB', buildVersion: '1.0' },
        { id: 'c', submittedByUserId: 'u1', channelTested: 'WebApp', typeOfQuestion: 'Static Dynamic', buildVersion: '1.0' },
        { id: 'd', submittedByUserId: 'u2', channelTested: 'Both', typeOfQuestion: 'Dynamic' },
    ];
    const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

    it('matches the selected option against stored values', () => {
        expect(ids(applyDbNonDateFilters(entries, { ...NO_FILTERS, tester: 'u1' }))).toEqual(['a', 'c']);
        expect(ids(applyDbNonDateFilters(entries, { ...NO_FILTERS, channel: 'WebApp' }))).toEqual(['a', 'c']);
        expect(ids(applyDbNonDateFilters(entries, { ...NO_FILTERS, build: '1.0' }))).toEqual(['b', 'c']);
        expect(ids(applyDbNonDateFilters(entries, { ...NO_FILTERS, channel: 'Both' }))).toEqual(['d']);
    });

    it('applies the Dynamic/Static tree on the stored Type of Question', () => {
        expect(ids(applyDbNonDateFilters(entries, { ...NO_FILTERS, typeBranch: 'Dynamic' }))).toEqual(['a', 'c', 'd']);
        expect(ids(applyDbNonDateFilters(entries, { ...NO_FILTERS, typeBranch: 'Static' }))).toEqual(['b']);
        expect(ids(applyDbNonDateFilters(entries, { ...NO_FILTERS, typeBranch: 'Dynamic', dynamicSubTypes: ['Static Dynamic'] }))).toEqual(['c']);
        expect(ids(applyDbNonDateFilters(entries, { ...NO_FILTERS, typeBranch: 'Static', staticSubTypes: ['GDB'] }))).toEqual(['b']);
    });

    it('filters dates on the stored testDate with no 2026 year cap', () => {
        const dated: (Entry & { id: string })[] = [
            { id: 'today', testDate: '2027-01-10' },
            { id: 'old', testDate: '2026-12-01' },
            { id: 'fallback', createdAt: new Date('2027-01-08T06:00:00Z') },
        ];
        const now = new Date('2027-01-10T06:00:00Z');
        expect(ids(applyDbDateFilter(dated, 'today', undefined, undefined, now))).toEqual(['today']);
        expect(ids(applyDbDateFilter(dated, '7days', undefined, undefined, now))).toEqual(['today', 'fallback']);
        expect(ids(applyDbDateFilter(dated, 'custom', '2026-11-01', '2026-12-31', now))).toEqual(['old']);
        expect(ids(applyDbDateFilter(dated, 'all', undefined, undefined, now))).toEqual(['today', 'old', 'fallback']);
    });
});

describe('TestersDashboardService.getSummary (source="db") filter options', () => {
    function makeDb(entries: Entry[], users: unknown[] = []) {
        return {
            getCollection: vi.fn(async (name: string) =>
                name === 'users'
                    ? { find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue(users) }) }
                    : { find: vi.fn().mockReturnValue({ sort: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue(entries) }) }) },
            ),
        };
    }

    const entries: Entry[] = [
        { _id: 'e1', submittedByUserId: 'u1', testerName: 'Tester One', testDate: '2026-09-01', channelTested: 'WebApp', overallTestStatus: 'Pass' },
        { _id: 'e2', submittedByUserId: 'u1', testerName: 'Tester One', testDate: '2026-09-02', channelTested: 'Web App', overallTestStatus: 'Fail' },
        { _id: 'e3', submittedByUserId: 'u2', testerName: 'Tester Two', testDate: '2026-09-02', channelTested: 'Both', overallTestStatus: 'Pass' },
    ];

    it('returns DB-native options with zero counts and the roster tester', async () => {
        const service = new TestersDashboardService(makeDb(entries, [{ _id: 'u9', firstName: 'Idle', lastName: 'Tester' }]) as any);
        const result = await service.getSummary({ source: 'db' });

        expect(result.dbFilterOptions?.fields.channel).toEqual([
            { value: 'WhatsApp', label: 'WhatsApp', count: 0 },
            { value: 'WebApp', label: 'WebApp', count: 2 },
            { value: 'Both', label: 'Both', count: 1 },
        ]);
        expect(result.dbFilterOptions?.fields.tester.map((o) => [o.value, o.count])).toEqual([['u9', 0], ['u1', 2], ['u2', 1]]);
        expect(result.filterOptions.channel).toEqual(['WhatsApp', 'WebApp', 'Both']);
    });

    it('filters KPIs by the stored tester identity and DB channel value', async () => {
        const service = new TestersDashboardService(makeDb(entries) as any);
        const byTester = await service.getSummary({ source: 'db', tester: 'u1' });
        expect(byTester.kpis.N).toBe(2);
        const byChannel = await service.getSummary({ source: 'db', channel: 'WebApp' });
        expect(byChannel.kpis.N).toBe(2);
        // Options/counts always come from every stored entry, not the filtered subset.
        expect(countOf(byTester.dbFilterOptions!.fields.tester, 'u2')).toBe(1);
    });

    it('still loads when the tester roster is unavailable', async () => {
        const db = {
            getCollection: vi.fn(async (name: string) => {
                if (name === 'users') throw new Error('no users collection');
                return makeDb(entries).getCollection(name);
            }),
        };
        const result = await new TestersDashboardService(db as any).getSummary({ source: 'db' });
        expect(result.success).toBe(true);
        expect(result.dbFilterOptions?.fields.tester.map((o) => o.value)).toEqual(['u1', 'u2']);
    });
});
