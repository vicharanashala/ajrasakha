import 'reflect-metadata';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';

// The DB-native calculations must not touch the Google Sheet pipeline: every
// Sheet calculation module and the Sheet mapper throw if anything calls them.
const { sheetModuleGuard } = vi.hoisted(() => ({
    sheetModuleGuard: (name: string) => () =>
        new Proxy({}, { get: (_t, prop) => (prop === 'then' ? undefined : () => { throw new Error(`${name}.${String(prop)} must not be used by DB Analytics`); }) }),
}));
vi.mock('../testersDashboard/kpis.js', sheetModuleGuard('testersDashboard/kpis'));
vi.mock('../testersDashboard/diagnostics.js', sheetModuleGuard('testersDashboard/diagnostics'));
vi.mock('../testersDashboard/chartData.js', sheetModuleGuard('testersDashboard/chartData'));
vi.mock('../testersDashboard/filters.js', sheetModuleGuard('testersDashboard/filters'));
vi.mock('../testersDashboard/normalize.js', sheetModuleGuard('testersDashboard/normalize'));
vi.mock('../services/TestersDashboardService.js', sheetModuleGuard('TestersDashboardService'));

import * as values from '../dbAnalytics/values.js';
import {
    calculateDbKpis,
    criticalFailureCategories,
    passFail,
    retrievalRate,
    scientificAccuracyRate,
    trustScore,
} from '../dbAnalytics/kpis.js';
import { calculateDbChartData } from '../dbAnalytics/chartData.js';
import { calculateDbSummary } from '../dbAnalytics/summary.js';
import { dbPreviousPeriodWindow } from '../dbAnalytics/dates.js';
import { buildDbFilterOptions } from '../services/dbFilterOptions.js';
import { TestersDbAnalyticsService } from '../services/TestersDbAnalyticsService.js';
import type { Entry } from '../dbAnalytics/values.js';

let seq = 0;
const entry = (fields: Partial<Entry>): Entry => ({ _id: `mongo-${++seq}`, ...fields });

const emptySummary = () =>
    calculateDbSummary({ current: [], previous: null, typeBranch: 'all', totalRecords: 0, filterOptions: buildDbFilterOptions([]), lastSyncedAt: null });

// Every number anywhere in a value is finite (no NaN / Infinity).
function allNumbersFinite(value: unknown): boolean {
    if (typeof value === 'number') return Number.isFinite(value);
    if (Array.isArray(value)) return value.every(allNumbersFinite);
    if (value && typeof value === 'object') return Object.values(value).every(allNumbersFinite);
    return true;
}

describe('1. Test ID comes from the tester-entered testId, never MongoDB _id', () => {
    it('lists failing entries by testId; an entry without one is counted but never listed by _id', () => {
        const entries = [
            entry({ testId: 'TL-0007', answerScientificallyCorrect: 'Incorrect', typeOfQuestion: 'GDB' }),
            entry({ answerScientificallyCorrect: 'Incorrect', typeOfQuestion: 'GDB' }),
            entry({ testId: 'TL-0009', answerScientificallyCorrect: 'Correct', typeOfQuestion: 'GDB' }),
        ];
        const incorrect = criticalFailureCategories(entries).categories.find((c) => c.key === 'incorrect_answer')!;
        expect(incorrect.failureCount).toBe(2);
        expect(incorrect.failureTestIds).toEqual(['TL-0007']);
        const json = JSON.stringify(criticalFailureCategories(entries));
        for (const e of entries) expect(json).not.toContain(e._id);
    });

    it("reports each category's applicable count as entries that recorded its field(s)", () => {
        const cats = criticalFailureCategories([
            entry({ defectSeverity: 'Critical', responseTimeMins: '00:30:00' }),
            entry({ defectSeverity: 'Medium', responseTimeMins: '30:00:00' }),
            entry({ defectSeverity: 'NA' }),
            entry({}),
        ]).categories;
        const byKey = (k: string) => cats.find((c) => c.key === k)!;
        // Medium is recorded but neither a Critical failure nor "no defect".
        expect(byKey('critical_bug')).toMatchObject({ failureCount: 1, successCount: 1, applicableCount: 3 });
        // Every response time is applicable to each SLA band.
        expect(byKey('sla_breach_2hr')).toMatchObject({ failureCount: 0, successCount: 1, applicableCount: 2 });
        expect(byKey('sla_breach_24hr')).toMatchObject({ failureCount: 1, successCount: 0, applicableCount: 2 });
    });

    it('counts distinct failing entries by internal identity, so entries without a testId do not collapse together', () => {
        const entries = [entry({ defectSeverity: 'Critical' }), entry({ defectSeverity: 'Critical' })];
        expect(criticalFailureCategories(entries).distinctFailureRows).toBe(2);
    });
});

