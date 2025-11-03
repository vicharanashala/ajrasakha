import multer from "multer";
import { BadRequestError } from "routing-controllers";
 
export const imageUploadOptions: multer.Options = {
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, //  max 10 mb img
  fileFilter: (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new BadRequestError("Only image files are allowed"));
    }
  },
};
 
export const audioUploadOptions: multer.Options = {
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 mb max for audio
  fileFilter: (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (file.mimetype.startsWith("audio/")) {
      cb(null, true);
    } else {
      cb(new BadRequestError("Only audio files are allowed"));
    }
  },
};


export const jsonUploadOptions: multer.Options = {
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // max 5 MB for JSON
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype === "application/json" ||
      file.originalname.toLowerCase().endsWith(".json")
    ) {
      cb(null, true);
    } else {
      cb(new BadRequestError("Only JSON files are allowed"));
    }
  }
}