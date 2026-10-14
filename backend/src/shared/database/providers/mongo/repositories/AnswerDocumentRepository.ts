import { IAnswerDocumentRepository } from '#root/shared/database/interfaces/IAnswerDocumentRepository.js';
import { IAnswerDocument } from '#root/shared/interfaces/models.js';
import { GLOBAL_TYPES } from '#root/types.js';
import { inject, injectable } from 'inversify';
import { Collection, ClientSession, ObjectId } from 'mongodb';
import { MongoDatabase } from '../MongoDatabase.js';

@injectable()
export class AnswerDocumentRepository implements IAnswerDocumentRepository {
  private AnswerDocumentCollection: Collection<IAnswerDocument>;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private readonly db: MongoDatabase,
  ) {}

  private async init() {
    this.AnswerDocumentCollection =
      await this.db.getCollection<IAnswerDocument>('answerdocuments');
  }

  private async ensureInit() {
    if (!this.AnswerDocumentCollection) {
      await this.init();
    }
  }

  async createDocument(
    document: IAnswerDocument,
    session?: ClientSession,
  ): Promise<{ insertedId: string }> {
    await this.ensureInit();
    const result = await this.AnswerDocumentCollection.insertOne(document, {
      session,
    });
    return { insertedId: result.insertedId.toString() };
  }

  async getById(
    id: string | ObjectId,
    session?: ClientSession,
  ): Promise<IAnswerDocument | null> {
    await this.ensureInit();
    const objectId = id instanceof ObjectId ? id : new ObjectId(id);
    return this.AnswerDocumentCollection.findOne({ _id: objectId }, { session });
  }

  async linkToAnswer(
    id: string | ObjectId,
    answerId: string | ObjectId,
    session?: ClientSession,
  ): Promise<void> {
    await this.ensureInit();
    const objectId = id instanceof ObjectId ? id : new ObjectId(id);
    const linkedAnswerId =
      answerId instanceof ObjectId ? answerId : new ObjectId(answerId);
    await this.AnswerDocumentCollection.updateOne(
      { _id: objectId },
      { $set: { linkedAnswerId, linkedAt: new Date() } },
      { session },
    );
  }
}
