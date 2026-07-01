import 'reflect-metadata';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {ObjectId} from 'mongodb';

import {AuditTrailsService} from '../services/AuditTrailsService.js';

describe('AuditTrailsService', () => {
  let service: AuditTrailsService;

  const mockRepository = {
    createAuditTrail: vi.fn(),
    getAuditTrails: vi.fn(),
    getAuditTrailById: vi.fn(),
    getAuditTrailsByModeratorId: vi.fn(),
    getShiftBasedAuditActionCounts: vi.fn(),
    getAuditTrailsByQuestionId: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    service = new AuditTrailsService(mockRepository as any, {} as any);
  });

  describe('createAuditTrail', () => {
    it('creates audit trail successfully', async () => {
      mockRepository.createAuditTrail.mockResolvedValue('audit-id');

      const payload = {
        actor: {
          id: new ObjectId().toString(),
        },
        context: {},
      } as any;

      const result = await service.createAuditTrail(payload);

      expect(result).toBe('audit-id');

      expect(mockRepository.createAuditTrail).toHaveBeenCalledTimes(1);
    });

    it('converts string ids to ObjectIds', async () => {
      mockRepository.createAuditTrail.mockResolvedValue('audit-id');

      const id = new ObjectId().toString();

      await service.createAuditTrail({
        actor: {id},
        context: {
          userId: id,
          answerId: id,
          requestId: id,
          cropId: id,
          questionId: id,
        },
      } as any);

      const arg = mockRepository.createAuditTrail.mock.calls[0][0];

      expect(arg.actor.id).toBeInstanceOf(ObjectId);
      expect(arg.context.userId).toBeInstanceOf(ObjectId);
      expect(arg.context.answerId).toBeInstanceOf(ObjectId);
      expect(arg.context.requestId).toBeInstanceOf(ObjectId);
      expect(arg.context.cropId).toBeInstanceOf(ObjectId);
      expect(arg.context.questionId[0]).toBeInstanceOf(ObjectId);
    });

    it('converts expert arrays to ObjectIds', async () => {
      mockRepository.createAuditTrail.mockResolvedValue('audit-id');

      const id1 = new ObjectId().toString();
      const id2 = new ObjectId().toString();

      await service.createAuditTrail({
        actor: {},
        context: {},
        changes: {
          before: {
            experts: [id1],
          },
          after: {
            experts: [id2],
          },
        },
      } as any);

      const arg = mockRepository.createAuditTrail.mock.calls[0][0];

      expect(arg.changes.before.experts[0]).toBeInstanceOf(ObjectId);
      expect(arg.changes.after.experts[0]).toBeInstanceOf(ObjectId);
    });
  });

  describe('getAuditTrails', () => {
    it('returns normalized audit trails', async () => {
      const id = new ObjectId();

      mockRepository.getAuditTrails.mockResolvedValue({
        data: [
          {
            actor: {id},
            context: {
              questionId: [id],
              answerId: id,
            },
            changes: {
              before: {
                experts: [id],
              },
              after: {},
            },
          },
        ],
        totalDocuments: 1,
      });

      const result = await service.getAuditTrails(1, 10);

      expect(result.totalDocuments).toBe(1);

      expect(result.data[0].actor.id).toBe(id.toString());
      expect(result.data[0].context.questionId).toEqual([id.toString()]);
      expect(result.data[0].context.answerId).toBe(id.toString());
      expect(result.data[0].changes.before.experts).toEqual([id.toString()]);
    });

    it('passes filters to repository', async () => {
      mockRepository.getAuditTrails.mockResolvedValue({
        data: [],
        totalDocuments: 0,
      });

      await service.getAuditTrails(
        2,
        25,
        '2025-01-01',
        '2025-01-31',
        'QUESTION',
        'UPDATE',
        'desc',
        'SUCCESS',
      );

      expect(mockRepository.getAuditTrails).toHaveBeenCalledWith(
        2,
        25,
        '2025-01-01',
        '2025-01-31',
        'QUESTION',
        'UPDATE',
        'desc',
        'SUCCESS',
      );
    });
  });

  describe('getAuditTrailById', () => {
    it('returns repository response', async () => {
      mockRepository.getAuditTrailById.mockResolvedValue({
        id: 'audit-1',
      });

      const result = await service.getAuditTrailById('audit-1');

      expect(result).toEqual({
        id: 'audit-1',
      });

      expect(mockRepository.getAuditTrailById).toHaveBeenCalledWith('audit-1');
    });
  });

  describe('getAuditTrailsByModeratorId', () => {
    it('returns normalized response', async () => {
      const id = new ObjectId();

      mockRepository.getAuditTrailsByModeratorId.mockResolvedValue({
        data: [
          {
            actor: {
              id,
            },
            context: {},
          },
        ],
        totalDocuments: 3,
      });

      const result = await service.getAuditTrailsByModeratorId(
        'moderator',
        1,
        10,
      );

      expect(result.totalDocuments).toBe(3);
      expect(result.data[0].actor.id).toBe(id.toString());
    });
  });

  describe('getShiftBasedAuditActionCounts', () => {
    it('returns repository response', async () => {
      mockRepository.getShiftBasedAuditActionCounts.mockResolvedValue({
        total: 15,
      });

      const result = await service.getShiftBasedAuditActionCounts(
        '2025-01-01',
        'morning',
        '09:00',
        '17:00',
      );

      expect(result).toEqual({
        total: 15,
      });
    });
  });

  describe('getAuditTrailsByQuestionId', () => {
    it('returns normalized response', async () => {
      const id = new ObjectId();

      mockRepository.getAuditTrailsByQuestionId.mockResolvedValue({
        data: [
          {
            actor: {
              id,
            },
            context: {},
          },
        ],
        totalDocuments: 5,
      });

      const result = await service.getAuditTrailsByQuestionId(
        'question',
        1,
        20,
      );

      expect(result.totalDocuments).toBe(5);
      expect(result.data[0].actor.id).toBe(id.toString());
    });

    it('passes pagination and filters', async () => {
      mockRepository.getAuditTrailsByQuestionId.mockResolvedValue({
        data: [],
        totalDocuments: 0,
      });

      await service.getAuditTrailsByQuestionId(
        'question',
        2,
        50,
        'UPDATE',
        'asc',
      );

      expect(mockRepository.getAuditTrailsByQuestionId).toHaveBeenCalledWith(
        'question',
        2,
        50,
        'UPDATE',
        'asc',
      );
    });
  });
});
