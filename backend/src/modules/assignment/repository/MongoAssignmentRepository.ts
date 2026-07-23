import { ObjectId } from 'mongodb';
import { injectable, inject } from 'inversify';
import { GLOBAL_TYPES } from '#root/types.js';
import { MongoDatabase } from '#shared/database/providers/mongo/MongoDatabase.js';
import { IAssignmentRepository } from './IAssignmentRepository.js';
import {
  AssignmentPriority,
  AssignmentStatus,
  IAssignment,
} from '../types.js';

const COLLECTION = 'assignments';

@injectable()
export class MongoAssignmentRepository implements IAssignmentRepository {
  constructor(
    @inject(GLOBAL_TYPES.Database)
    private readonly db: MongoDatabase,
  ) {}

  private async collection() {
    return this.db.getCollection<IAssignment>(COLLECTION);
  }

  private formatDoc(doc: IAssignment): IAssignment {
    if (!doc) return doc;
    return {
      ...doc,
      _id: doc._id?.toString(),
      questionId:
        typeof doc.questionId === 'object'
          ? (doc.questionId as ObjectId).toString()
          : doc.questionId,
      expertId:
        typeof doc.expertId === 'object'
          ? (doc.expertId as ObjectId).toString()
          : doc.expertId,
    };
  }

  async create(
    assignment: Omit<IAssignment, '_id'>,
  ): Promise<IAssignment> {
    const col = await this.collection();
    const doc: IAssignment = {
      ...assignment,
      _id: undefined,
      createdAt: assignment.createdAt ?? new Date(),
      updatedAt: new Date(),
    };
    const result = await col.insertOne(doc as any);
    return { ...doc, _id: result.insertedId.toString() } as IAssignment;
  }

  async findById(id: string): Promise<IAssignment | null> {
    const col = await this.collection();
    const doc = await col.findOne({ _id: new ObjectId(id) } as any);
    return this.formatDoc(doc as IAssignment);
  }

  async findByQuestionId(questionId: string): Promise<IAssignment[]> {
    const col = await this.collection();
    const docs = await col
      .find({ questionId } as any)
      .toArray();
    return docs.map(d => this.formatDoc(d as IAssignment));
  }

  async findByExpertId(expertId: string): Promise<IAssignment[]> {
    const col = await this.collection();
    const docs = await col
      .find({ expertId } as any)
      .toArray();
    return docs.map(d => this.formatDoc(d as IAssignment));
  }

  async findActiveByExpertId(expertId: string): Promise<IAssignment[]> {
    const col = await this.collection();
    const docs = await col
      .find({ expertId, status: 'active' } as any)
      .toArray();
    return docs.map(d => this.formatDoc(d as IAssignment));
  }

  async findFrozenByExpertId(expertId: string): Promise<IAssignment[]> {
    const col = await this.collection();
    const docs = await col
      .find({ expertId, status: 'frozen' } as any)
      .toArray();
    return docs.map(d => this.formatDoc(d as IAssignment));
  }

  async findQueuedByExpertId(expertId: string): Promise<IAssignment[]> {
    const col = await this.collection();
    const docs = await col
      .find({ expertId, status: 'queued' } as any)
      .toArray();
    return docs.map(d => this.formatDoc(d as IAssignment));
  }

  async updateStatus(
    id: string,
    status: AssignmentStatus,
  ): Promise<IAssignment> {
    const col = await this.collection();
    const result = await col.findOneAndUpdate(
      { _id: new ObjectId(id) } as any,
      {
        $set: {
          status,
          updatedAt: new Date(),
          ...(status === 'completed' ? { completedAt: new Date() } : {}),
        },
      },
      { returnDocument: 'after' },
    );
    if (!result) throw new Error(`Assignment ${id} not found`);
    return this.formatDoc(result as IAssignment);
  }

  async updateStatusByQuestionId(
    questionId: string,
    status: AssignmentStatus,
  ): Promise<IAssignment | null> {
    const col = await this.collection();
    const result = await col.findOneAndUpdate(
      { questionId } as any,
      {
        $set: {
          status,
          updatedAt: new Date(),
          ...(status === 'completed' ? { completedAt: new Date() } : {}),
        },
      },
      { returnDocument: 'after' },
    );
    return result ? this.formatDoc(result as IAssignment) : null;
  }

  async complete(id: string): Promise<IAssignment> {
    return this.updateStatus(id, 'completed');
  }

  async delete(id: string): Promise<void> {
    const col = await this.collection();
    await col.deleteOne({ _id: new ObjectId(id) } as any);
  }

  async deleteByQuestionId(questionId: string): Promise<void> {
    const col = await this.collection();
    await col.deleteOne({ questionId } as any);
  }

  async countActiveByExpertId(expertId: string): Promise<number> {
    const col = await this.collection();
    return col.countDocuments({ expertId, status: 'active' } as any);
  }

  async countByStatus(status: AssignmentStatus): Promise<number> {
    const col = await this.collection();
    return col.countDocuments({ status } as any);
  }

  async countCompletedInRange(start: Date, end: Date): Promise<number> {
    const col = await this.collection();
    return col.countDocuments({
      status: 'completed',
      completedAt: { $gte: start, $lte: end },
    } as any);
  }

  async getDistinctExpertIds(): Promise<string[]> {
    const col = await this.collection();
    const docs = await col.distinct('expertId');
    return docs.map(d =>
      typeof d === 'object' ? (d as ObjectId).toString() : String(d),
    );
  }

  async findAllActive(): Promise<IAssignment[]> {
    const col = await this.collection();
    const docs = await col
      .find({ status: 'active' } as any)
      .toArray();
    return docs.map(d => this.formatDoc(d as IAssignment));
  }

  async findAllFrozen(): Promise<IAssignment[]> {
    const col = await this.collection();
    const docs = await col
      .find({ status: 'frozen' } as any)
      .toArray();
    return docs.map(d => this.formatDoc(d as IAssignment));
  }

  async findQueuedByPriority(
    priority: AssignmentPriority,
  ): Promise<IAssignment[]> {
    const col = await this.collection();
    const docs = await col
      .find({ status: 'queued', priority } as any)
      .toArray();
    return docs.map(d => this.formatDoc(d as IAssignment));
  }
}