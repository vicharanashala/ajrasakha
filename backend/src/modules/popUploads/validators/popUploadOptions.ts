import multer from 'multer';
import {BadRequestError} from 'routing-controllers';

/** Kept in memory (not disk) so the buffer can be hashed and streamed straight into GridFS —
 *  same reasoning as dashboard/validators/mediaUploadOptions.ts. 60MB gives headroom over the
 *  largest real-world failures seen so far (~30MB) without being unbounded. */
export const popUploadOptions: multer.Options = {
  storage: multer.memoryStorage(),
  limits: {fileSize: 60 * 1024 * 1024},
  fileFilter: (_req, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new BadRequestError('Only PDF files are allowed'));
    }
  },
};