describe('2. Dates beyond 2026 are included (no Sheet year cap / start cutoff)', () => {
    it('charts 2027 and pre-2026 days alike, from testDate with a createdAt fallback', () => {
        const chart = calculateDbChartData(
            [
                entry({ testDate: '2027-03-01', overallTestStatus: 'Pass' }),
                entry({ testDate: '2025-12-31' }),
                entry({ createdAt: new Date('2028-01-02T10:00:00Z') as any }),
            ],
            'all',
        );
        expect(chart.scoreTrend.map((p) => p.date)).toEqual(['2025-12-31', '2027-03-01', '2028-01-02']);
    });

    it('computes previous windows across the year boundary', () => {
        const now = new Date('2027-01-03T06:00:00Z');
        expect(dbPreviousPeriodWindow('7days', undefined, undefined, now)).toEqual({ start: '2026-12-21', end: '2026-12-27' });
    });
});

describe('3/4. Current Tester UI values and legacy spellings are recognized', () => {
    const cases: [string, (raw: string) => unknown, string, unknown][] = [
        ['source link', (v) => values.sourceLinks(entry({ correctSourceLinksProvided: v })), 'Correct link provided', 'correct'],
        ['source link', (v) => values.sourceLinks(entry({ correctSourceLinksProvided: v })), 'Incorrect Link provided', 'incorrect'],
        ['source link', (v) => values.sourceLinks(entry({ correctSourceLinksProvided: v })), 'Link not provided', 'incorrect'],
        ['source link', (v) => values.sourceLinks(entry({ correctSourceLinksProvided: v })), 'Link not accessible', 'incorrect'],
        ['source link', (v) => values.sourceLinks(entry({ correctSourceLinksProvided: v })), 'NA', null],
        ['source link (legacy)', (v) => values.sourceLinks(entry({ correctSourceLinksProvided: v })), 'Yes', 'correct'],
        ['notification', values.notificationReceived, 'Received', 'received'],
        ['notification', values.notificationReceived, 'Not Received', 'notreceived'],
        ['notification', values.notificationReceived, 'NA', null],
        ['notification (legacy)', values.notificationReceived, 'Received on Time', 'received'],
        ['notification (legacy)', values.notificationReceived, 'Received Late', 'received'],
        ['notification (legacy)', values.notificationReceived, 'Yes', 'received'],
        ['same thread', (v) => values.notificationSameThread(entry({ notificationOnSameThread: v })), 'Yes - on same thread', 'yes'],
        ['same thread', (v) => values.notificationSameThread(entry({ notificationOnSameThread: v })), 'No - on Different Thread', 'no'],
        ['same thread', (v) => values.notificationSameThread(entry({ notificationOnSameThread: v })), 'Notification not received', null],
        ['linked Q-ID', (v) => values.notificationLinkedQid(entry({ notificationLinkedCorrectQId: v })), 'Incorrect Q-ID', 'no'],
        ['linked Q-ID', (v) => values.notificationLinkedQid(entry({ notificationLinkedCorrectQId: v })), 'Q-ID missing', 'no'],
        ['scientific', (v) => values.scientificAccuracy(entry({ answerScientificallyCorrect: v })), 'Correct', 'correct'],
        ['scientific', (v) => values.scientificAccuracy(entry({ answerScientificallyCorrect: v })), 'Incorrect', 'incorrect'],
        ['scientific', (v) => values.scientificAccuracy(entry({ answerScientificallyCorrect: v })), 'NA', null],
        ['voice input quality', values.voiceInputQuality, 'Correct', 'good'],
        ['voice input quality', values.voiceInputQuality, 'Error Displayed', 'bad'],
        ['voice input quality (legacy)', values.voiceInputQuality, 'Clear', 'good'],
        ['voice output quality', values.voiceOutputQuality, 'Clear', 'good'],
        ['voice output quality', values.voiceOutputQuality, 'Unclear', 'bad'],
        ['voice output quality', values.voiceOutputQuality, 'Error Displayed', 'bad'],
        ['answer match', (v) => values.answerMatch(entry({ whatsappVsWebAnswerMatch: v })), 'Proper Match', 'match'],
        ['answer match', (v) => values.answerMatch(entry({ whatsappVsWebAnswerMatch: v })), 'Partial Match', 'partial'],
        ['answer match', (v) => values.answerMatch(entry({ whatsappVsWebAnswerMatch: v })), 'Mismatch', 'mismatch'],
        ['answer match', (v) => values.answerMatch(entry({ whatsappVsWebAnswerMatch: v })), 'NA', null],
        ['severity', (v) => values.defectSeverity(entry({ defectSeverity: v })), 'High', 'High'],
        ['severity', (v) => values.defectSeverity(entry({ defectSeverity: v })), 'NA', 'NA'],
        ['severity (legacy)', (v) => values.defectSeverity(entry({ defectSeverity: v })), 'NIL', 'NA'],
        ['framed (legacy)', (v) => values.questionFramed(entry({ questionCorrectlyFramed: v })), 'Well Framed', 'yes'],
        ['framed', (v) => values.questionFramed(entry({ questionCorrectlyFramed: v })), 'Partially Correct', 'partial'],
        ['disclaimer', (v) => values.disclaimer120(entry({ msg120MinShownToUser: v })), 'Received', 'received'],
        ['disclaimer (legacy)', (v) => values.disclaimer120(entry({ msg120MinShownToUser: v })), 'NO', 'notreceived'],
        ['tagging (legacy)', (v) => values.duplicateTagging(entry({ tagging: v })), 'Tagged as Duplicate', 'correct'],
        ['tagging', (v) => values.duplicateTagging(entry({ tagging: v })), 'Wrongly tagged as duplicate', 'wrong'],
        ['tagging (not a duplicate outcome)', (v) => values.duplicateTagging(entry({ tagging: v })), 'Correctly tagged as dynamic', null],
        ['status', (v) => values.overallStatus(entry({ overallTestStatus: v })), 'pass', 'Pass'],
    ];
    it.each(cases)('%s: %s -> %s', (_name, fn, raw, expected) => {
        expect(fn(raw)).toBe(expected);
    });

    it('treats Acceptable translation as passing (isolated rule), Not Acceptable as failing', () => {
        expect(values.TRANSLATION_PASSING_OUTCOMES.has('acceptable')).toBe(true);
        expect(values.translationPass(entry({ translationQuality: 'Acceptable' }))).toBe(true);
        expect(values.translationPass(entry({ translationQuality: 'Good' }))).toBe(true);
        expect(values.translationPass(entry({ translationQuality: 'Not Acceptable' }))).toBe(false);
        expect(values.translationPass(entry({ translationQuality: 'NIL' }))).toBeNull();
    });

    it('reads Source Links from current options - a correct link is never scored as a failure', () => {
        const trust = trustScore([entry({ correctSourceLinksProvided: 'Correct link provided' }), entry({ correctSourceLinksProvided: 'Link not accessible' })], 'all');
        expect(trust.breakdown.S_lnk).toBe(50);
    });

    it('keeps Static Dynamic and bare legacy Dynamic in the Dynamic branch', () => {
        const kpis = calculateDbKpis(
            [entry({ typeOfQuestion: 'Static Dynamic', answerScientificallyCorrect: 'Correct' }), entry({ typeOfQuestion: 'Dynamic', answerScientificallyCorrect: 'Incorrect' })],
            'all',
        );
        expect(kpis.scientificAccuracyApplicableCount).toBe(2);
    });
});

