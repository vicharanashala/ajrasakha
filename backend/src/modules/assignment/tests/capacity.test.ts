import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExpertCapacityService } from '../capacity.js';
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

function mockRepo(
  activeAssignments: IAssignment[],
  frozenAssignments: IAssignment[],
  queuedAssignments: IAssignment[],
): IAssignmentRepository {
  return {
    create: vi.fn().mockResolvedValue(makeAssignment()),
    findById: vi.fn().mockResolvedValue(null),
    findByQuestionId: vi.fn().mockResolvedValue([]),
    findByExpertId: vi.fn().mockResolvedValue([
      ...activeAssignments,
      ...frozenAssignments,
      ...queuedAssignments,
    ]),
    findActiveByExpertId: vi.fn().mockResolvedValue(activeAssignments),
    findFrozenByExpertId: vi.fn().mockResolvedValue(frozenAssignments),
    findQueuedByExpertId: vi.fn().mockResolvedValue(queuedAssignments),
    updateStatus: vi.fn(),
    updateStatusByQuestionId: vi.fn(),
    complete: vi.fn(),
    delete: vi.fn(),
    deleteByQuestionId: vi.fn(),
    countActiveByExpertId: vi.fn().mockResolvedValue(activeAssignments.length),
    countByStatus: vi.fn().mockResolvedValue(0),
    countCompletedInRange: vi.fn().mockResolvedValue(0),
    getDistinctExpertIds: vi.fn().mockResolvedValue(['expert1', 'expert2']),
    findAllActive: vi.fn().mockResolvedValue(activeAssignments),
    findAllFrozen: vi.fn().mockResolvedValue(frozenAssignments),
    findQueuedByPriority: vi.fn().mockResolvedValue(queuedAssignments),
  } as unknown as IAssignmentRepository;
}

