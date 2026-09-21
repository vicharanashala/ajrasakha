import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';
import { TesterLogService } from '../services/TesterLogService.js';
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
    let mockDb: any;

    beforeEach(() => {
        mockToArray = vi.fn().mockResolvedValue([]);
        mockLimit = vi.fn().mockReturnValue({ toArray: mockToArray });
        // sort() feeds both the paginated chain (getAllEntries: sort->skip->
        // limit->toArray) and the unpaginated one (exportEntries: sort->
        // toArray directly) - both need to work off the same mock.
        mockSkip = vi.fn().mockReturnValue({ limit: mockLimit });
        mockSort = vi.fn().mockReturnValue({ skip: mockSkip, toArray: mockToArray });
        mockFind = vi.fn().mockReturnValue({ sort: mockSort });
        mockCountDocuments = vi.fn().mockResolvedValue(0);
        mockAggregateToArray = vi.fn().mockResolvedValue([]);
        mockAggregate = vi.fn().mockReturnValue({ toArray: mockAggregateToArray });

        mockCollection = {
            find: mockFind,
            countDocuments: mockCountDocuments,
            aggregate: mockAggregate,
            insertOne: vi.fn(),
        };

        mockDb = {
            getCollection: vi.fn().mockResolvedValue(mockCollection),
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

    describe('exportEntries', () => {
        const sampleEntry = {
            _id: { toString: () => 'abc123' },
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
            expect(rows[0]['Test ID']).toBe('abc123');
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
        // of this export, not an approximation of the Sheet layout.
        it('header row is an exact 78-column, Sheet-order match, including its quirky headers', async () => {
            mockToArray.mockResolvedValueOnce([]);

            const result = await service.exportEntries();
            const wb = XLSX.read(result.buffer, { type: 'buffer' });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const headerRow = (XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][])[0];

            expect(headerRow).toEqual([
                'Test ID', 'Test Date', 'Tester Name', 'Type of Question', 'Build / Version',
                'Sprint / Cycle', 'Channel Tested', 'Language Tested', 'Question ID',
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
            expect(headerRow).toHaveLength(78);
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
});