describe('5/6. Removed DB-save fields are not required; Retrieval Accuracy replaces them', () => {
    it('has no categories or health metrics built on questionSavedInDb / answerSavedInDb / qIdConsistentAcrossSystems', () => {
        const kpis = calculateDbKpis([entry({ overallTestStatus: 'Pass' })], 'all');
        const keys = kpis.criticalFailureCategories.categories.map((c) => c.key);
        expect(keys).not.toContain('db_failure');
        expect(keys).not.toContain('duplicate_qid');
        expect(keys).toContain('retrieval_failure');
        expect(keys).toContain('duplicate_tagging');
        const buckets = kpis.releaseHealthBreakdown.buckets.map((b) => b.key);
        expect(buckets).not.toContain('data_integrity_persistence');
        expect(buckets).toContain('retrieval_tagging_integrity');
    });

    it('ignores legacy DB-save values entirely', () => {
        const withLegacy = calculateDbKpis([entry({ overallTestStatus: 'Pass', questionSavedInDb: 'Not Saved', answerSavedInDb: 'Not Saved', qIdConsistentAcrossSystems: 'Wrongly Identified as duplicate' })], 'all');
        const without = calculateDbKpis([entry({ overallTestStatus: 'Pass' })], 'all');
        expect(withLegacy).toEqual(without);
    });

    it('scores Retrieval Accuracy from its current options', () => {
        const r = retrievalRate([
            entry({ retrievalAccuracy: 'Correct Retrieval' }),
            entry({ retrievalAccuracy: 'Incorrect Retrieval' }),
            entry({ retrievalAccuracy: 'No Retrieval' }),
            entry({ retrievalAccuracy: 'Correct Retrieval' }),
        ]);
        expect(r).toEqual({ value: 50, numerator: 2, applicable: 4 });
    });

    it('does not treat missing Retrieval Accuracy as a failure', () => {
        const kpis = calculateDbKpis([entry({ overallTestStatus: 'Pass' }), entry({ overallTestStatus: 'Pass' })], 'all');
        const retrieval = kpis.criticalFailureCategories.categories.find((c) => c.key === 'retrieval_failure')!;
        expect(retrieval).toMatchObject({ failureCount: 0, successCount: 0, applicableCount: 0 });
        const bucket = kpis.releaseHealthBreakdown.buckets.find((b) => b.key === 'retrieval_tagging_integrity')!;
        expect(bucket).toMatchObject({ score: 0, hasData: false });
        // A bucket with no data is left out of Release Health, not scored 0.
        const otherBuckets = kpis.releaseHealthBreakdown.buckets.filter((b) => b.hasData);
        expect(otherBuckets.length).toBeGreaterThan(0);
        expect(kpis.releaseHealth).toBeGreaterThan(0);
    });
});

