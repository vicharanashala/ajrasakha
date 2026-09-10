import multer from 'multer';
import {BadRequestError} from 'routing-controllers';

export const plantScanUploadOptions: multer.Options = {
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new BadRequestError('Only image files are allowed'));
      return;
    }

    cb(null, true);
  },
};
