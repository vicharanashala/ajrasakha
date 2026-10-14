import { IAnswerDocument } from '#root/shared/interfaces/models.js';

export interface UploadDocumentResult {
  document: {
    id: string;
    filename: string;
    mimeType: string;
    size: number;
  };
}

export interface StoredDocument {
  filename: string;
  mimeType: string;
  size: number;
  content: Buffer;
}

export interface IAnswerDocumentService {
  uploadDocument(
    file: Express.Multer.File,
    userId: string,
  ): Promise<UploadDocumentResult>;

  /** Auth-gated retrieval of the raw file bytes + metadata. */
  getDocument(
    id: string,
    userId: string,
  ): Promise<StoredDocument>;

  /** Returns the metadata record (used by the answer flow to link documents). */
  getDocumentMetadata(id: string): Promise<IAnswerDocument | null>;
}
