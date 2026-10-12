import 'reflect-metadata';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, ObjectId, type Db } from 'mongodb';

// The new path must never touch the Sheet mapper - if anything imported it
// and called it, these throw and fail the test.
vi.mock('../services/TestersDashboardService.js', () => ({
    mapTesterLogEntryToRecord: () => {
        throw new Error('mapTesterLogEntryToRecord must not be used by the DB-native path');
    },
    TestersDashboardService: class {
        constructor() {
            throw new Error('TestersDashboardService must not be used by the DB-native path');
        }
    },
}));

import { TestersDbAnalyticsService, buildDbAnalyticsMatch, selectionFromQuery } from '../services/TestersDbAnalyticsService.js';
import { applyDbDateFilter, applyDbNonDateFilters, buildDbFilterOptions } from '../services/dbFilterOptions.js';
import { DB_ANALYTICS_ENTRY_FIELDS } from '../interfaces/ITestersDbAnalyticsService.js';
import type { GetTestersDbAnalyticsQuery } from '../validators/TestersDbAnalyticsValidators.js';

const NOW = new Date('2027-01-10T06:00:00Z'); // IST "today" = 2027-01-10 - past the Sheet's 2026 year cap.

const u1 = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const u2 = 'aaaaaaaaaaaaaaaaaaaaaaa2';

// Current form values, legacy spellings, blanks, a bare legacy "Dynamic",
// and a createdAt-only (no testDate) entry.
const SEED = [
    { testId: 'TL-1', submittedByUserId: u1, testerName: 'Tester One', testDate: '2027-01-10', createdAt: new Date('2027-01-10T05:00:00Z'),
      typeOfQuestion: 'Weather Dynamic', questionCategory: 'Climate, Weather & Stress Management', channelTested: 'WebApp',
      languageTested: 'English', overallTestStatus: 'Pass', defectSeverity: 'NA', buildVersion: '0.1',
      queryText: 'secret query', submittedByEmail: 'one@example.com', authorsName: 'Author A', testerRemarksNotes: 'notes',
      waResponseTimeMins: '', notificationReceived: 'Received' },
    { testId: 'TL-2', submittedByUserId: u1, testerName: 'Tester One', testDate: '2027-01-05', createdAt: new Date('2027-01-05T05:00:00Z'),
      typeOfQuestion: 'WEATHER DYNAMIC', questionCategory: 'Climate, Weather and Stress Management', channelTested: 'Web App',
      languageTested: 'english', overallTestStatus: 'pass', defectSeverity: 'Nil', buildVersion: '1.0' },
    { testId: 'TL-3', submittedByUserId: u2, testerName: 'Tester Two', testDate: '2026-12-20', createdAt: new Date('2026-12-20T05:00:00Z'),
      typeOfQuestion: 'GDB', questionCategory: 'Weed Management', channelTested: 'WhatsApp', languageTested: 'Hinglish',
      overallTestStatus: 'Fail', defectSeverity: 'Critical', buildVersion: '0.1' },
    { testId: 'TL-4', submittedByUserId: u2, testerName: 'Tester Two', testDate: '2027-01-09', createdAt: new Date('2027-01-09T05:00:00Z'),
      typeOfQuestion: 'Dynamic', questionCategory: 'Plant Protection', channelTested: 'Both', overallTestStatus: 'Partial',
      defectSeverity: 'NIL', buildVersion: ' 1.0 ', waResponseTimeMins: '00:05:00', waOverallTestStatus: 'Pass', webOverallTestStatus: 'Fail' },
    { submittedByUserId: u1, testerName: 'Tester One', createdAt: new Date('2027-01-08T05:00:00Z'),
      typeOfQuestion: 'Static Dynamic', channelTested: 'WhatsApp', overallTestStatus: 'NA', buildVersion: '1.0' },
    { testId: 'TL-6', submittedByUserId: u2, testerName: 'Tester Two', testDate: '', createdAt: new Date('2026-11-01T05:00:00Z'),
      typeOfQuestion: '', channelTested: '', overallTestStatus: '' },
    { testId: 'TL-7', submittedByUserId: u1, testerName: 'Tester One', testDate: '2027-01-02', createdAt: new Date('2027-01-02T05:00:00Z'),
      typeOfQuestion: 'Outreach', channelTested: 'WhatsApp', overallTestStatus: 'Pass', defectSeverity: 'Low', buildVersion: '0.1' },
];

let server: MongoMemoryServer;
let client: MongoClient;
let db: Db;
let stored: Record<string, any>[];

// Provider wrapping the real in-memory collection, recording every find()
// filter and how many documents each find() actually returned.
const findCalls: { filter: unknown; returned: number }[] = [];
function provider(): any {
    return {
        async getCollection(name: string) {
            const col = db.collection(name);
            return {
                aggregate: (pipeline: any[]) => col.aggregate(pipeline),
                find: (filter: any, options?: any) => {
                    const cursor = col.find(filter, options);
                    return {
                        sort: (s: any) => ({
                            toArray: async () => {
                                const docs = await cursor.sort(s).toArray();
                                findCalls.push({ filter, returned: docs.length });
                                return docs;
                            },
                        }),
                        toArray: async () => cursor.toArray(),
                    };
                },
            };
        },
    };
}

