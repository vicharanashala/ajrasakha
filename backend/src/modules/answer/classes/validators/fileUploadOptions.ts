import multer from 'multer';
import { BadRequestError } from 'routing-controllers';

const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx'];
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  // Some browsers/clients report the generic octet-stream for .doc files
  'application/octet-stream',
]);

export const AnswerDocumentUploadFileOptions: multer.Options = {
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    const filename = (file.originalname || '').toLowerCase();
    const extensionMatches = ALLOWED_EXTENSIONS.some((ext) =>
      filename.endsWith(ext),
    );
    const mimeMatches = ALLOWED_MIME_TYPES.has(file.mimetype);

    if (extensionMatches && mimeMatches) {
      cb(null, true);
      return;
    }

    cb(
      new BadRequestError(
        'Only PDF, DOC and DOCX files are allowed for document upload.',
      ),
    );
  },
};
