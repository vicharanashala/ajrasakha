import multer from 'multer';
import { BadRequestError } from 'routing-controllers';

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
