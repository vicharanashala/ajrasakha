import multer from 'multer';
import { BadRequestError } from 'routing-controllers';

/** Image upload for a crop/vertical entry — jpeg / png / webp / gif, up to 5 MB. */
export const ImageUploadFileOptions: multer.Options = {
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|jpg|png|webp|gif)$/.test(file.mimetype);
    if (ok) {
      cb(null, true);
    } else {
      cb(new BadRequestError('Only JPEG, PNG, WEBP or GIF images are allowed'));
    }
  },
};

export const CsvUploadFileOptions: multer.Options = {
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const filename = file.originalname.toLowerCase();
    const isCSV =
      file.mimetype === 'text/csv' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      filename.endsWith('.csv');

    if (isCSV) {
      cb(null, true);
    } else {
      cb(new BadRequestError('Only CSV files are allowed for bulk upload'));
    }
  },
};