describe('ExpertCapacityService', () => {
  let service: ExpertCapacityService;
  let repo: IAssignmentRepository;

  beforeEach(() => {
    repo = mockRepo([], [], []);
    service = new ExpertCapacityService(repo);
  });

  // ── getWorkload ────────────────────────────────────────────────────────────

  describe('getWorkload', () => {
    it('returns zeros when expert has no assignments', async () => {
      const wl = await service.getWorkload('expert1');
      expect(wl.totalActive).toBe(0);
      expect(wl.totalFrozen).toBe(0);
      expect(wl.totalQueued).toBe(0);
      expect(wl.activeHigh).toBe(0);
      expect(wl.activeMedium).toBe(0);
      expect(wl.activeLow).toBe(0);
    });

    it('counts active assignments by priority', async () => {
      const active = [
        makeAssignment({ priority: 'high', status: 'active' }),
        makeAssignment({ priority: 'medium', status: 'active' }),
        makeAssignment({ priority: 'low', status: 'active' }),
      ];
      const repo = mockRepo(active, [], []);
      const s = new ExpertCapacityService(repo);

      const wl = await s.getWorkload('expert1');
      expect(wl.activeHigh).toBe(1);
      expect(wl.activeMedium).toBe(1);
      expect(wl.activeLow).toBe(1);
      expect(wl.totalActive).toBe(3);
    });

    it('counts frozen medium and low but NOT frozen high', async () => {
      const frozen = [
        makeAssignment({ priority: 'medium', status: 'frozen' }),
        makeAssignment({ priority: 'low', status: 'frozen' }),
      ];
      const repo = mockRepo([], frozen, []);
      const s = new ExpertCapacityService(repo);

      const wl = await s.getWorkload('expert1');
      expect(wl.frozenMedium).toBe(1);
      expect(wl.frozenLow).toBe(1);
      expect(wl.totalFrozen).toBe(2);
    });

    it('counts queued by priority', async () => {
      const queued = [
        makeAssignment({ priority: 'high', status: 'queued' }),
        makeAssignment({ priority: 'medium', status: 'queued' }),
        makeAssignment({ priority: 'low', status: 'queued' }),
      ];
      const repo = mockRepo([], [], queued);
      const s = new ExpertCapacityService(repo);

      const wl = await s.getWorkload('expert1');
      expect(wl.queuedHigh).toBe(1);
      expect(wl.queuedMedium).toBe(1);
      expect(wl.queuedLow).toBe(1);
      expect(wl.totalQueued).toBe(3);
    });
  });

  // ── slot checks ────────────────────────────────────────────────────────────

  describe('hasHighSlotAvailable', () => {
    it('returns true when no active high assignment exists', async () => {
      const active = [makeAssignment({ priority: 'medium', status: 'active' })];
      const repo = mockRepo(active, [], []);
      const s = new ExpertCapacityService(repo);

      expect(await s.hasHighSlotAvailable('expert1')).toBe(true);
    });

    it('returns false when an active high assignment exists', async () => {
      const active = [makeAssignment({ priority: 'high', status: 'active' })];
      const repo = mockRepo(active, [], []);
      const s = new ExpertCapacityService(repo);

      expect(await s.hasHighSlotAvailable('expert1')).toBe(false);
    });
  });

  describe('hasMediumSlotAvailable', () => {
    it('returns true when no active medium assignment exists', async () => {
      const active = [makeAssignment({ priority: 'low', status: 'active' })];
      const repo = mockRepo(active, [], []);
      const s = new ExpertCapacityService(repo);

      expect(await s.hasMediumSlotAvailable('expert1')).toBe(true);
    });

    it('returns false when an active medium assignment exists', async () => {
      const active = [makeAssignment({ priority: 'medium', status: 'active' })];
      const repo = mockRepo(active, [], []);
      const s = new ExpertCapacityService(repo);

      expect(await s.hasMediumSlotAvailable('expert1')).toBe(false);
    });
  });

  describe('hasLowSlotAvailable', () => {
    it('returns true when no active low assignment exists', async () => {
      const active = [makeAssignment({ priority: 'medium', status: 'active' })];
      const repo = mockRepo(active, [], []);
      const s = new ExpertCapacityService(repo);

      expect(await s.hasLowSlotAvailable('expert1')).toBe(true);
    });

    it('returns false when an active low assignment exists', async () => {
      const active = [makeAssignment({ priority: 'low', status: 'active' })];
      const repo = mockRepo(active, [], []);
      const s = new ExpertCapacityService(repo);

      expect(await s.hasLowSlotAvailable('expert1')).toBe(false);
    });
  });

  // ── canAssign ──────────────────────────────────────────────────────────────

  describe('canAssign', () => {
    it('high can be assigned when no active high slot is taken', async () => {
      const active = [makeAssignment({ priority: 'medium', status: 'active' })];
      const repo = mockRepo(active, [], []);
      const s = new ExpertCapacityService(repo);

      expect(await s.canAssign('expert1', 'high')).toBe(true);
    });

    it('high cannot be assigned when high slot is already taken', async () => {
      const active = [makeAssignment({ priority: 'high', status: 'active' })];
      const repo = mockRepo(active, [], []);
      const s = new ExpertCapacityService(repo);

      expect(await s.canAssign('expert1', 'high')).toBe(false);
    });

    it('medium can be assigned when no active medium slot is taken', async () => {
      const active = [makeAssignment({ priority: 'high', status: 'active' })];
      const repo = mockRepo(active, [], []);
      const s = new ExpertCapacityService(repo);

      expect(await s.canAssign('expert1', 'medium')).toBe(true);
    });

    it('medium cannot be assigned when medium slot is taken', async () => {
      const active = [makeAssignment({ priority: 'medium', status: 'active' })];
      const repo = mockRepo(active, [], []);
      const s = new ExpertCapacityService(repo);

      expect(await s.canAssign('expert1', 'medium')).toBe(false);
    });

    it('low can be assigned when no active low slot is taken', async () => {
      const active = [makeAssignment({ priority: 'high', status: 'active' })];
      const repo = mockRepo(active, [], []);
      const s = new ExpertCapacityService(repo);

      expect(await s.canAssign('expert1', 'low')).toBe(true);
    });

    it('low cannot be assigned when low slot is taken', async () => {
      const active = [makeAssignment({ priority: 'low', status: 'active' })];
      const repo = mockRepo(active, [], []);
      const s = new ExpertCapacityService(repo);

      expect(await s.canAssign('expert1', 'low')).toBe(false);
    });
  });
});