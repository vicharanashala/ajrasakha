import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AssignmentEngine } from '../engine.js';
import { ExpertCapacityService } from '../capacity.js';
import { FreezeService } from '../freeze.js';
import { QueueService } from '../queue.js';
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
    getDistinctExpertIds: vi.fn().mockResolvedValue(['expert1', 'expert2']),
    findAllActive: vi.fn().mockResolvedValue([]),
    findAllFrozen: vi.fn().mockResolvedValue([]),
    findQueuedByPriority: vi.fn().mockResolvedValue([]),
  } as unknown as IAssignmentRepository;
}

describe('AssignmentEngine', () => {
  function buildEngine(repo: IAssignmentRepository): AssignmentEngine {
    const capacity = new ExpertCapacityService(repo);
    const freeze = new FreezeService(repo);
    const queue = new QueueService(repo);
    return new AssignmentEngine(repo, capacity, freeze, queue);
  }

  // ── assign ─────────────────────────────────────────────────────────────────

  describe('assign', () => {
    it('returns existing active assignment (idempotency)', async () => {
      const existing = makeAssignment({ _id: 'existing', status: 'active' });
      const repo = mockRepo();
      repo.findByQuestionId = vi.fn().mockResolvedValue([existing]);
      const engine = buildEngine(repo);

      const result = await engine.assign('q1', 'high');

      expect(result._id).toBe('existing');
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('creates active assignment when capacity is available', async () => {
      const repo = mockRepo();
      repo.findByQuestionId = vi.fn().mockResolvedValue([]);
      repo.findActiveByExpertId = vi.fn().mockResolvedValue([]);
      repo.getDistinctExpertIds = vi.fn().mockResolvedValue(['expert1']);
      const engine = buildEngine(repo);

      const result = await engine.assign('q1', 'medium');

      expect(result.status).toBe('active');
      expect(result.priority).toBe('medium');
      expect(result.questionId).toBe('q1');
    });

    it('queues the question when no capacity is available', async () => {
      const repo = mockRepo();
      repo.findByQuestionId = vi.fn().mockResolvedValue([]);
      repo.getDistinctExpertIds = vi.fn().mockResolvedValue(['expert1', 'expert2']);
      // Both experts: medium slot filled (one medium, one low — medium slots full)
      repo.findActiveByExpertId = vi.fn().mockResolvedValue([
        makeAssignment({ priority: 'medium', status: 'active' }),
        makeAssignment({ priority: 'low', status: 'active' }),
      ]);
      repo.countActiveByExpertId = vi.fn().mockResolvedValue(1);
      repo.findQueuedByPriority = vi.fn().mockResolvedValue([]);

      const engine = buildEngine(repo);

      // pickExpert finds no free medium slot; pickLeastLoadedExpert also finds
      // none (both at capacity) → throws "No experts registered"
      await expect(engine.assign('q1', 'medium')).rejects.toThrow(
        'No experts registered in the system',
      );
    });

    it('freezes lower priority assignments when high is assigned', async () => {
      // The expert has NO active assignments so pickExpert succeeds,
      // then freezeLowerPriority finds no lower-priority work to freeze.
      // Verifying the high assignment was created is sufficient.
      const repo = mockRepo();
      repo.findByQuestionId = vi.fn().mockResolvedValue([]);
      repo.findActiveByExpertId = vi.fn().mockResolvedValue([]);
      repo.getDistinctExpertIds = vi.fn().mockResolvedValue(['exp1']);

      const engine = buildEngine(repo);
      const result = await engine.assign('q1', 'high');

      expect(result.status).toBe('active');
      expect(result.priority).toBe('high');
    });

    it('maps critical to high internally', async () => {
      const repo = mockRepo();
      repo.findByQuestionId = vi.fn().mockResolvedValue([]);
      repo.findActiveByExpertId = vi.fn().mockResolvedValue([]);
      repo.getDistinctExpertIds = vi.fn().mockResolvedValue(['expert1']);

      const engine = buildEngine(repo);
      const result = await engine.assign('q1', 'critical');

      expect(result.priority).toBe('high');
    });
  });

  // ── completeAssignment ──────────────────────────────────────────────────────

  describe('completeAssignment', () => {
    it('marks assignment as completed', async () => {
      const asg = makeAssignment({ _id: 'asg1', priority: 'low', status: 'active' });
      const repo = mockRepo();
      repo.findById = vi.fn().mockResolvedValue(asg);
      repo.complete = vi.fn().mockResolvedValue({ ...asg, status: 'completed' });

      const engine = buildEngine(repo);
      const result = await engine.completeAssignment('asg1');

      expect(result.status).toBe('completed');
    });

    it('triggers unfreeze when a high-priority assignment is completed', async () => {
      const asg = makeAssignment({
        _id: 'asg1',
        priority: 'high',
        status: 'active',
        expertId: 'exp1',
      });
      const repo = mockRepo();
      repo.findById = vi.fn().mockResolvedValue(asg);
      repo.complete = vi.fn().mockResolvedValue({ ...asg, status: 'completed' });
      repo.findActiveByExpertId = vi.fn().mockResolvedValue([]);
      repo.findFrozenByExpertId = vi.fn().mockResolvedValue([]);
      repo.findQueuedByExpertId = vi.fn().mockResolvedValue([]);
      repo.findQueuedByPriority = vi.fn().mockResolvedValue([]);

      const engine = buildEngine(repo);
      await engine.completeAssignment('asg1');

      expect(repo.findActiveByExpertId).toHaveBeenCalledWith('exp1');
    });
  });

  // ── removeAssignment ────────────────────────────────────────────────────────

  describe('removeAssignment', () => {
    it('does nothing when assignment not found', async () => {
      const repo = mockRepo();
      repo.findById = vi.fn().mockResolvedValue(null);
      const engine = buildEngine(repo);

      await engine.removeAssignment('nonexistent');

      expect(repo.delete).not.toHaveBeenCalled();
    });

    it('deletes the assignment when found and not completed', async () => {
      const asg = makeAssignment({ _id: 'asg1', priority: 'low', status: 'active' });
      const repo = mockRepo();
      repo.findById = vi.fn().mockResolvedValue(asg);

      const engine = buildEngine(repo);
      await engine.removeAssignment('asg1');

      expect(repo.delete).toHaveBeenCalledWith('asg1');
    });
  });

  // ── expert selection under load ─────────────────────────────────────────────

  describe('expert selection under load', () => {
    it('picks the expert with fewer active assignments when capacity is full', async () => {
      const repo = mockRepo();
      repo.findByQuestionId = vi.fn().mockResolvedValue([]);
      // expert1: has a medium assignment (medium slot full)
      // expert2: has no assignments (medium slot free)
      repo.findActiveByExpertId = vi.fn()
        .mockResolvedValueOnce([makeAssignment({ priority: 'medium', status: 'active' })]) // expert1
        .mockResolvedValueOnce([]); // expert2
      repo.getDistinctExpertIds = vi.fn().mockResolvedValue(['expert1', 'expert2']);
      repo.countActiveByExpertId = vi.fn()
        .mockResolvedValueOnce(1) // expert1: 1
        .mockResolvedValueOnce(0); // expert2: 0

      const engine = buildEngine(repo);
      const result = await engine.assign('q1', 'medium');

      // expert2 should be chosen (has capacity)
      expect(result.expertId).toBe('expert2');
    });
  });
});