describe('7. No-applicable-data rule', () => {
    it('returns 0 (never NaN/Infinity) everywhere when there are no entries', () => {
        const summary = emptySummary();
        expect(allNumbersFinite(summary)).toBe(true);
        expect(summary.kpis).toMatchObject({ N: 0, passRate: 0, failRate: 0, trustScore: 0, experienceScore: 0, releaseHealth: 0, scientificAccuracyAllRows: 0 });
        expect(summary.kpis.trustBreakdown.A_dom).toBeNull();
        expect(summary.chartData.scoreTrend).toEqual([]);
        expect(summary.diagnostics.weakestModule).toBe('None');
    });

    it('leaves components without data out of composite scores instead of scoring them 0', () => {
        // Only Scientific Accuracy has data (100%) - the other Trust Score
        // parts are not applicable, so Trust Score is 100, not 25.
        const trust = trustScore([entry({ typeOfQuestion: 'GDB', answerScientificallyCorrect: 'Correct' })], 'all');
        expect(trust.score).toBe(100);
        expect(trust.breakdown).toMatchObject({ A_sci: 100, S_lnk: 0, Q_frm: 0, Q_trn: 0, S_sla: 0, A_dom: null });
    });

    it('does not count blank or unrecognized values as failures', () => {
        const r = scientificAccuracyRate([entry({ typeOfQuestion: 'GDB', answerScientificallyCorrect: '' }), entry({ typeOfQuestion: 'GDB', answerScientificallyCorrect: 'unclear??' })]);
        expect(r).toEqual({ value: 0, numerator: 0, applicable: 0 });
    });
});

