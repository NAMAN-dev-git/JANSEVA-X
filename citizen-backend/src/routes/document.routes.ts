import { Router } from "express";
import { analyzeDocument, deleteDocument, getDocument, getDocumentVerification } from "../controllers/document.controller";
import { requireActiveAccount, requireAuth, requireRole } from "../middleware/require-auth";
import { asyncHandler } from "../utils/async-handler";
import { validate } from "../middleware/validate";
import { documentIdParamsSchema } from "../validators/document.validators";

export const documentRouter = Router();

documentRouter.use(requireAuth, requireActiveAccount, requireRole("CITIZEN"));
documentRouter.get("/:documentId", validate(documentIdParamsSchema), asyncHandler(getDocument));
documentRouter.delete("/:documentId", validate(documentIdParamsSchema), asyncHandler(deleteDocument));
documentRouter.post("/:documentId/analyze", validate(documentIdParamsSchema), asyncHandler(analyzeDocument));
documentRouter.get("/:documentId/verification", validate(documentIdParamsSchema), asyncHandler(getDocumentVerification));
