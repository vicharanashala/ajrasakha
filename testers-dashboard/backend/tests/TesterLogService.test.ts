import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';
import { TesterLogService, incrementTestId } from '../services/TesterLogService.js';
import { getTodayIST } from '../testersDashboard/normalize.js';

describe('TesterLogService date filtering', () => {
    let service: TesterLogService;
    let mockFind: any;
    let mockSort: any;
    let mockSkip: any;
    let mockLimit: any;
    let mockToArray: any;
    let mockCountDocuments: any;
    let mockAggregate: any;
    let mockAggregateToArray: any;
    let mockCollection: any;
    let mockUsersFind: any;
    let mockUsersToArray: any;
    let mockUsersCollection: any;
    let mockDb: any;

    beforeEach(() => {
        mockToArray = vi.fn().mockResolvedValue([]);
        mockLimit = vi.fn().mockReturnValue({ toArray: mockToArray });
        // sort() feeds both the paginated chain (getAllEntries: sort->skip->
        // limit->toArray) and the unpaginated one (exportEntries: sort->
        // toArray directly) - both need to work off the same mock.
        mockSkip = vi.fn().mockReturnValue({ limit: mockLimit });
        mockSort = vi.fn().mockReturnValue({ skip: mockSkip, toArray: mockToArray, limit: mockLimit });
        // getQuestionTypeSummary calls find(filter).toArray() directly, with
        // no sort/skip/limit chain - toArray needs to be reachable straight
        // off find()'s return too, same as a real MongoDB cursor supports
        // both call styles.
        mockFind = vi.fn().mockReturnValue({ sort: mockSort, toArray: mockToArray });
        mockCountDocuments = vi.fn().mockResolvedValue(0);
        mockAggregateToArray = vi.fn().mockResolvedValue([]);
        mockAggregate = vi.fn().mockReturnValue({ toArray: mockAggregateToArray });

        mockCollection = {
            find: mockFind,
            countDocuments: mockCountDocuments,
            aggregate: mockAggregate,
            insertOne: vi.fn(),
        };

        // Separate mock for the 'users' collection (getActiveTesters) -
        // defaults to an empty active-tester roster unless a test overrides
        // it, kept independent of mockCollection/mockToArray so a
        // getQuestionTypeSummary test can control the entries result and
        // the active-tester-roster result separately, the way 2 distinct
        // real MongoDB collections would never share a cursor.
        mockUsersToArray = vi.fn().mockResolvedValue([]);
        mockUsersFind = vi.fn().mockReturnValue({ toArray: mockUsersToArray });
        mockUsersCollection = { find: mockUsersFind };

        const mockCountersCollection = {
            findOne: vi.fn().mockResolvedValue({ _id: 'test_case_id', seq: 1, prefix: 'TL-', padLen: 4 }),
            findOneAndUpdate: vi.fn().mockResolvedValue({ seq: 2, prefix: 'TL-', padLen: 4 }),
            insertOne: vi.fn().mockResolvedValue({}),
            updateOne: vi.fn().mockResolvedValue({}),
        };

        mockDb = {
            getCollection: vi.fn((name: string) => {
                if (name === 'users') return Promise.resolve(mockUsersCollection);
                if (name === 'tester_log_counters') return Promise.resolve(mockCountersCollection);
                return Promise.resolve(mockCollection);
            }),
        };

        service = new TesterLogService(mockDb);
    });

    it('queries without date filter when no dates provided', async () => {
        await service.getMyEntries('user-1', 1, 20);

        expect(mockFind).toHaveBeenCalledWith({ submittedByUserId: 'user-1' });
        expect(mockCountDocuments).toHaveBeenCalledWith({ submittedByUserId: 'user-1' });
    });

    it('filters by testDate range by default', async () => {
        await service.getMyEntries('user-1', 1, 20, '2026-09-10', '2026-09-15');

        const expectedFilter = {
            submittedByUserId: 'user-1',
            $or: [
                { testDate: { $gte: '2026-09-10', $lte: '2026-09-15' } },
                {
                    $and: [
                        { testDate: { $in: [null, ''] } },
                        {
                            createdAt: {
                                $gte: new Date('2026-09-10T00:00:00.000Z'),
                                $lte: new Date('2026-09-15T23:59:59.999Z'),
                            },
                        },
                    ],
                },
            ],
        };

        expect(mockFind).toHaveBeenCalledWith(expectedFilter);
        expect(mockCountDocuments).toHaveBeenCalledWith(expectedFilter);
    });

    it('filters specifically by createdAt when dateField is createdAt', async () => {
        await service.getMyEntries('user-1', 1, 20, '2026-09-12', '2026-09-12', 'createdAt');

        const expectedFilter = {
            submittedByUserId: 'user-1',
            createdAt: {
                $gte: new Date('2026-09-12T00:00:00.000Z'),
                $lte: new Date('2026-09-12T23:59:59.999Z'),
            },
        };

        expect(mockFind).toHaveBeenCalledWith(expectedFilter);
        expect(mockCountDocuments).toHaveBeenCalledWith(expectedFilter);
    });

    it('applies date filter in getAllEntries as well', async () => {
        await service.getAllEntries(1, 20, 'tester-abc', '2026-09-01', '2026-09-07');

        const callArg = mockFind.mock.calls[0][0];
        expect(callArg.submittedByUserId).toBe('tester-abc');
        expect(callArg.$or).toBeDefined();
        expect(callArg.$or[0].testDate).toEqual({ $gte: '2026-09-01', $lte: '2026-09-07' });
    });

    it('applies the 4 dropdown-backed filters in getAllEntries by exact match', async () => {
        await service.getAllEntries(
            1, 20, 'tester-abc', undefined, undefined, undefined,
            'GDB', 'WhatsApp', 'Fail', 'Critical',
        );

        expect(mockFind).toHaveBeenCalledWith({
            submittedByUserId: 'tester-abc',
            typeOfQuestion: 'GDB',
            channelTested: 'WhatsApp',
            overallTestStatus: 'Fail',
            defectSeverity: 'Critical',
        });
    });

    describe('getTesterOptions', () => {
        it('groups by submittedByUserId, sorted by createdAt desc so $first is the most recent name', async () => {
            mockAggregateToArray.mockResolvedValueOnce([
                { _id: 'user-1', testerName: 'Alice' },
                { _id: 'user-2', testerName: 'Bob' },
            ]);

            const options = await service.getTesterOptions();

            expect(mockAggregate).toHaveBeenCalledWith([
                { $sort: { createdAt: -1 } },
                { $group: { _id: '$submittedByUserId', testerName: { $first: '$testerName' } } },
                { $sort: { testerName: 1 } },
            ]);
            expect(options).toEqual([
                { id: 'user-1', name: 'Alice' },
                { id: 'user-2', name: 'Bob' },
            ]);
        });

        it('falls back to the id when testerName is missing', async () => {
            mockAggregateToArray.mockResolvedValueOnce([{ _id: 'user-3', testerName: null }]);

            const options = await service.getTesterOptions();

            expect(options).toEqual([{ id: 'user-3', name: 'user-3' }]);
        });
    });

    describe('getSummary', () => {
        it('computes passRate from status-recorded entries, ignoring any overallTestStatus filter', async () => {
            // Call order inside getSummary's Promise.all: totalEntries,
            // entriesInRange, passCount, statusRecordedCount.
            mockCountDocuments
                .mockResolvedValueOnce(50) // totalEntries
                .mockResolvedValueOnce(20) // entriesInRange (scoped to overallTestStatus: 'Fail' per this call)
                .mockResolvedValueOnce(12) // passCount (ignores the Fail filter)
                .mockResolvedValueOnce(16); // statusRecordedCount

            const summary = await service.getSummary('tester-abc', undefined, undefined, undefined, undefined, undefined, 'Fail');

            expect(summary.totalEntries).toBe(50);
            expect(summary.entriesInRange).toBe(20);
            expect(summary.passCount).toBe(12);
            expect(summary.statusRecordedCount).toBe(16);
            expect(summary.passRate).toBe(75); // 12/16 * 100

            // entriesInRange keeps the caller's overallTestStatus filter...
            const entriesInRangeFilter = mockCountDocuments.mock.calls[1][0];
            expect(entriesInRangeFilter.overallTestStatus).toBe('Fail');
            // ...but the passRate-scoped calls (index 2 and 3) do not.
            const passCountFilter = mockCountDocuments.mock.calls[2][0];
            expect(passCountFilter.overallTestStatus).toBe('Pass');
            const statusRecordedFilter = mockCountDocuments.mock.calls[3][0];
            expect(statusRecordedFilter.overallTestStatus).toEqual({ $nin: [null, ''] });
        });

        it('returns null passRate when nothing in scope has a status recorded', async () => {
            mockCountDocuments
                .mockResolvedValueOnce(5)
                .mockResolvedValueOnce(5)
                .mockResolvedValueOnce(0)
                .mockResolvedValueOnce(0);

            const summary = await service.getSummary();

            expect(summary.passRate).toBeNull();
        });
    });

    describe('getQuestionTypeSummary', () => {
        // Day 1 (2026-09-01): Alice - Unique/WebApp, GDB/WhatsApp
        // Day 2 (2026-09-02): Alice - Weather Dynamic/Both, Dynamic (no
        //   sub-type)/WebApp - the bare "Dynamic" row has no target-sheet
        //   category and must be excluded from every count.
        //   Bob (user-2) - Outreach/WhatsApp, same day.
        const entries = [
            { submittedByUserId: 'user-1', testerName: 'Alice', testDate: '2026-09-01', typeOfQuestion: 'Unique', channelTested: 'WebApp', createdAt: new Date('2026-09-01T09:00:00Z') },
            { submittedByUserId: 'user-1', testerName: 'Alice', testDate: '2026-09-01', typeOfQuestion: 'GDB', channelTested: 'WhatsApp', createdAt: new Date('2026-09-01T10:00:00Z') },
            { submittedByUserId: 'user-1', testerName: 'Alice', testDate: '2026-09-02', typeOfQuestion: 'Weather Dynamic', channelTested: 'Both', createdAt: new Date('2026-09-02T09:00:00Z') },
            { submittedByUserId: 'user-1', testerName: 'Alice', testDate: '2026-09-02', typeOfQuestion: 'Dynamic', channelTested: 'WebApp', createdAt: new Date('2026-09-02T09:30:00Z') },
            { submittedByUserId: 'user-2', testerName: 'Bob', testDate: '2026-09-02', typeOfQuestion: 'Outreach', channelTested: 'WhatsApp', createdAt: new Date('2026-09-02T09:00:00Z') },
        ];
        // Same as the mock does for every other method here (see the top of
        // this file), find()'s filter argument doesn't actually filter the
        // stubbed result - so a single-tester test must hand mockToArray
        // only that tester's own rows, the way a real MongoDB query already
        // scoped to submittedByUserId would.
        const aliceEntries = entries.slice(0, 4);

        it('the daily target table sums to the business sheet\'s numbers (54 total / 27 Web App / 27 WhatsApp) for a 1-calendar-day range', async () => {
            mockToArray.mockResolvedValueOnce([
                { submittedByUserId: 'user-1', testerName: 'Alice', testDate: '2026-09-01', typeOfQuestion: 'Unique', channelTested: 'WebApp', createdAt: new Date() },
            ]);

            // 1 calendar day -> round(1 * 6/7) = 1 working day -> the full
            // daily rate, same numbers the business sheet defines.
            const result = await service.getQuestionTypeSummary('user-1', '2026-09-01', '2026-09-01');

            expect(result.workingDays).toBe(1);
            expect(result.byType.map((r) => [r.key, r.target])).toEqual([
                ['unique', 8], ['gdb', 8], ['outreach', 11],
                ['weather', 19], ['scheme', 6], ['mandi', 2],
                ['total', 54],
            ]);
            expect(result.webApp.target).toBe(27);
            expect(result.whatsApp.target).toBe(27);
        });

        // Pins the 3 worked examples from the spec exactly: working days =
        // calendar days × 6÷7 rounded, target = 54 × working days. Uses a
        // tester with ZERO matching entries to prove the target comes
        // purely from the date range, never from what (if anything) that
        // tester logged.
        it.each([
            ['2026-09-01', '2026-09-07', 7, 6, 324],
            ['2026-09-01', '2026-09-14', 14, 12, 648],
            ['2026-09-01', '2026-09-30', 30, 26, 1404],
        ])('%s..%s (%i calendar days) -> %i working days -> target %i, even with zero entries logged', async (start, end, _calendarDays, expectedWorkingDays, expectedTarget) => {
            mockToArray.mockResolvedValueOnce([]);

            const result = await service.getQuestionTypeSummary('user-1', start, end);

            expect(result.workingDays).toBe(expectedWorkingDays);
            expect(result.overall.target).toBe(expectedTarget);
            expect(result.overall.actual).toBe(0);
            expect(result.overall.achievementPct).toBe(0);
        });

        it('per-type and per-channel targets scale by working days the same way (Weather = 19 × working days)', async () => {
            mockToArray.mockResolvedValueOnce([]);

            // 7 calendar days -> 6 working days (same as the 324 example above).
            const result = await service.getQuestionTypeSummary('user-1', '2026-09-01', '2026-09-07');

            expect(result.byType.find((r) => r.key === 'weather')!.target).toBe(19 * 6);
            expect(result.byType.find((r) => r.key === 'outreach')!.target).toBe(11 * 6);
            // Web App/WhatsApp rates sum to 27 each (confirmed by the
            // business-sheet test above), even though the individual
            // category splits differ (e.g. Outreach is 6/5, Weather 9/10) -
            // both channel totals scale by the same working-days count.
            expect(result.webApp.target).toBe(27 * 6);
            expect(result.whatsApp.target).toBe(27 * 6);
        });

        it('Today (a 1-day range) uses a target of 54 per tester, regardless of entries', async () => {
            mockToArray.mockResolvedValueOnce([]);

            const result = await service.getQuestionTypeSummary('user-1', '2026-09-01', '2026-09-01');

            expect(result.workingDays).toBe(1);
            expect(result.overall.target).toBe(54);
        });

        it('a bare "Dynamic" row (no Weather/Scheme/Mandi suffix) is excluded from every category and the Total, but the range-based target is unaffected', async () => {
            mockToArray.mockResolvedValueOnce(aliceEntries);

            const result = await service.getQuestionTypeSummary('user-1', '2026-09-01', '2026-09-02');

            const totalActualAcrossCategories = result.byType
                .filter((r) => r.key !== 'total')
                .reduce((sum, r) => sum + r.actual, 0);
            expect(totalActualAcrossCategories).toBe(3); // Unique + GDB + Weather - "Dynamic" excluded
            expect(result.byType.find((r) => r.key === 'total')!.actual).toBe(3);
        });

        it('a "Both" channel entry counts toward both Web App and WhatsApp actuals', async () => {
            mockToArray.mockResolvedValueOnce(aliceEntries);

            const result = await service.getQuestionTypeSummary('user-1', '2026-09-01', '2026-09-02');

            // Web App: Unique (WebApp) + Weather (Both) = 2. The unmapped
            // "Dynamic"/WebApp row is excluded (no target category).
            expect(result.webApp.actual).toBe(2);
            // WhatsApp: GDB (WhatsApp) + Weather (Both) = 2.
            expect(result.whatsApp.actual).toBe(2);
        });

        it('single tester with zero entries in range still gets a real target (0 shown against it, not omitted)', async () => {
            mockToArray.mockResolvedValueOnce([]); // this tester logged nothing in range

            const result = await service.getQuestionTypeSummary('user-3', '2026-09-01', '2026-09-07');

            expect(result.overall.target).toBe(324); // same target a tester who logged something would get
            expect(result.overall.actual).toBe(0);
            expect(result.overall.achievementPct).toBe(0);
        });

        it('does not query the users collection when a single tester is selected (target is formula-only, no roster lookup needed)', async () => {
            mockToArray.mockResolvedValueOnce(aliceEntries);

            await service.getQuestionTypeSummary('user-1', '2026-09-01', '2026-09-02');

            expect(mockUsersFind).not.toHaveBeenCalled();
        });

        it('omits byTester when a single tester is selected', async () => {
            mockToArray.mockResolvedValueOnce(aliceEntries);

            const result = await service.getQuestionTypeSummary('user-1', '2026-09-01', '2026-09-02');

            expect(result.byTester).toBeUndefined();
        });

        it('scopes to submittedByUserId and the date range, same as the other admin endpoints', async () => {
            mockToArray.mockResolvedValueOnce([]);

            await service.getQuestionTypeSummary('user-1', '2026-09-01', '2026-09-02');

            const callArg = mockFind.mock.calls[0][0];
            expect(callArg.submittedByUserId).toBe('user-1');
            expect(callArg.$or[0].testDate).toEqual({ $gte: '2026-09-01', $lte: '2026-09-02' });
        });

        // All Testers - byTester is now sourced from the active tester
        // roster (the 'users' collection, role: 'tester'), unioned with any
        // submittedByUserId that has entries but isn't currently on that
        // roster - see TesterLogService.ts's getActiveTesters/
        // getQuestionTypeSummary comments for why both halves of that union
        // matter.
        describe('All Testers', () => {
            it('includes a tester with zero entries in range, sourced from the active-tester roster (not from entries)', async () => {
                mockToArray.mockResolvedValueOnce(entries); // Alice + Bob logged something
                mockUsersToArray.mockResolvedValueOnce([
                    { _id: 'user-1', firstName: 'Alice' },
                    { _id: 'user-3', firstName: 'Carol' }, // logged nothing - not in `entries` at all
                ]);

                const result = await service.getQuestionTypeSummary(undefined, '2026-09-01', '2026-09-01');

                expect(mockUsersFind).toHaveBeenCalledWith({ role: 'tester', isBlocked: { $ne: true }, status: { $ne: 'in-active' } });
                const carol = result.byTester!.find((t) => t.testerId === 'user-3')!;
                expect(carol).toBeDefined();
                expect(carol.testerName).toBe('Carol');
                expect(carol.actual).toBe(0);
                expect(carol.daysWorked).toBe(0);
                expect(carol.target).toBe(54); // 1-day range -> 1 working day -> same target as everyone else
            });

            it('still includes a tester with real entries who is not on the current active-tester roster (union, not a roster-only list)', async () => {
                mockToArray.mockResolvedValueOnce(entries); // Bob (user-2) has an entry
                mockUsersToArray.mockResolvedValueOnce([{ _id: 'user-1', firstName: 'Alice' }]); // Bob not on the roster

                const result = await service.getQuestionTypeSummary(undefined, '2026-09-01', '2026-09-02');

                expect(result.byTester!.map((t) => t.testerId)).toContain('user-2');
            });

            it('overall/byType targets are the sum of each included tester\'s own working-days-scaled target', async () => {
                // Only the 2026-09-02 rows (find()'s stubbed result stands
                // in for whatever a real date-scoped Mongo query would
                // actually return - see the mock's own comment at the top
                // of this file): Alice's Weather (counted) + bare Dynamic
                // (excluded), and Bob's Outreach.
                mockToArray.mockResolvedValueOnce([entries[2], entries[3], entries[4]]);
                mockUsersToArray.mockResolvedValueOnce([
                    { _id: 'user-1', firstName: 'Alice' },
                    { _id: 'user-3', firstName: 'Carol' },
                ]);
                // testerIds = {user-1, user-3} (roster) ∪ {user-1, user-2} (entries) = 3 testers.

                // 1-day range -> 1 working day -> 54 per tester.
                const result = await service.getQuestionTypeSummary(undefined, '2026-09-02', '2026-09-02');

                expect(result.byTester!.map((t) => [t.testerName, t.target, t.actual]).sort()).toEqual(
                    [['Alice', 54, 1], ['Bob', 54, 1], ['Carol', 54, 0]].sort(),
                );
                expect(result.overall.target).toBe(54 * 3); // each tester's own target, added together
                expect(result.overall.actual).toBe(1 + 1 + 0);

                const outreachRow = result.byType.find((r) => r.key === 'outreach')!;
                expect(outreachRow.target).toBe(11 * 3); // 11 × 1 working day, per each of the 3 testers
                expect(outreachRow.actual).toBe(1); // only Bob logged an Outreach row
            });
        });

        describe('All Time and open-ended ranges', () => {
            // The team's whole testDate span, from the aggregate - wider
            // than any single tester's own entries.
            const teamSpan = { _id: null, first: '2026-09-01', last: '2026-09-07' };

            it('fills a missing range from the whole team\'s earliest/latest testDate, not the selected tester\'s own entries', async () => {
                // Alice only logged on 09-01..09-02 (2 days), but the team
                // spans 09-01..09-07: 7 calendar days -> 6 working days.
                mockToArray.mockResolvedValueOnce(aliceEntries);
                mockAggregateToArray.mockResolvedValueOnce([teamSpan]);

                const result = await service.getQuestionTypeSummary('user-1');

                expect(result.rangeStart).toBe('2026-09-01');
                expect(result.rangeEnd).toBe('2026-09-07');
                expect(result.workingDays).toBe(6);
                expect(result.overall.target).toBe(54 * 6);
                // The span query is team-wide - never scoped to the tester.
                const pipeline = mockAggregate.mock.calls[0][0];
                expect(JSON.stringify(pipeline)).not.toContain('submittedByUserId');
            });

            it('gives a tester the same All Time target alone as in the All Testers table', async () => {
                mockToArray.mockResolvedValueOnce(aliceEntries);
                mockAggregateToArray.mockResolvedValueOnce([teamSpan]);
                const single = await service.getQuestionTypeSummary('user-1');

                mockToArray.mockResolvedValueOnce(entries);
                mockAggregateToArray.mockResolvedValueOnce([teamSpan]);
                mockUsersToArray.mockResolvedValueOnce([{ _id: 'user-1', firstName: 'Alice' }]);
                const all = await service.getQuestionTypeSummary();
                const aliceRow = all.byTester!.find((t) => t.testerId === 'user-1')!;

                expect(all.workingDays).toBe(single.workingDays);
                expect(aliceRow.target).toBe(single.overall.target);
                expect(aliceRow.actual).toBe(single.overall.actual);
                expect(aliceRow.achievementPct).toBe(single.overall.achievementPct);
            });

            it('keeps an explicit start and fills only the missing end', async () => {
                mockToArray.mockResolvedValueOnce([]);
                mockAggregateToArray.mockResolvedValueOnce([teamSpan]);

                const result = await service.getQuestionTypeSummary('user-1', '2026-09-05');

                expect(result.rangeStart).toBe('2026-09-05');
                expect(result.rangeEnd).toBe('2026-09-07');
                expect(result.workingDays).toBe(3); // 3 calendar days -> round(2.57) = 3
            });

            it('does not run the span query when both ends are given', async () => {
                mockToArray.mockResolvedValueOnce([]);

                await service.getQuestionTypeSummary('user-1', '2026-09-01', '2026-09-02');

                expect(mockAggregate).not.toHaveBeenCalled();
            });

            it('zero entries and no date range produces a zero target, not a crash (nothing to derive a range from)', async () => {
                mockToArray.mockResolvedValueOnce([]);

                const result = await service.getQuestionTypeSummary();

                expect(result.workingDays).toBe(0);
                expect(result.rangeStart).toBeNull();
                expect(result.rangeEnd).toBeNull();
                expect(result.overall).toEqual({ target: 0, actual: 0, achievementPct: 0 });
                expect(result.byTester).toEqual([]);
            });
        });

        it('gives a tester the same figures alone as in the All Testers table for the same explicit range', async () => {
            mockToArray.mockResolvedValueOnce(aliceEntries);
            const single = await service.getQuestionTypeSummary('user-1', '2026-09-01', '2026-09-07');

            mockToArray.mockResolvedValueOnce(entries);
            mockUsersToArray.mockResolvedValueOnce([{ _id: 'user-1', firstName: 'Alice' }, { _id: 'user-2', firstName: 'Bob' }]);
            const all = await service.getQuestionTypeSummary(undefined, '2026-09-01', '2026-09-07');
            const aliceRow = all.byTester!.find((t) => t.testerId === 'user-1')!;

            expect(single.headcount).toBe(1);
            expect(all.headcount).toBe(2);
            expect(aliceRow.target).toBe(single.overall.target);
            expect(aliceRow.actual).toBe(single.overall.actual);
            expect(aliceRow.achievementPct).toBe(single.overall.achievementPct);
            for (const row of single.byType.filter((r) => r.key !== 'total')) {
                expect(aliceRow.counts[row.key as keyof typeof aliceRow.counts]).toBe(row.actual);
            }
            // All Testers totals are headcount × the per-tester targets.
            expect(all.overall.target).toBe(single.overall.target * 2);
            expect(all.webApp.target).toBe(single.webApp.target * 2);
        });

        it('reports entries outside the 6 categories (e.g. historical bare "Dynamic") as uncategorized instead of dropping them silently', async () => {
            mockToArray.mockResolvedValueOnce(aliceEntries);

            const result = await service.getQuestionTypeSummary('user-1', '2026-09-01', '2026-09-02');

            expect(result.uncategorizedCount).toBe(1);
        });

        it('returns the per-tester daily targets from the Admin Summary target model', async () => {
            mockToArray.mockResolvedValueOnce([]);

            const result = await service.getQuestionTypeSummary('user-1', '2026-09-01', '2026-09-01');

            expect(result.dailyTargetsPerTester).toEqual({ workingMinutes: 450, total: 54, webApp: 27, whatsApp: 27 });
        });

        it('splits each category\'s target and actual by channel per the Excel, and the Total row / channel cards are their sums', async () => {
            mockToArray.mockResolvedValueOnce(entries);
            mockUsersToArray.mockResolvedValueOnce([{ _id: 'user-1', firstName: 'Alice' }, { _id: 'user-2', firstName: 'Bob' }]);

            // 1 day, 2 testers.
            const result = await service.getQuestionTypeSummary(undefined, '2026-09-01', '2026-09-01');
            const row = (key: string) => result.byType.find((r) => r.key === key)!;

            expect(row('outreach').webApp.target).toBe(6 * 2);
            expect(row('outreach').whatsApp.target).toBe(5 * 2);
            expect(row('weather').webApp.target).toBe(9 * 2);
            expect(row('weather').whatsApp.target).toBe(10 * 2);
            // Unique/WebApp, GDB/WhatsApp, Weather/Both, Outreach/WhatsApp.
            expect(row('unique').webApp.actual).toBe(1);
            expect(row('gdb').whatsApp.actual).toBe(1);
            expect(row('weather').webApp.actual).toBe(1);
            expect(row('weather').whatsApp.actual).toBe(1);
            expect(row('outreach').whatsApp.actual).toBe(1);

            const categories = result.byType.filter((r) => r.key !== 'total');
            const sum = (pick: (r: typeof categories[number]) => number) => categories.reduce((s, r) => s + pick(r), 0);
            expect(row('total').target).toBe(sum((r) => r.target));
            expect(row('total').actual).toBe(sum((r) => r.actual));
            expect(result.overall.actual).toBe(4);
            expect(result.webApp).toEqual(row('total').webApp);
            expect(result.whatsApp).toEqual(row('total').whatsApp);
            expect(result.webApp).toEqual({ target: 54, actual: 2, achievementPct: (2 / 54) * 100 });
            expect(result.whatsApp).toEqual({ target: 54, actual: 3, achievementPct: (3 / 54) * 100 });
        });
    });

    describe('exportEntries', () => {
        const sampleEntry = {
            _id: { toString: () => 'abc123' },
            testId: 'T-100',
            sprintCycle: 'Sprint 7',
            testDate: '2026-09-10',
            testerName: 'Alice',
            typeOfQuestion: 'GDB',
            overallTestStatus: 'Pass',
            defectSeverity: 'Nil',
            createdAt: new Date('2026-09-10T12:00:00.000Z'),
        };

        it('produces a readable XLSX workbook with every export column as a header, not just the review table\'s 10', async () => {
            mockToArray.mockResolvedValueOnce([sampleEntry]);

            const result = await service.exportEntries();

            expect(result.contentType).toBe(
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            );
            expect(result.filename).toMatch(/^tester-entries-\d{4}-\d{2}-\d{2}\.xlsx$/);

            const wb = XLSX.read(result.buffer, { type: 'buffer' });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const rows: any[] = XLSX.utils.sheet_to_json(sheet);
            expect(rows).toHaveLength(1);
            // "Test ID" is the tester-entered ID; the database _id is not exported.
            expect(rows[0]['Test ID']).toBe('T-100');
            expect(Object.values(rows[0])).not.toContain('abc123');
            // Sprint Cycle stays in the database but is not exported.
            expect(Object.values(rows[0])).not.toContain('Sprint 7');
            expect(rows[0]['Tester Name']).toBe('Alice');
            // Spot-check the actual header row for columns that aren't part
            // of the 10-column review table but must still be in the full
            // export - checked against the header row itself (not a data
            // row's own keys), since a truly blank cell can be dropped from
            // sheet_to_json's per-row objects.
            const headerRow = (XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][])[0];
            expect(headerRow).toContain('Reviewer1 Name');
            expect(headerRow).toContain('Moderator TAT (mins) [Auto]');
        });

        // Header row must be a byte-for-byte match against the Google
        // Sheet's own 78-column header (see
        // backend/data/testers-dashboard/updated.csv), in the Sheet's exact
        // order, including its 2 verbatim quirks and the embedded line
        // break on the Defect ID / Bug Ref header - that's the whole point
        // of this export, not an approximation of the Sheet layout. The one
        // deliberate exception: the Sheet's "Sprint / Cycle" column is left
        // out (see EXPORT_COLUMNS), leaving 77.
        it('header row is an exact 77-column, Sheet-order match (minus Sprint / Cycle), including its quirky headers', async () => {
            mockToArray.mockResolvedValueOnce([]);

            const result = await service.exportEntries();
            const wb = XLSX.read(result.buffer, { type: 'buffer' });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const headerRow = (XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][])[0];

            expect(headerRow).toEqual([
                'Test ID', 'Test Date', 'Tester Name', 'Type of Question', 'Build / Version',
                'Channel Tested', 'Language Tested', 'Question ID',
                'Query Text (Original)', 'Question Category', 'Time Question Asked (HH:MM:SS)',
                'Time Answer Received (HH:MM:SS)', 'Response Time (mins) [Auto] (HH:MM:SS)', 'SLA Status',
                'Question in Review Model?', 'Question Correctly Framed?', 'Original Language',
                'Translated Language', 'Translation Quality', 'Translation Error Type', 'Tagging',
                'Allocated to Reviewer?', "Author's Name", 'Author Assignment Time', 'Author Completion Time',
                'Author TAT (mins) [Auto]',
                'Reviewer1 Name', 'Reviewer1 Assignment Time', 'Reviewer1 Completion Time', 'Review1 TAT (mins) [Auto]',
                'Reviewer2 Name', 'Reviewer2 Assignment Time', 'Reviewer2 Completion Time', 'Review2 TAT (mins) [Auto]',
                'Reviewer3 Name', 'Reviewer3 Assignment Time', 'Reviewer3 Completion Time', 'Review3 TAT (mins) [Auto]',
                'Reviewer4 Name', 'Reviewer4 Assignment Time', 'Reviewer4 Completion Time', 'Review4 TAT (mins) [Auto]',
                'Reviewer5 Name', 'Reviewer5 Assignment Time', 'Reviewer5 Completion Time', 'Review5 TAT (mins) [Auto]',
                "Moderator's Name", 'Moderator Assignment Time', 'ModeratorCompletion Time', 'Moderator TAT (mins) [Auto]',
                'Follow-up Q in Review Model?', 'Answer Scientifically Correct?', 'Expert Name Displayed?',
                'Correct Expert Name displayed?', 'Correct Source Links Provided?', '120-min Msg Shown to User?',
                'Notification Received?', 'Notification on Same Thread?', 'Notification Linked Correct Q-ID?',
                'Voice Input Working?', 'Voice Output Working?', 'Voice Input Quality', 'Voice Output Quality',
                'Voice Issue Description', 'Weather Q Answered Correctly?', 'Mandi Price Q Correct?',
                'Scheme Q Correct?', 'Question Saved in DB?', 'Answer Saved in DB?',
                'Q-ID Consistent Across Systems?', 'WhatsApp vs Web Answer Match?', 'Overall Test Status',
                'Defect Severity', 'Defect ID / Bug Ref\nZoho Desk Ticketing', 'Reviewer Remarks',
                'Tester Remarks', 'Status',
            ]);
            expect(headerRow).toHaveLength(77);
            expect(headerRow).not.toContain('Sprint / Cycle');
            // The 4 DB-only metadata fields with no Sheet equivalent must NOT
            // appear, so the layout stays an exact match.
            expect(headerRow).not.toContain('Submitted By Email');
            expect(headerRow).not.toContain('Submitted At');
        });

        it('ignores filters entirely - fetches every row in the collection, unpaginated', async () => {
            mockToArray.mockResolvedValueOnce([]);

            await service.exportEntries();

            // No filter object of any kind - always the full collection.
            expect(mockFind).toHaveBeenCalledWith({});
            // No skip/limit call in the export path.
            expect(mockSkip).not.toHaveBeenCalled();
        });
    });

    it('records testDate as today\'s date (IST) when creating an entry', async () => {
        mockCollection.insertOne = vi.fn().mockResolvedValue({ insertedId: 'entry-123' });

        const result = await service.createEntry('user-1', 'tester@example.com', 'Tester Name', {
            typeOfQuestion: 'Unique',
            buildVersion: '2.1.0',
        } as any);

        expect(result.success).toBe(true);
        expect(mockCollection.insertOne).toHaveBeenCalledTimes(1);

        const insertedDoc = mockCollection.insertOne.mock.calls[0][0];
        const expectedDate = getTodayIST(new Date());

        expect(insertedDoc.testDate).toBe(expectedDate);
        expect(result.entry.testDate).toBe(expectedDate);
    });

    it('computes summary metrics correctly in getMySummary', async () => {
        const mockEntries = [
            {
                testDate: '2026-09-15',
                overallTestStatus: 'Pass',
                slaStatus: 'Met',
                responseTimeMins: '00:02:30',
                typeOfQuestion: 'Dynamic',
                channelTested: 'WhatsApp',
                languageTested: 'Hindi',
                defectSeverity: 'NA',
                answerScientificallyCorrect: 'Yes',
                questionSavedInDb: 'Yes',
                voiceInputWorking: 'Yes',
                voiceOutputWorking: 'Yes',
            },
            {
                testDate: '2026-09-15',
                overallTestStatus: 'Fail',
                slaStatus: 'Breached',
                responseTimeMins: '00:05:00',
                typeOfQuestion: 'GDB',
                channelTested: 'Web',
                languageTested: 'English',
                defectSeverity: 'Critical',
                defectIdBugRef: 'BUG-101',
                answerScientificallyCorrect: 'No',
                questionSavedInDb: 'No',
                voiceInputWorking: 'No',
                voiceOutputWorking: 'No',
            },
            {
                testDate: '2026-09-16',
                overallTestStatus: 'Partial',
                slaStatus: 'Met',
                typeOfQuestion: 'Unique',
                channelTested: 'WhatsApp',
                languageTested: 'Hindi',
                defectSeverity: 'Medium',
                answerScientificallyCorrect: 'Yes',
                questionSavedInDb: 'Yes',
            },
        ];

        mockToArray.mockResolvedValue(mockEntries);

        const summary = await service.getMySummary('user-1', '2026-09-15', '2026-09-16');

        expect(summary.success).toBe(true);
        expect(summary.totalTests).toBe(3);
        expect(summary.passed).toBe(1);
        expect(summary.failed).toBe(1);
        expect(summary.partial).toBe(1);
        expect(summary.passRate).toBe(33.3);
        expect(summary.failRate).toBe(33.3);
        expect(summary.slaMet).toBe(2);
        expect(summary.slaBreached).toBe(1);
        expect(summary.slaMetRate).toBe(66.7);
        expect(summary.totalDefects).toBe(2);
        expect(summary.defectsBySeverity.critical).toBe(1);
        expect(summary.defectsBySeverity.medium).toBe(1);
        expect(summary.byQuestionType['Dynamic']).toBe(1);
        expect(summary.byChannel['WhatsApp']).toBe(2);
        expect(summary.byLanguage['Hindi']).toBe(2);
        expect(summary.dailyStats.length).toBe(2);

        // Target vs. Achieved assertions
        expect(summary.targetVsAchieved).toBeDefined();
        expect(summary.targetVsAchieved.daysCount).toBe(2);
        expect(summary.targetVsAchieved.rows.length).toBe(6);
        expect(summary.targetVsAchieved.total.targetTotal).toBe(108); // 54 * 2 days
        expect(summary.targetVsAchieved.total.targetWebApp).toBe(54); // 27 * 2 days
        expect(summary.targetVsAchieved.total.targetWhatsApp).toBe(54); // 27 * 2 days
        expect(summary.targetVsAchieved.total.achievedTotal).toBe(3);
    });

    it('computes both Web App and WhatsApp response times in createEntry for cross-platform tests', async () => {
        mockCollection.insertOne = vi.fn().mockImplementation(async (entry: any) => ({
            insertedId: 'entry-cp-1',
        }));

        const result = await service.createEntry('user-1', 'tester@example.com', 'Tester Name', {
            channelTested: 'Both',
            typeOfQuestion: 'Unique',
            timeQuestionAsked: '10:00:00',
            timeAnswerReceived: '10:00:15',
            waTimeQuestionAsked: '10:00:00',
            waTimeAnswerReceived: '10:00:45',
            whatsappVsWebAnswerMatch: 'Yes',
        } as any);

        expect(result.success).toBe(true);
        expect(result.entry.responseTimeMins).toBe('00:00:15');
        expect(result.entry.waResponseTimeMins).toBe('00:00:45');
        expect(result.entry.channelTested).toBe('Both');
    });

    it('aggregates cross-platform stats and credits both platforms in getMySummary', async () => {
        const mockEntries = [
            {
                testDate: '2026-09-20',
                typeOfQuestion: 'Unique',
                channelTested: 'Both',
                overallTestStatus: 'Pass',
                whatsappVsWebAnswerMatch: 'Yes',
                slaStatus: 'Met',
            },
            {
                testDate: '2026-09-20',
                typeOfQuestion: 'GDB',
                channelTested: 'Both',
                overallTestStatus: 'Partial',
                whatsappVsWebAnswerMatch: 'No',
                slaStatus: 'Met',
            },
            {
                testDate: '2026-09-20',
                typeOfQuestion: 'Unique',
                channelTested: 'WebApp',
                overallTestStatus: 'Pass',
                slaStatus: 'Met',
            },
        ];

        mockToArray.mockResolvedValue(mockEntries);

        const summary = await service.getMySummary('user-1', '2026-09-20', '2026-09-20');

        expect(summary.crossPlatformStats).toBeDefined();
        expect(summary.crossPlatformStats?.totalCrossPlatform).toBe(2);
        expect(summary.crossPlatformStats?.matchedAnswers).toBe(1);
        expect(summary.crossPlatformStats?.parityRate).toBe(50); // 1 / 2 = 50%

        // Unique target: 1 WebApp test + 1 Both test => WebApp = 2, WhatsApp = 1, Total = 3
        const uniqueRow = summary.targetVsAchieved.rows.find(r => r.questionType === 'Unique');
        expect(uniqueRow).toBeDefined();
        expect(uniqueRow?.achievedWebApp).toBe(2);
        expect(uniqueRow?.achievedWhatsApp).toBe(1);
        expect(uniqueRow?.achievedTotal).toBe(3);
    });
});


