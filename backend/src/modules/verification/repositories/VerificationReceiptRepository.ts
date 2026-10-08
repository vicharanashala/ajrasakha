import {inject, injectable} from 'inversify';
import {Collection} from 'mongodb';
import {GLOBAL_TYPES} from '#root/types.js';
import {MongoDatabase} from '#root/shared/index.js';
import {IVerificationReceipt} from '../types/index.js';

/**
 * Persists one receipt per gate decision into the `verification_receipts`
 * collection — the audit trail behind every verdict AjraVerify produces.
 */
@injectable()
export class VerificationReceiptRepository {
  private receiptCollection: Collection<IVerificationReceipt> | null = null;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private readonly db: MongoDatabase,
  ) {}

  private async init(): Promise<void> {
    if (this.receiptCollection) return;
    this.receiptCollection =
      await this.db.getCollection<IVerificationReceipt>('verification_receipts');
    await this.ensureIndexes();
  }

  private async ensureIndexes(): Promise<void> {
    try {
      await this.receiptCollection!.createIndex({questionId: 1});
      await this.receiptCollection!.createIndex({answerId: 1}, {sparse: true});
      await this.receiptCollection!.createIndex({createdAt: -1});
      await this.receiptCollection!.createIndex({verdict: 1, createdAt: -1});
    } catch (error) {
      console.error('Failed to create verification receipt indexes:', error);
    }
  }

  async addReceipt(
    receipt: Omit<IVerificationReceipt, '_id'>,
  ): Promise<IVerificationReceipt> {
    await this.init();
    const {insertedId} = await this.receiptCollection!.insertOne(receipt as any);
    return {...receipt, _id: insertedId.toString()} as IVerificationReceipt;
  }

  async getByQuestionId(questionId: string): Promise<IVerificationReceipt | null> {
    await this.init();
    const doc = await this.receiptCollection!.findOne(
      {questionId},
      {sort: {createdAt: -1}},
    );
    if (!doc) return null;
    return this.serialize(doc);
  }

  async getRecent(limit = 50, verdict?: string): Promise<IVerificationReceipt[]> {
    await this.init();
    const filter: Record<string, unknown> = {};
    if (verdict) filter.verdict = verdict;
    const docs = await this.receiptCollection!
      .find(filter)
      .sort({createdAt: -1})
      .limit(limit)
      .toArray();
    return docs.map(d => this.serialize(d));
  }

  /** Count receipts, optionally restricted to a single verdict. */
  async count(verdict?: string): Promise<number> {
    await this.init();
    const filter: Record<string, unknown> = {};
    if (verdict) filter.verdict = verdict;
    return this.receiptCollection!.countDocuments(filter);
  }

  private serialize(doc: IVerificationReceipt): IVerificationReceipt {
    return {
      ...doc,
      _id: doc._id?.toString(),
      questionId: doc.questionId?.toString() ?? null,
      answerId: doc.answerId?.toString() ?? null,
    };
  }
}
