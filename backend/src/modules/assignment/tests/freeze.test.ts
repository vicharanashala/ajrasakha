import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FreezeService } from '../freeze.js';
import { IAssignmentRepository } from '../repository/IAssignmentRepository.js';
import { IAssignment } from '../types.js';

function makeAssignment(overrides: Partial<IAssignment> = {}): IAssignment {
  return {
    _id: 'asg1',
    questionId: 'q1',
    expertId: 'expert1',
    priority: 'medium',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as IAssignment;
}

function mockRepo(): IAssignmentRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByQuestionId: vi.fn().mockResolvedValue([]),
    findByExpertId: vi.fn().mockResolvedValue([]),
    findActiveByExpertId: vi.fn().mockResolvedValue([]),
    findFrozenByExpertId: vi.fn().mockResolvedValue([]),
    findQueuedByExpertId: vi.fn().mockResolvedValue([]),
    updateStatus: vi.fn().mockImplementation((id, status) =>
      Promise.resolve(makeAssignment({ _id: id as string, status })),
    ),
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

describe('FreezeService', () => {
  let service: FreezeService;
  let repo: IAssignmentRepository;

  beforeEach(() => {
    repo = mockRepo();
    service = new FreezeService(repo);
  });

  // ── freezeLowerPriority ─────────────────────────────────────────────────────

  describe('freezeLowerPriority', () => {
    it('returns empty array when assignment not found', async () => {
      repo.findById = vi.fn().mockResolvedValue(null);
      const frozen = await service.freezeLowerPriority('asg1');
      expect(frozen).toHaveLength(0);
    });

    it('returns empty array when assigned priority is not high', async () => {
      repo.findById = vi.fn().mockResolvedValue(
        makeAssignment({ _id: 'asg1', priority: 'medium' }),
      );
      const frozen = await service.freezeLowerPriority('asg1');
      expect(frozen).toHaveLength(0);
    });

    it('freezes medium and low active assignments when high is assigned', async () => {
      const highAsg = makeAssignment({ _id: 'high1', priority: 'high', status: 'active', expertId: 'exp1' });
      const mediumAsg = makeAssignment({ _id: 'med1', priority: 'medium', status: 'active', expertId: 'exp1' });
      const lowAsg = makeAssignment({ _id: 'low1', priority: 'low', status: 'active', expertId: 'exp1' });

      repo.findById = vi.fn().mockResolvedValue(highAsg);
      repo.findActiveByExpertId = vi.fn().mockResolvedValue([highAsg, mediumAsg, lowAsg]);
      // updateStatus must preserve the original assignment's priority in the returned value
      repo.updateStatus = vi.fn().mockImplementation((id, status) => {
        const original = [highAsg, mediumAsg, lowAsg].find(a => a._id === id);
        return Promise.resolve(
          makeAssignment({ _id: id as string, status, priority: original?.priority }),
        );
      });

      const frozen = await service.freezeLowerPriority('high1');

      expect(frozen).toHaveLength(2);
      expect(frozen.map(a => a.priority).sort()).toEqual(['low', 'medium']);
    });

    it('does NOT freeze the high assignment itself', async () => {
      const highAsg = makeAssignment({ _id: 'high1', priority: 'high', status: 'active', expertId: 'exp1' });
      const mediumAsg = makeAssignment({ _id: 'med1', priority: 'medium', status: 'active', expertId: 'exp1' });

      repo.findById = vi.fn().mockResolvedValue(highAsg);
      repo.findActiveByExpertId = vi.fn().mockResolvedValue([highAsg, mediumAsg]);
      repo.updateStatus = vi.fn().mockImplementation((id, status) =>
        Promise.resolve(makeAssignment({ _id: id as string, status })),
      );

      const frozen = await service.freezeLowerPriority('high1');

      expect(frozen.some(a => a._id === 'high1')).toBe(false);
    });
  });

  // ── manualFreeze / manualUnfreeze ───────────────────────────────────────────

  describe('manualFreeze', () => {
    it('calls updateStatus with frozen', async () => {
      await service.manualFreeze('asg1');
      expect(repo.updateStatus).toHaveBeenCalledWith('asg1', 'frozen');
    });
  });

  describe('manualUnfreeze', () => {
    it('calls updateStatus with active', async () => {
      await service.manualUnfreeze('asg1');
      expect(repo.updateStatus).toHaveBeenCalledWith('asg1', 'active');
    });
  });

  // ── getFrozenByExpert ───────────────────────────────────────────────────────

  describe('getFrozenByExpert', () => {
    it('delegates to repo.findFrozenByExpertId', async () => {
      const frozen = [
        makeAssignment({ priority: 'medium', status: 'frozen' }),
      ];
      repo.findFrozenByExpertId = vi.fn().mockResolvedValue(frozen);

      const result = await service.getFrozenByExpert('exp1');

      expect(repo.findFrozenByExpertId).toHaveBeenCalledWith('exp1');
      expect(result).toHaveLength(1);
    });
  });
});