describe('TesterLogService admin edit/delete', () => {
    const ID = '64b7f0c2a1b2c3d4e5f60718';
    const actor = { userId: 'admin-1', email: 'admin@example.com', name: 'Admin One' };
    const stored = {
        _id: ID,
        submittedByUserId: 'tester-1',
        submittedByEmail: 'tester@example.com',
        testerName: 'Tester One',
        createdAt: new Date('2026-09-01T05:00:00.000Z'),
        updatedAt: new Date('2026-09-01T05:00:00.000Z'),
        testDate: '2026-09-01',
        overallTestStatus: 'Pass',
        timeQuestionAsked: '2026-09-01T10:00:00',
        timeAnswerReceived: '2026-09-01T10:05:00',
        responseTimeMins: '00:05:00',
    };

    let entries: any;
    let audit: any;
    let service: TesterLogService;

    beforeEach(() => {
        entries = {
            findOne: vi.fn().mockResolvedValue({ ...stored }),
            updateOne: vi.fn().mockResolvedValue({ matchedCount: 1 }),
            deleteOne: vi.fn().mockResolvedValue({ deletedCount: 1 }),
        };
        audit = { insertOne: vi.fn().mockResolvedValue({}) };
        const db = {
            getCollection: vi.fn((name: string) =>
                Promise.resolve(name === 'tester_test_cases_audit' ? audit : entries),
            ),
        };
        service = new TesterLogService(db as any);
    });

    it('updates only editable fields, recomputes durations, and audits before/after', async () => {
        const result = await service.updateEntry(
            ID,
            {
                overallTestStatus: 'Fail',
                timeAnswerReceived: '2026-09-01T10:20:00',
                // Not editable - must be ignored.
                submittedByUserId: 'someone-else',
                testerName: 'Renamed',
                responseTimeMins: '99:99:99',
            } as any,
            actor,
        );

        const [filter, update] = entries.updateOne.mock.calls[0];
        expect(filter._id.toString()).toBe(ID);
        expect(update.$set.overallTestStatus).toBe('Fail');
        expect(update.$set.responseTimeMins).toBe('00:20:00');
        expect(update.$set).not.toHaveProperty('submittedByUserId');
        expect(update.$set).not.toHaveProperty('testerName');
        expect(update.$set.updatedAt).toBeInstanceOf(Date);

        expect(result?.entry.overallTestStatus).toBe('Fail');
        expect(result?.entry.testerName).toBe('Tester One');

        const record = audit.insertOne.mock.calls[0][0];
        expect(record).toMatchObject({ entryId: ID, action: 'update', actor });
        expect(record.before.overallTestStatus).toBe('Pass');
        expect(record.after.overallTestStatus).toBe('Fail');
    });

    it('recomputes the WhatsApp response time on edit, and keeps a stored response time its timestamps cannot reproduce', async () => {
        entries.findOne.mockResolvedValue({
            ...stored,
            timeQuestionAsked: '',
            timeAnswerReceived: '',
            responseTimeMins: '00:07:00', // supplied at submission, no timestamps to recompute from
            waTimeQuestionAsked: '2026-09-01T11:00:00',
            waTimeAnswerReceived: '2026-09-01T11:03:00',
            waResponseTimeMins: '',
        });

        // An unrelated edit - the durations are still recomputed from the stored record.
        await service.updateEntry(ID, { overallTestStatus: 'Fail' }, actor);

        const [, update] = entries.updateOne.mock.calls[0];
        expect(update.$set.waResponseTimeMins).toBe('00:03:00');
        expect(update.$set.responseTimeMins).toBe('00:07:00');
    });

    it('applies cross-platform (WhatsApp) field edits, which are not export columns', async () => {
        entries.findOne.mockResolvedValue({ ...stored, channelTested: 'Both' });

        await service.updateEntry(
            ID,
            {
                waThreadId: 'wa-thread-9',
                waTimeQuestionAsked: '2026-09-01T11:00:00',
                waTimeAnswerReceived: '2026-09-01T11:02:30',
                waSlaStatus: 'Within SLA',
                waNotificationReceived: 'Received Late',
                waVoiceInputWorking: 'Yes',
                waVoiceOutputWorking: 'No',
                webOverallTestStatus: 'Pass',
                waOverallTestStatus: 'Fail',
                crossPlatformDiscrepancyNotes: 'WA answer truncated',
                // Derived - must be recomputed, not taken from the body.
                waResponseTimeMins: '99:99:99',
            },
            actor,
        );

        const [, update] = entries.updateOne.mock.calls[0];
        expect(update.$set).toMatchObject({
            waThreadId: 'wa-thread-9',
            waSlaStatus: 'Within SLA',
            waNotificationReceived: 'Received Late',
            waVoiceInputWorking: 'Yes',
            waVoiceOutputWorking: 'No',
            webOverallTestStatus: 'Pass',
            waOverallTestStatus: 'Fail',
            crossPlatformDiscrepancyNotes: 'WA answer truncated',
            waResponseTimeMins: '00:02:30',
        });
        // Web-side edits to a Both entry still go through the common fields.
        expect(update.$set.responseTimeMins).toBe('00:05:00');
    });

    it('edits an old entry that has no WhatsApp fields without inventing any', async () => {
        await service.updateEntry(ID, { overallTestStatus: 'Fail' }, actor);

        const [, update] = entries.updateOne.mock.calls[0];
        expect(update.$set).not.toHaveProperty('waThreadId');
        expect(update.$set).not.toHaveProperty('waOverallTestStatus');
        expect(update.$set.waResponseTimeMins).toBe('');
    });

    it('leaves a stored Sprint Cycle untouched - no longer admin-editable, but not deleted', async () => {
        entries.findOne.mockResolvedValue({ ...stored, sprintCycle: 'Sprint 7' });

        const result = await service.updateEntry(ID, { sprintCycle: 'Sprint 8', overallTestStatus: 'Fail' }, actor);

        const [, update] = entries.updateOne.mock.calls[0];
        expect(update.$set).not.toHaveProperty('sprintCycle');
        expect(update.$unset).toBeUndefined();
        expect(result?.entry.sprintCycle).toBe('Sprint 7');
    });

    it('returns null for an unknown or malformed id without writing', async () => {
        entries.findOne.mockResolvedValue(null);
        expect(await service.updateEntry(ID, { overallTestStatus: 'Fail' }, actor)).toBeNull();
        expect(await service.updateEntry('not-an-id', { overallTestStatus: 'Fail' }, actor)).toBeNull();
        expect(entries.updateOne).not.toHaveBeenCalled();
        expect(audit.insertOne).not.toHaveBeenCalled();
    });

    it('snapshots the full entry to the audit collection before deleting it', async () => {
        const order: string[] = [];
        audit.insertOne.mockImplementation(async () => { order.push('audit'); });
        entries.deleteOne.mockImplementation(async () => { order.push('delete'); return { deletedCount: 1 }; });

        expect(await service.deleteEntry(ID, actor)).toBe(true);
        expect(order).toEqual(['audit', 'delete']);
        expect(audit.insertOne.mock.calls[0][0]).toMatchObject({ entryId: ID, action: 'delete', actor, before: stored });
    });

    it('does not delete when the audit snapshot cannot be written', async () => {
        audit.insertOne.mockRejectedValue(new Error('write failed'));
        await expect(service.deleteEntry(ID, actor)).rejects.toThrow('write failed');
        expect(entries.deleteOne).not.toHaveBeenCalled();
    });

    it('returns false when deleting an unknown id', async () => {
        entries.findOne.mockResolvedValue(null);
        expect(await service.deleteEntry(ID, actor)).toBe(false);
        expect(entries.deleteOne).not.toHaveBeenCalled();
    });
});

