import { IAnswerDocument } from '#root/shared/interfaces/models.js';
import { ClientSession, ObjectId } from 'mongodb';

export interface IAnswerDocumentRepository {
  createDocument(
    document: IAnswerDocument,
    session?: ClientSession,
  ): Promise<{ insertedId: string }>;

  getById(
    id: string | ObjectId,
    session?: ClientSession,
  ): Promise<IAnswerDocument | null>;

  /** Marks the document as referenced by a persisted answer. */
  linkToAnswer(
    id: string | ObjectId,
    answerId: string | ObjectId,
    session?: ClientSession,
  ): Promise<void>;
}
