import multer from "multer";
import { AppError } from "../utils/AppError";

/**
 * Multer instance using memory storage.
 * Files are available as `req.file.buffer` for upload to Cloudinary.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1 * 1024 * 1024 }, // 1 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/") || file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new AppError(400, "Only image and PDF files are allowed!"));
    }
  },
});

export const uploadScreenshot = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB for payment receipts/screenshots
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new AppError(400, "Only image files are allowed for payment screenshot!"));
    }
  },
});

export default upload;