describe('incrementTestId', () => {
    it('increments standard TL-0005 to TL-0006 preserving padding', () => {
        expect(incrementTestId('TL-0005')).toBe('TL-0006');
    });

    it('increments TL-005 to TL-006 preserving 3-digit padding', () => {
        expect(incrementTestId('TL-005')).toBe('TL-006');
    });

    it('increments TL_1-6513 to TL_1-6514', () => {
        expect(incrementTestId('TL_1-6513')).toBe('TL_1-6514');
    });

    it('increments and expands digits on overflow (e.g. TL-999 to TL-1000)', () => {
        expect(incrementTestId('TL-999')).toBe('TL-1000');
    });

    it('handles numeric only ID like 1 to 2', () => {
        expect(incrementTestId('1')).toBe('2');
        expect(incrementTestId('09')).toBe('10');
    });

    it('returns TL-0001 when lastId is null or empty', () => {
        expect(incrementTestId(null)).toBe('TL-0001');
        expect(incrementTestId('')).toBe('TL-0001');
        expect(incrementTestId(undefined)).toBe('TL-0001');
    });

    it('appends -0001 when string does not end with digits', () => {
        expect(incrementTestId('TL-ABC')).toBe('TL-ABC-0001');
    });
});

describe('TesterLogService getNextTestId and allocateNextTestId', () => {
    let service: TesterLogService;
    let mockCollection: any;
    let mockCountersCollection: any;
    let mockDb: any;

    beforeEach(() => {
        mockCollection = {
            find: vi.fn().mockReturnValue({
                sort: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                        toArray: vi.fn().mockResolvedValue([]),
                    }),
                }),
            }),
            insertOne: vi.fn().mockResolvedValue({ insertedId: 'entry-test-1' }),
        };

        mockCountersCollection = {
            findOne: vi.fn().mockResolvedValue(null),
            findOneAndUpdate: vi.fn().mockImplementation(async (filter, update) => {
                return { seq: 1, prefix: 'TL-', padLen: 4 };
            }),
            insertOne: vi.fn().mockResolvedValue({}),
            updateOne: vi.fn().mockResolvedValue({}),
        };

        mockDb = {
            getCollection: vi.fn((name: string) => {
                if (name === 'tester_log_counters') return Promise.resolve(mockCountersCollection);
                return Promise.resolve(mockCollection);
            }),
        };
        service = new TesterLogService(mockDb);
    });

    it('returns TL-0001 when database is completely empty', async () => {
        const nextId = await service.getNextTestId();
        expect(nextId).toBe('TL-0001');
    });

    it('increments from existing counter in tester_log_counters', async () => {
        mockCountersCollection.findOne.mockResolvedValue({
            _id: 'test_case_id',
            seq: 25,
            prefix: 'TL-',
            padLen: 4,
        });

        const nextId = await service.getNextTestId();
        expect(nextId).toBe('TL-0026');
    });

    it('initializes counter from existing entries in tester_test_cases if counter does not exist', async () => {
        mockCollection.find.mockReturnValue({
            sort: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                    toArray: vi.fn().mockResolvedValue([{ testId: 'TL-0042' }]),
                }),
            }),
        });

        const nextId = await service.getNextTestId();
        expect(nextId).toBe('TL-0043');
        expect(mockCountersCollection.insertOne).toHaveBeenCalledWith(
            expect.objectContaining({
                _id: 'test_case_id',
                seq: 42,
                prefix: 'TL-',
                padLen: 4,
            }),
        );
    });

    it('auto-assigns testId in createEntry atomically if testId is omitted', async () => {
        mockCountersCollection.findOneAndUpdate.mockResolvedValue({
            seq: 100,
            prefix: 'TL-',
            padLen: 4,
        });

        const result = await service.createEntry('user-1', 'tester@example.com', 'Tester Name', {
            typeOfQuestion: 'Unique',
        } as any);

        expect(result.entry.testId).toBe('TL-0100');
        expect(mockCollection.insertOne).toHaveBeenCalledWith(
            expect.objectContaining({ testId: 'TL-0100' }),
        );
    });

    it('supports 50 concurrent submissions with unique sequential test IDs and zero duplicates', async () => {
        let currentSeq = 10;
        // Simulate atomic findOneAndUpdate in MongoDB
        mockCountersCollection.findOneAndUpdate.mockImplementation(async () => {
            currentSeq += 1;
            return { seq: currentSeq, prefix: 'TL-', padLen: 4 };
        });

        // 50 concurrent testers submitting test cases simultaneously
        const concurrentPromises = Array.from({ length: 50 }, (_, i) =>
            service.createEntry(`user-${i}`, `tester${i}@example.com`, `Tester ${i}`, {
                typeOfQuestion: 'Functional',
            } as any),
        );

        const results = await Promise.all(concurrentPromises);
        const allocatedIds = results.map(r => r.entry.testId);

        // All 50 IDs must be unique
        const uniqueIds = new Set(allocatedIds);
        expect(uniqueIds.size).toBe(50);

        // Sequence must range from TL-0011 to TL-0060
        expect(allocatedIds).toContain('TL-0011');
        expect(allocatedIds).toContain('TL-0060');
    });
});