describe('8. DB-native Pass/Fail rule (Overall Test Status)', () => {
    it('reproduces the staging distribution: 13 Pass / 2 Fail / 5 blank -> 87% / 13%', () => {
        const entries = [
            ...Array.from({ length: 13 }, () => entry({ overallTestStatus: 'Pass', defectSeverity: 'Critical' })),
            ...Array.from({ length: 2 }, () => entry({ overallTestStatus: 'Fail' })),
            ...Array.from({ length: 4 }, () => entry({})),
            entry({ overallTestStatus: '' }),
        ];
        expect(passFail(entries)).toEqual({ passed: 13, failed: 2, partial: 0, recorded: 15, passRate: 87, failRate: 13 });
        // Critical-failure categories (here: Critical severity on Pass entries)
        // do not turn a Pass into a Fail - unlike the Google Sheet rule.
        const kpis = calculateDbKpis(entries, 'all');
        expect(kpis).toMatchObject({ totalPassed: 13, totalFailed: 2, passRate: 87, failRate: 13 });
    });

    it('counts Partial and NA as recorded but neither passed nor failed', () => {
        const pf = passFail([entry({ overallTestStatus: 'Pass' }), entry({ overallTestStatus: 'Partial' }), entry({ overallTestStatus: 'NA' }), entry({ overallTestStatus: 'Fail' })]);
        expect(pf).toEqual({ passed: 1, failed: 1, partial: 1, recorded: 4, passRate: 25, failRate: 25 });
    });
});

describe('9. Previous period window', () => {
    const now = new Date('2026-10-06T06:00:00Z'); // IST today = 2026-10-06
    it.each([
        ['today', undefined, undefined, { start: '2026-10-05', end: '2026-10-05' }],
        ['7days', undefined, undefined, { start: '2026-09-23', end: '2026-09-29' }],
        ['30days', undefined, undefined, { start: '2026-08-08', end: '2026-09-06' }],
        ['custom', '2026-09-10', '2026-09-19', { start: '2026-08-31', end: '2026-09-09' }],
        ['custom', '2026-09-10', undefined, null],
        ['all', undefined, undefined, null],
    ])('%s %s..%s', (range, start, end, expected) => {
        expect(dbPreviousPeriodWindow(range as string, start as string | undefined, end as string | undefined, now)).toEqual(expected);
    });
});

