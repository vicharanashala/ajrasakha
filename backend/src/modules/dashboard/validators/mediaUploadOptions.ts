import multer from 'multer';
import {BadRequestError} from 'routing-controllers';

/** Multer options for public-dashboard outreach media (images + videos). Kept in memory
 *  so the buffer can be streamed straight to GCS. */
export const mediaUploadOptions: multer.Options = {
  storage: multer.memoryStorage(),
  limits: {fileSize: 50 * 1024 * 1024}, // 50 MB (videos can be large)
  fileFilter: (
    _req,
    file: Express.Multer.File,
    cb: multer.FileFilterCallback,
  ) => {
    if (
      file.mimetype.startsWith('image/') ||
      file.mimetype.startsWith('video/')
    ) {
      cb(null, true);
    } else {
      cb(new BadRequestError('Only image or video files are allowed'));
    }
  },
};
