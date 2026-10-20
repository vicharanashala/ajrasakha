import { randomUUID } from 'node:crypto';
import { inject, injectable } from 'inversify';
import { Collection, Document, MongoServerError } from 'mongodb';
import { MongoDatabase } from '#root/shared/index.js';
import { GLOBAL_TYPES } from '#root/types.js';

type FeedbackStatus = 'pending' | 'answered' | 'expired';
type FeedbackChoice = '1' | '2';

interface FarmerFeedbackPrompt extends Document {
  sessionId: string;
  phoneNumber: string;
  gdbEntryId: string;
  questionId?: string;
  domain?: string;
  language?: string;
  state?: string;
  status: FeedbackStatus;
  createdAt: Date;
  expiresAt: Date;
  response?: FeedbackChoice;
  inboundMessageId?: string;
  answeredAt?: Date;
}

export type FeedbackReplyResult =
  | { status: 'recorded'; sessionId: string; gdbEntryId: string; isHelpful: boolean }
  | { status: 'duplicate' | 'already_answered' | 'expired' | 'not_found' }
  | { status: 'ambiguous'; pendingCount: number };

/**
 * Stores the server-side link between an answer delivered on WhatsApp and the
 * farmer's later rating. A reply never supplies its own GDB ID.
 */
@injectable()
export class FarmerFeedbackCorrelationService {
  private collectionPromise?: Promise<Collection<FarmerFeedbackPrompt>>;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private readonly database: MongoDatabase,
  ) {}

  private async getCollection(): Promise<Collection<FarmerFeedbackPrompt>> {
    if (!this.collectionPromise) {
      this.collectionPromise = (async () => {
        const collection = await this.database.getCollection<FarmerFeedbackPrompt>(
          'farmer_feedback_prompts',
        );
        await collection.createIndex({ sessionId: 1 }, { unique: true });
        await collection.createIndex(
          { inboundMessageId: 1 },
          {
            unique: true,
            partialFilterExpression: { inboundMessageId: { $type: 'string' } },
          },
        );
        await collection.createIndex({ phoneNumber: 1, status: 1, expiresAt: 1 });
        return collection;
      })();
    }
    return this.collectionPromise;
  }

  /** Register the GDB identity before sending the follow-up prompt. */
  async registerPrompt(input: {
    phoneNumber: string;
    gdbEntryId: string;
    questionId?: string;
    domain?: string;
    language?: string;
    state?: string;
    expiresInHours?: number;
  }): Promise<{ sessionId: string; createdAt: Date; expiresAt: Date }> {
    if (!input.phoneNumber.trim() || !input.gdbEntryId.trim()) {
      throw new Error('phoneNumber and gdbEntryId are required to register feedback');
    }
    if (
      input.expiresInHours !== undefined &&
      (!Number.isFinite(input.expiresInHours) || input.expiresInHours <= 0)
    ) {
      throw new Error('expiresInHours must be a positive finite number');
    }

    const collection = await this.getCollection();
    const createdAt = new Date();
    const expiresAt = new Date(
      createdAt.getTime() + (input.expiresInHours ?? 48) * 60 * 60 * 1000,
    );
    const sessionId = randomUUID();

    await collection.insertOne({
      ...input,
      sessionId,
      status: 'pending',
      createdAt,
      expiresAt,
    });

    return { sessionId, createdAt, expiresAt };
  }

  /**
   * Record a reply exactly once. Interactive button replies should pass the
   * session ID. Plain-text 1/2 replies are accepted only when one pending
   * prompt exists for that phone number, avoiding latest-answer misattribution.
   */
  async recordReply(input: {
    phoneNumber: string;
    inboundMessageId: string;
    response: FeedbackChoice;
    sessionId?: string;
  }): Promise<FeedbackReplyResult> {
    if (!input.phoneNumber.trim() || !input.inboundMessageId.trim()) {
      throw new Error('phoneNumber and inboundMessageId are required to record feedback');
    }
    if (input.response !== '1' && input.response !== '2') {
      throw new Error('response must be 1 (helpful) or 2 (not helpful)');
    }

    const collection = await this.getCollection();
    const now = new Date();
    let sessionId = input.sessionId;

    if (!sessionId) {
      const pending = await collection
        .find({
          phoneNumber: input.phoneNumber,
          status: 'pending',
          expiresAt: { $gt: now },
        })
        .project({ sessionId: 1 })
        .limit(2)
        .toArray();

      if (pending.length > 1) {
        const pendingCount = await collection.countDocuments({
          phoneNumber: input.phoneNumber,
          status: 'pending',
          expiresAt: { $gt: now },
        });
        return { status: 'ambiguous', pendingCount };
      }
      if (pending.length === 0) return { status: 'not_found' };
      sessionId = pending[0].sessionId;
    }

    try {
      const claim = await collection.updateOne(
        {
          sessionId,
          phoneNumber: input.phoneNumber,
          status: 'pending',
          expiresAt: { $gt: now },
        },
        {
          $set: {
            status: 'answered',
            response: input.response,
            inboundMessageId: input.inboundMessageId,
            answeredAt: now,
          },
        },
      );

      if (claim.modifiedCount === 1) {
        const prompt = await collection.findOne({ sessionId });
        if (!prompt) return { status: 'not_found' };
        return {
          status: 'recorded',
          sessionId,
          gdbEntryId: prompt.gdbEntryId,
          isHelpful: input.response === '1',
        };
      }
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        return { status: 'duplicate' };
      }
      throw error;
    }

    const existing = await collection.findOne({ sessionId, phoneNumber: input.phoneNumber });
    if (!existing) return { status: 'not_found' };
    if (existing.inboundMessageId === input.inboundMessageId) {
      return { status: 'duplicate' };
    }
    if (existing.expiresAt <= now) return { status: 'expired' };
    return { status: 'already_answered' };
  }
}