describe('10. Current and previous periods are calculated independently (MongoDB)', () => {
    let server: MongoMemoryServer;
    let client: MongoClient;
    let db: Db;
    const now = new Date('2027-02-10T06:00:00Z'); // past 2026 on purpose

    beforeAll(async () => {
        server = await MongoMemoryServer.create({ instance: { launchTimeout: 120000 } });
        client = new MongoClient(server.getUri());
        await client.connect();
        db = client.db('dbanalytics');
        await db.collection('tester_test_cases').insertMany([
            // Current 7 days (2027-02-04..10): 3 Pass, all WebApp.
            ...['2027-02-10', '2027-02-08', '2027-02-04'].map((d, i) => ({ testId: `C-${i}`, testDate: d, overallTestStatus: 'Pass', channelTested: 'WebApp', responseTimeMins: '00:10:00' })),
            // Previous 7 days (2027-01-28..02-03): 1 Pass, 3 Fail.
            ...['2027-02-03', '2027-02-01', '2027-01-30', '2027-01-28'].map((d, i) => ({ testId: `P-${i}`, testDate: d, overallTestStatus: i === 0 ? 'Pass' : 'Fail', channelTested: 'WebApp', responseTimeMins: '01:00:00' })),
            // Outside both windows, and a WhatsApp entry the channel filter excludes.
            { testId: 'OLD', testDate: '2027-01-01', overallTestStatus: 'Fail', channelTested: 'WebApp' },
            { testId: 'WA', testDate: '2027-02-09', overallTestStatus: 'Fail', channelTested: 'WhatsApp' },
        ]);
    }, 180000);

    afterAll(async () => {
        await client?.close();
        await server?.stop();
    });

    const provider = () => ({ getCollection: async (name: string) => db.collection(name) });

    it('fetches each period with its own query and calculates it on its own entries', async () => {
        const result = await new TestersDbAnalyticsService(provider() as any).getSummary({ dateRange: '7days', channel: 'WebApp' }, now);
        expect(result.success).toBe(true);
        expect(result.calculation).toBe('db-native');
        expect(result.kpis).toMatchObject({ N: 3, totalPassed: 3, totalFailed: 0, passRate: 100, avgResponseMinutes: 10 });
        expect(result.previousPeriodStats).toMatchObject({
            totalTests: 4, passRate: 25, failRate: 75, avgResponseMinutes: 60, rangeLabel: '2027-01-28 to 2027-02-03',
        });
        expect(result.chartData.scoreTrend.map((p) => p.date)).toEqual(['2027-02-04', '2027-02-08', '2027-02-10']);
        expect(result.totalRecords).toBe(9);
    });

    it('has no previous period for All Dates', async () => {
        const result = await new TestersDbAnalyticsService(provider() as any).getSummary({}, now);
        expect(result.previousPeriodStats).toBeNull();
        expect(result.kpis.N).toBe(9);
    });
});

describe('11/12. DB calculations are independent of the Google Sheet pipeline', () => {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const files = ['dbAnalytics/values.ts', 'dbAnalytics/kpis.ts', 'dbAnalytics/diagnostics.ts', 'dbAnalytics/chartData.ts', 'dbAnalytics/summary.ts', 'dbAnalytics/dates.ts', 'dbAnalytics/types.ts', 'services/TestersDbAnalyticsService.ts', 'services/dbFilterOptions.ts'];

    it.each(files)('%s imports no Sheet module and never calls mapTesterLogEntryToRecord', (file) => {
        const source = fs.readFileSync(path.join(dir, '..', file), 'utf8');
        const imports = [...source.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
        expect(imports.filter((i) => i.includes('testersDashboard/'))).toEqual([]);
        expect(imports).not.toContain('./TestersDashboardService.js');
        expect(imports).not.toContain('../services/TestersDashboardService.js');
        expect(source).not.toMatch(/mapTesterLogEntryToRecord\s*\(/);
    });

    it('runs end to end with every Sheet module replaced by a throwing guard', () => {
        const summary = calculateDbSummary({
            current: [entry({ testId: 'T', testDate: '2027-01-01', overallTestStatus: 'Pass', typeOfQuestion: 'Weather Dynamic', weatherQAnsweredCorrectly: 'Yes' })],
            previous: { entries: [entry({ overallTestStatus: 'Fail' })], window: { start: '2026-12-31', end: '2026-12-31' } },
            typeBranch: 'all',
            totalRecords: 2,
            filterOptions: buildDbFilterOptions([]),
            lastSyncedAt: null,
        });
        expect(summary.kpis.trustBreakdown.A_dom).toBe(100);
        expect(summary.previousPeriodStats?.failRate).toBe(100);
    });
});
