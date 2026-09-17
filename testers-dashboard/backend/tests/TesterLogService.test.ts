import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TesterLogService } from '../services/TesterLogService.js';

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
        mockSort = vi.fn().mockReturnValue({ skip: mockSkip });
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
});
