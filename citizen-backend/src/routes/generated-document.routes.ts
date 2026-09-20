import { Router } from "express";
import { completeGeneratedDocumentSigning, downloadGeneratedDocument, getGeneratedDocument, issueGeneratedDocument, startGeneratedDocumentSigning } from "../controllers/generated-document.controller";
import { requireActiveAccount, requireAuth, requireRole } from "../middleware/require-auth";
import { asyncHandler } from "../utils/async-handler";
import { validate } from "../middleware/validate";
import { generatedDocumentIdParamsSchema, generatedDocumentIssueSchema, generatedDocumentSigningCompleteSchema, generatedDocumentSigningStartSchema } from "../validators/generated-document.validators";

export const generatedDocumentRouter = Router();

// This deliberately remains a small demo bridge until employee-backend owns issuance.
generatedDocumentRouter.post("/applications/:applicationId/generated-documents", requireAuth, requireActiveAccount, requireRole("OFFICER", "ADMIN"), validate(generatedDocumentIssueSchema), asyncHandler(issueGeneratedDocument));

generatedDocumentRouter.use(requireAuth, requireActiveAccount, requireRole("CITIZEN"));
generatedDocumentRouter.get("/generated-documents/:generatedDocumentId/download", validate(generatedDocumentIdParamsSchema), asyncHandler(downloadGeneratedDocument));
generatedDocumentRouter.get("/generated-documents/:generatedDocumentId", validate(generatedDocumentIdParamsSchema), asyncHandler(getGeneratedDocument));
generatedDocumentRouter.post("/generated-documents/:generatedDocumentId/signing-sessions", validate(generatedDocumentSigningStartSchema), asyncHandler(startGeneratedDocumentSigning));
generatedDocumentRouter.post("/generated-document-signing-sessions/:sessionId/complete", validate(generatedDocumentSigningCompleteSchema), asyncHandler(completeGeneratedDocumentSigning));
