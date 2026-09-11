import multer from "multer";
import { env } from "../config/env";

/** Buffers one bounded file; StorageService controls the final filesystem location. */
export const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Math.min(env.MAX_FILE_SIZE_MB, 10) * 1024 * 1024, files: 1 },
});