const service = () => new TestersDbAnalyticsService(provider());
const ids = (entries: { testId?: string; _id: string }[]) => entries.map((e) => e.testId ?? `(${e._id})`).sort();

beforeAll(async () => {
    server = await MongoMemoryServer.create({ instance: { launchTimeout: 120000 } });
    client = new MongoClient(server.getUri());
    await client.connect();
    db = client.db('testers');
    await db.collection('tester_test_cases').insertMany(SEED.map((s) => ({ ...s })));
    await db.collection('users').insertMany([
        { _id: new ObjectId(u1), firstName: 'Tester', lastName: 'One', role: 'tester' },
        { _id: new ObjectId('aaaaaaaaaaaaaaaaaaaaaaa9'), firstName: 'Idle', lastName: 'Tester', role: 'tester' },
    ]);
    stored = await db.collection('tester_test_cases').find({}).toArray();
}, 180000);

afterAll(async () => {
    await client?.close();
    await server?.stop();
});

describe('TestersDbAnalyticsService.getEntries - raw TesterLogEntry data', () => {
    it('returns stored entries in their TesterLogEntry shape, limited to the analytics fields', async () => {
        const result = await service().getEntries({}, NOW);
        expect(result.success).toBe(true);
        expect(result.totalRecords).toBe(SEED.length);
        expect(result.matchedRecords).toBe(SEED.length);

        const tl4 = result.entries.find((e) => e.testId === 'TL-4')!;
        expect(typeof tl4._id).toBe('string');
        // Stored field names and values, untouched - legacy spellings included.
        expect(tl4).toMatchObject({
            channelTested: 'Both', typeOfQuestion: 'Dynamic', defectSeverity: 'NIL', buildVersion: ' 1.0 ',
            waResponseTimeMins: '00:05:00', waOverallTestStatus: 'Pass', webOverallTestStatus: 'Fail',
        });
        for (const entry of result.entries) {
            for (const key of Object.keys(entry)) expect(DB_ANALYTICS_ENTRY_FIELDS).toContain(key);
            // No Google Sheet column names.
            expect(entry).not.toHaveProperty('Channel Tested');
            expect(entry).not.toHaveProperty('Test ID');
        }
        // Free text / personal details are not projected.
        const tl1 = result.entries.find((e) => e.testId === 'TL-1')! as Record<string, unknown>;
        for (const key of ['queryText', 'submittedByEmail', 'authorsName', 'testerRemarksNotes']) expect(tl1).not.toHaveProperty(key);
        expect(tl1.notificationReceived).toBe('Received');
    });

    it('returns the Step 4 filter options (zero counts, legacy values, roster tester) from a MongoDB aggregation', async () => {
        const result = await service().getEntries({}, NOW);
        const roster = [{ id: u1, name: 'Tester One' }, { id: 'aaaaaaaaaaaaaaaaaaaaaaa9', name: 'Idle Tester' }];
        // Identical to the in-memory builder over every stored entry.
        expect(result.filterOptions).toEqual(buildDbFilterOptions(stored, roster));
        expect(result.filterOptions.fields.channel).toEqual([
            { value: 'WhatsApp', label: 'WhatsApp', count: 3 },
            { value: 'WebApp', label: 'WebApp', count: 2 },
            { value: 'Both', label: 'Both', count: 1 },
        ]);
        expect(result.filterOptions.fields.tester.find((o) => o.value === 'aaaaaaaaaaaaaaaaaaaaaaa9')?.count).toBe(0);
    });
});

