import { Router } from "express";
import { createApplication, getApplication, getApplicationHistory, listApplications, submitApplication, updateApplication } from "../controllers/application.controller";
import { listApplicationDocuments, uploadApplicationDocument } from "../controllers/document.controller";
import { completeEkyc, startFace, startFingerprint, verificationSummary, verifyAadhaar, verifyPan } from "../controllers/identity-verification.controller";
import { documentUpload } from "../middleware/document-upload";
import { requireAuth, requireRole } from "../middleware/require-auth";
import { validate } from "../middleware/validate";
import { asyncHandler } from "../utils/async-handler";
import {
  applicationIdParamsSchema,
  createApplicationRequestSchema,
  listApplicationsRequestSchema,
  submitApplicationRequestSchema,
  updateApplicationRequestSchema,
} from "../validators/application.validators";
import { applicationDocumentUploadParamsSchema } from "../validators/document.validators";
import { aadhaarVerificationSchema, applicationVerificationEmptySchema, panVerificationSchema } from "../validators/verification.validators";

export const applicationRouter = Router();

applicationRouter.use(requireAuth, requireRole("CITIZEN"));
applicationRouter.post("/", validate(createApplicationRequestSchema), asyncHandler(createApplication));
applicationRouter.get("/", validate(listApplicationsRequestSchema), asyncHandler(listApplications));
applicationRouter.post("/:applicationId/documents", validate(applicationDocumentUploadParamsSchema), documentUpload.single("file"), asyncHandler(uploadApplicationDocument));
applicationRouter.get("/:applicationId/documents", validate(applicationIdParamsSchema), asyncHandler(listApplicationDocuments));
applicationRouter.post("/:applicationId/verifications/aadhaar", validate(aadhaarVerificationSchema), asyncHandler(verifyAadhaar));
applicationRouter.post("/:applicationId/verifications/pan", validate(panVerificationSchema), asyncHandler(verifyPan));
applicationRouter.post("/:applicationId/verifications/face/start", validate(applicationVerificationEmptySchema), asyncHandler(startFace));
applicationRouter.post("/:applicationId/verifications/fingerprint/start", validate(applicationVerificationEmptySchema), asyncHandler(startFingerprint));
applicationRouter.post("/:applicationId/verifications/ekyc", validate(applicationVerificationEmptySchema), asyncHandler(completeEkyc));
applicationRouter.get("/:applicationId/verifications/summary", validate(applicationVerificationEmptySchema), asyncHandler(verificationSummary));
applicationRouter.get("/:applicationId", validate(applicationIdParamsSchema), asyncHandler(getApplication));
applicationRouter.patch("/:applicationId", validate(updateApplicationRequestSchema), asyncHandler(updateApplication));
applicationRouter.post("/:applicationId/submit", validate(submitApplicationRequestSchema), asyncHandler(submitApplication));
applicationRouter.get("/:applicationId/history", validate(applicationIdParamsSchema), asyncHandler(getApplicationHistory));
