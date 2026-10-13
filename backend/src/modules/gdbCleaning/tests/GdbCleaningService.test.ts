import 'reflect-metadata';
import {describe, it, expect, beforeEach} from 'vitest';
import {ObjectId} from 'mongodb';
import {
  GdbCleaningStatus,
  IGdbCleaning,
} from '#root/shared/interfaces/models.js';
import {IGdbCleaningRepository} from '#root/shared/database/interfaces/IGdbCleaningRepository.js';
import {GdbCleaningService} from '../services/GdbCleaningService.js';

const reviewerId = new ObjectId().toString();

const makeDoc = (
  status: GdbCleaningStatus,
  overrides: Partial<IGdbCleaning> = {},
): IGdbCleaning => ({
  answerId: new ObjectId(),
  questionId: new ObjectId(),
  question: 'How to control stem borer in paddy?',
  answer: 'Spray Endosulfan.',
  state: 'Punjab',
  crop: 'Paddy',
  domain: 'Insect - Pest Management',
  sources: [],
  status,
  checks: [],
  flags: status === 'todo' ? ['banned_chemical'] : [],
  notEvaluated: [],
  correctedAnswer: null,
  checkedAt: null,
  pipelineVersion: null,
  model: null,
  reviewedBy: null,
  reviewedAt: null,
  ...overrides,
});

// Behaves like the real repository: only an answer that is still "todo" can change.
class FakeRepository implements IGdbCleaningRepository {
  constructor(public docs: IGdbCleaning[]) {}

  private find(answerId: string) {
    return this.docs.find(d => d.answerId.toString() === answerId) ?? null;
  }

  async list(filters: {page: number; limit: number}) {
    const start = (filters.page - 1) * filters.limit;
    return {
      rows: this.docs.slice(start, start + filters.limit),
      totalCount: this.docs.length,
    };
  }

  async getByAnswerId(answerId: string) {
    return this.find(answerId);
  }

  async countByStatus() {
    const counts = {pending: 0, clean: 0, todo: 0, fixed: 0, dismissed: 0};
    for (const doc of this.docs) counts[doc.status] += 1;
    return counts;
  }

  async getFilterOptions() {
    return {states: [], crops: [], flags: []};
  }

  async saveCorrection(answerId: string, correctedAnswer: string) {
    const doc = this.find(answerId);
    if (!doc || doc.status !== 'todo') return null;
    doc.correctedAnswer = correctedAnswer;
    return doc;
  }

  async decide(
    answerId: string,
    decision: {
      status: 'fixed' | 'dismissed';
      correctedAnswer?: string;
      comment: string | null;
      reviewerId: string;
    },
  ) {
    const doc = this.find(answerId);
    if (!doc || doc.status !== 'todo') return null;
    doc.status = decision.status;
    doc.comment = decision.comment;
    doc.reviewedBy = new ObjectId(decision.reviewerId);
    doc.reviewedAt = new Date();
    if (decision.correctedAnswer !== undefined) {
      doc.correctedAnswer = decision.correctedAnswer;
    }
    return doc;
  }
}

describe('GdbCleaningService', () => {
  let todo: IGdbCleaning;
  let decided: IGdbCleaning;
  let service: GdbCleaningService;

  beforeEach(() => {
    todo = makeDoc('todo');
    decided = makeDoc('fixed', {correctedAnswer: 'Spray Chlorantraniliprole.'});
    service = new GdbCleaningService(
      new FakeRepository([todo, decided, makeDoc('clean'), makeDoc('pending')]),
    );
  });

  it('lists with the page, limit and a page count', async () => {
    const result = await service.list({page: 1, limit: 3});
    expect(result.items).toHaveLength(3);
    expect(result.totalCount).toBe(4);
    expect(result.totalPages).toBe(2);
    expect(result.items[0].id).toBe(todo.answerId.toString());
  });

  it('counts each status and the total', async () => {
    const summary = await service.summary();
    expect(summary).toMatchObject({
      todo: 1,
      fixed: 1,
      clean: 1,
      pending: 1,
      dismissed: 0,
      total: 4,
    });
  });

  it('returns one answer, and 404 for an unknown one', async () => {
    const item = await service.get(todo.answerId.toString());
    expect(item.flags).toEqual(['banned_chemical']);
    await expect(service.get(new ObjectId().toString())).rejects.toMatchObject({
      httpCode: 404,
    });
  });

  it('refuses an empty correction', async () => {
    await expect(
      service.saveCorrection(todo.answerId.toString(), '   '),
    ).rejects.toMatchObject({httpCode: 400});
  });

  it('saves a correction without closing the answer', async () => {
    const item = await service.saveCorrection(
      todo.answerId.toString(),
      '  Spray Chlorantraniliprole.  ',
    );
    expect(item.correctedAnswer).toBe('Spray Chlorantraniliprole.');
    expect(item.status).toBe('todo');
  });

  it('cannot accept when there is no correction', async () => {
    await expect(
      service.decide(todo.answerId.toString(), {action: 'accept'}, reviewerId),
    ).rejects.toMatchObject({httpCode: 400});
    expect(todo.status).toBe('todo');
  });

  it('accepts the correction saved earlier', async () => {
    await service.saveCorrection(todo.answerId.toString(), 'Fixed text.');
    const item = await service.decide(
      todo.answerId.toString(),
      {action: 'accept', comment: ' checked with the PoP '},
      reviewerId,
    );
    expect(item.status).toBe('fixed');
    expect(item.correctedAnswer).toBe('Fixed text.');
    expect(item.comment).toBe('checked with the PoP');
    expect(item.reviewedAt).not.toBeNull();
  });

  it('accepts an edited correction sent with the decision', async () => {
    const item = await service.decide(
      todo.answerId.toString(),
      {action: 'accept', correctedAnswer: 'Edited text.'},
      reviewerId,
    );
    expect(item.status).toBe('fixed');
    expect(item.correctedAnswer).toBe('Edited text.');
  });

  it('dismisses the flags and keeps the answer text as it was', async () => {
    const item = await service.decide(
      todo.answerId.toString(),
      {action: 'dismiss', comment: ''},
      reviewerId,
    );
    expect(item.status).toBe('dismissed');
    expect(item.correctedAnswer).toBeNull();
    expect(item.comment).toBeNull();
  });

  it('never changes an answer that is already decided', async () => {
    const id = decided.answerId.toString();
    await expect(
      service.decide(id, {action: 'dismiss'}, reviewerId),
    ).rejects.toMatchObject({httpCode: 409});
    await expect(
      service.saveCorrection(id, 'Something else.'),
    ).rejects.toMatchObject({httpCode: 409});
    expect(decided.status).toBe('fixed');
    expect(decided.correctedAnswer).toBe('Spray Chlorantraniliprole.');
  });
});