describe('TestersDbAnalyticsService.getEntries - filtering in MongoDB', () => {
    const cases: [string, GetTestersDbAnalyticsQuery, string[]][] = [
        ['channel option incl. legacy "Web App"', { channel: 'WebApp' }, ['TL-1', 'TL-2']],
        ['category incl. legacy spelling', { category: 'Climate, Weather & Stress Management' }, ['TL-1', 'TL-2']],
        ['legacy-only category', { category: 'Plant Protection' }, ['TL-4']],
        ['language (case-insensitive)', { language: 'English' }, ['TL-1', 'TL-2']],
        ['status', { status: 'Pass' }, ['TL-1', 'TL-2', 'TL-7']],
        ['severity incl. legacy Nil/NIL', { severity: 'NA' }, ['TL-1', 'TL-2', 'TL-4']],
        ['tester by submittedByUserId', { tester: u2 }, ['TL-3', 'TL-4', 'TL-6']],
        ['build by stored value', { build: '1.0' }, ['(no testId)', 'TL-2', 'TL-4']],
        ['type option', { type: 'Weather Dynamic' }, ['TL-1', 'TL-2']],
        ['Dynamic branch (incl. bare legacy Dynamic)', { typeBranch: 'Dynamic' }, ['(no testId)', 'TL-1', 'TL-2', 'TL-4']],
        ['Dynamic sub-type', { typeBranch: 'Dynamic', dynamicSubTypes: 'Static Dynamic' }, ['(no testId)']],
        ['Static branch', { typeBranch: 'Static' }, ['TL-3', 'TL-7']],
        ['Static sub-types', { typeBranch: 'Static', staticSubTypes: 'GDB,Unique' }, ['TL-3']],
        ['today (testDate, past 2026)', { dateRange: 'today' }, ['TL-1']],
        ['7 days incl. createdAt fallback', { dateRange: '7days' }, ['(no testId)', 'TL-1', 'TL-2', 'TL-4']],
        ['custom range on createdAt fallback', { dateRange: 'custom', customStart: '2026-10-01', customEnd: '2026-11-30' }, ['TL-6']],
        ['custom open start', { dateRange: 'custom', customStart: '2027-01-09' }, ['TL-1', 'TL-4']],
        ['combined filters', { tester: u1, channel: 'WhatsApp', dateRange: '30days' }, ['(no testId)', 'TL-7']],
        ['option with no records', { status: 'Partial', channel: 'WebApp' }, []],
    ];

    it.each(cases)('%s', async (_name, query, expected) => {
        findCalls.length = 0;
        const result = await service().getEntries(query, NOW);
        const got = result.entries.map((e) => e.testId ?? '(no testId)').sort();
        expect(got).toEqual([...expected].sort());

        // Matches Step 4's in-memory filters over every stored entry exactly.
        const selection = selectionFromQuery(query);
        const inMemory = applyDbDateFilter(applyDbNonDateFilters(stored, selection), selection.dateRange, query.customStart, query.customEnd, NOW);
        expect(got).toEqual(inMemory.map((e) => e.testId ?? '(no testId)').sort());

        // The filter ran in MongoDB: only matching documents were loaded.
        expect(findCalls).toHaveLength(1);
        expect(findCalls[0].returned).toBe(expected.length);
        expect(findCalls[0].filter).toHaveProperty('$and');
        expect(result.totalRecords).toBe(SEED.length);
    });

    it('sends no filter at all when nothing is selected', async () => {
        findCalls.length = 0;
        await service().getEntries({ dateRange: 'all', channel: 'all', tester: 'all' }, NOW);
        expect(findCalls[0].filter).toEqual({});
    });
});

describe('buildDbAnalyticsMatch', () => {
    it('matches a tester on submittedByUserId and a build on its exact stored values', () => {
        const match = buildDbAnalyticsMatch(
            selectionFromQuery({ tester: u1, build: '1.0' }),
            {
                tester: [{ value: u1, count: 4 }, { value: u2, count: 3 }],
                build: [{ value: '1.0', count: 2 }, { value: ' 1.0 ', count: 1 }, { value: '0.1', count: 3 }],
            },
            undefined,
            undefined,
            NOW,
        );
        expect(match).toEqual({
            $and: [{ buildVersion: { $in: ['1.0', ' 1.0 '] } }, { submittedByUserId: { $in: [u1] } }],
        });
    });

    it('uses testDate, falling back to createdAt only when testDate is not a date', () => {
        const match = buildDbAnalyticsMatch(selectionFromQuery({ dateRange: 'today' }), {}, undefined, undefined, NOW);
        expect(match).toEqual({
            $and: [
                {
                    $or: [
                        { $and: [{ testDate: { $regex: /^\d{4}-\d{2}-\d{2}/ } }, { testDate: { $gte: '2027-01-10', $lt: '2027-01-11' } }] },
                        {
                            $and: [
                                { testDate: { $not: /^\d{4}-\d{2}-\d{2}/ } },
                                { createdAt: { $gte: new Date('2027-01-10T00:00:00.000Z'), $lt: new Date('2027-01-11T00:00:00.000Z') } },
                            ],
                        },
                    ],
                },
            ],
        });
    });
});

describe('the DB-native path is independent of the Google Sheet pipeline', () => {
    it('TestersDbAnalyticsService imports no Sheet mapper or Sheet calculation module', () => {
        const dir = path.dirname(fileURLToPath(import.meta.url));
        const source = fs.readFileSync(path.join(dir, '../services/TestersDbAnalyticsService.ts'), 'utf8');
        const imports = [...source.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
        // Never called or imported (the file's header comment names it only to say so).
        expect(source).not.toMatch(/mapTesterLogEntryToRecord\s*\(/);
        expect(source).not.toMatch(/import[^;]*mapTesterLogEntryToRecord/);
        expect(imports).not.toContain('./TestersDashboardService.js');
        // Nothing from the Sheet folder - dates come from ../dbAnalytics/dates.
        expect(imports.filter((i) => i.includes('testersDashboard/'))).toEqual([]);
    });
});
