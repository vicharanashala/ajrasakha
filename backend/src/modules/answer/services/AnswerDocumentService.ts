import { inject, injectable } from 'inversify';
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { NotFoundError } from 'routing-controllers';
import { Storage } from '@google-cloud/storage';
import { GLOBAL_TYPES } from '#root/types.js';
import { CORE_TYPES } from '#root/modules/core/types.js';
import { storageConfig } from '#root/config/storage.js';
import { appConfig } from '#root/config/app.js';
import { IAnswerDocumentRepository } from '#root/shared/database/interfaces/IAnswerDocumentRepository.js';
import { IAnswerDocument } from '#root/shared/interfaces/models.js';
import {
  IAnswerDocumentService,
  StoredDocument,
  UploadDocumentResult,
} from '../interfaces/IAnswerDocumentService.js';

const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx'];

const isGcsConfigured = (): boolean =>
  Boolean(
    storageConfig.googleCloud.projectId &&
      appConfig.GOOGLE_APPLICATION_CREDENTIALS,
  );

const sanitizeFilename = (originalName: string): string => {
  const base = path.basename(originalName || 'document');
  const ext =
    ALLOWED_EXTENSIONS.find((e) => base.toLowerCase().endsWith(e)) || '';
  let stem = ext ? base.slice(0, -ext.length) : base;
  stem = stem
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._]+|[._]+$/g, '')
    .slice(0, 60);
  if (!stem) stem = 'document';
  return `${stem}${ext}`;
};

@injectable()
export class AnswerDocumentService implements IAnswerDocumentService {
  constructor(
    @inject(CORE_TYPES.AnswerDocumentRepository)
    private readonly documentRepo: IAnswerDocumentRepository,
  ) {}

  async uploadDocument(
    file: Express.Multer.File,
    userId: string,
  ): Promise<UploadDocumentResult> {
    const filename = sanitizeFilename(file.originalname);
    const ext = path.extname(filename).toLowerCase();
    const storedName = `${Date.now()}-${randomUUID()}${ext}`;

    const storagePath = isGcsConfigured()
      ? `documents/${storedName}`
      : path.join(storageConfig.documents.localDir, storedName);

    if (isGcsConfigured()) {
      const storage = new Storage({
        projectId: storageConfig.googleCloud.projectId,
      });
      const bucket = storage.bucket(
        storageConfig.googleCloud.documentsBucketName,
      );
      await bucket.file(storagePath).save(file.buffer, {
        resumable: false,
        contentType: file.mimetype,
      });
    } else {
      await fs.mkdir(storageConfig.documents.localDir, { recursive: true });
      await fs.writeFile(storagePath, file.buffer);
    }

    const metadata: IAnswerDocument = {
      filename,
      storedName,
      storagePath,
      mimeType: file.mimetype,
      size: file.size,
      uploadedBy: userId,
      uploadedAt: new Date(),
    };

    const { insertedId } = await this.documentRepo.createDocument(metadata);

    return {
      document: {
        id: insertedId,
        filename,
        mimeType: file.mimetype,
        size: file.size,
      },
    };
  }

  async getDocument(id: string, _userId: string): Promise<StoredDocument> {
    const document = await this.documentRepo.getById(id);
    if (!document) {
      throw new NotFoundError('Document not found.');
    }

    let content: Buffer;
    if (isGcsConfigured()) {
      const storage = new Storage({
        projectId: storageConfig.googleCloud.projectId,
      });
      const bucket = storage.bucket(
        storageConfig.googleCloud.documentsBucketName,
      );
      const [data] = await bucket.file(document.storagePath).download();
      content = data;
    } else {
      content = await fs.readFile(document.storagePath);
    }

    return {
      filename: document.filename,
      mimeType: document.mimeType,
      size: content.length,
      content,
    };
  }

  async getDocumentMetadata(id: string): Promise<IAnswerDocument | null> {
    return this.documentRepo.getById(id);
  }
}
