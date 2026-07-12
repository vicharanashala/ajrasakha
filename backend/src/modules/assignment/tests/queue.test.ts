import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueueService } from '../queue.js';
import { IAssignmentRepository } from '../repository/IAssignmentRepository.js';
import { IAssignment } from '../types.js';

function makeAssignment(overrides: Partial<IAssignment> = {}): IAssignment {
  return {
    _id: 'asg1',
    questionId: 'q1',
    expertId: 'expert1',
    priority: 'medium',
    status: 'queued',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as IAssignment;
}

function mockRepo(): IAssignmentRepository {
  return {
    create: vi.fn().mockImplementation(a =>
      Promise.resolve({ ...a, _id: 'newid' } as IAssignment),
    ),
    findById: vi.fn(),
    findByQuestionId: vi.fn().mockResolvedValue([]),
    findByExpertId: vi.fn().mockResolvedValue([]),
    findActiveByExpertId: vi.fn().mockResolvedValue([]),
    findFrozenByExpertId: vi.fn().mockResolvedValue([]),
    findQueuedByExpertId: vi.fn().mockResolvedValue([]),
    updateStatus: vi.fn(),
    updateStatusByQuestionId: vi.fn(),
    complete: vi.fn(),
    delete: vi.fn(),
    deleteByQuestionId: vi.fn(),
    countActiveByExpertId: vi.fn().mockResolvedValue(0),
    countByStatus: vi.fn().mockResolvedValue(0),
    countCompletedInRange: vi.fn().mockResolvedValue(0),
    getDistinctExpertIds: vi.fn().mockResolvedValue([]),
    findAllActive: vi.fn().mockResolvedValue([]),
    findAllFrozen: vi.fn().mockResolvedValue([]),
    findQueuedByPriority: vi.fn().mockResolvedValue([]),
  } as unknown as IAssignmentRepository;
}

describe('QueueService', () => {
  let service: QueueService;
  let repo: IAssignmentRepository;

  beforeEach(() => {
    repo = mockRepo();
    service = new QueueService(repo);
  });

  // ── enqueue ─────────────────────────────────────────────────────────────────

  describe('enqueue', () => {
    it('creates a queued assignment with the correct fields', async () => {
      const result = await service.enqueue('q1', 'high', 'exp1');

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          questionId: 'q1',
          priority: 'high',
          expertId: 'exp1',
          status: 'queued',
        }),
      );
      expect(result).toBeDefined();
    });

    it('returns existing queued assignment if question already queued', async () => {
      const existing = makeAssignment({ questionId: 'q1', status: 'queued' });
      repo.findByQuestionId = vi.fn().mockResolvedValue([existing]);

      const result = await service.enqueue('q1', 'high', 'exp1');

      expect(repo.create).not.toHaveBeenCalled();
      expect(result).toBe(existing);
    });
  });

  // ── peek ────────────────────────────────────────────────────────────────────

  describe('peek', () => {
    it('returns null when queue is empty', async () => {
      repo.findQueuedByPriority = vi.fn().mockResolvedValue([]);
      const result = await service.peek('high');
      expect(result).toBeNull();
    });

    it('returns the oldest queued item (FIFO)', async () => {
      const older = makeAssignment({ _id: 'old1', createdAt: new Date('2024-01-01') });
      const newer = makeAssignment({ _id: 'new1', createdAt: new Date('2024-01-02') });
      repo.findQueuedByPriority = vi.fn().mockResolvedValue([newer, older]);

      const result = await service.peek('high');

      expect(result?._id).toBe('old1');
    });
  });

  // ── dequeue ─────────────────────────────────────────────────────────────────

  describe('dequeue', () => {
    it('removes and returns the oldest queued item', async () => {
      const item = makeAssignment({ _id: 'q1', createdAt: new Date('2024-01-01') });
      repo.findQueuedByPriority = vi.fn().mockResolvedValue([item]);
      repo.delete = vi.fn().mockResolvedValue(undefined);

      const result = await service.dequeue('medium');

      expect(repo.delete).toHaveBeenCalledWith('q1');
      expect(result?._id).toBe('q1');
    });

    it('returns null when queue is empty', async () => {
      repo.findQueuedByPriority = vi.fn().mockResolvedValue([]);
      const result = await service.dequeue('low');
      expect(result).toBeNull();
    });
  });

  // ── getQueueLength ──────────────────────────────────────────────────────────

  describe('getQueueLength', () => {
    it('returns 0 when no items queued', async () => {
      repo.findQueuedByPriority = vi.fn().mockResolvedValue([]);
      const len = await service.getQueueLength('high');
      expect(len).toBe(0);
    });

    it('returns correct count', async () => {
      repo.findQueuedByPriority = vi.fn().mockResolvedValue([
        makeAssignment(),
        makeAssignment(),
        makeAssignment(),
      ]);
      const len = await service.getQueueLength('medium');
      expect(len).toBe(3);
    });
  });

  // ── getAllQueueLengths ──────────────────────────────────────────────────────

  describe('getAllQueueLengths', () => {
    it('returns lengths for all three priorities', async () => {
      repo.findQueuedByPriority = vi.fn()
        .mockResolvedValueOnce([makeAssignment()])    // high: 1
        .mockResolvedValueOnce([makeAssignment(), makeAssignment()]) // medium: 2
        .mockResolvedValueOnce([]);                    // low: 0

      const lengths = await service.getAllQueueLengths();

      expect(lengths).toEqual({ high: 1, medium: 2, low: 0 });
    });
  });

  // ── requeue ─────────────────────────────────────────────────────────────────

  describe('requeue', () => {
    it('updates status to queued', async () => {
      await service.requeue('asg1');
      expect(repo.updateStatus).toHaveBeenCalledWith('asg1', 'queued');
    });
  });
});