import { describe, it, expect, vi, beforeEach } from 'vitest';
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
    let mockCollection: any;
    let mockDb: any;

    beforeEach(() => {
        mockToArray = vi.fn().mockResolvedValue([]);
        mockLimit = vi.fn().mockReturnValue({ toArray: mockToArray });
        mockSkip = vi.fn().mockReturnValue({ limit: mockLimit });
        mockSort = vi.fn().mockReturnValue({ skip: mockSkip, toArray: mockToArray });
        mockFind = vi.fn().mockReturnValue({ sort: mockSort });
        mockCountDocuments = vi.fn().mockResolvedValue(0);

        mockCollection = {
            find: mockFind,
            countDocuments: mockCountDocuments,
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
});

