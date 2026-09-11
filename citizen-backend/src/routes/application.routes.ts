import { Router } from "express";
import { createApplication, getApplication, getApplicationHistory, listApplications, submitApplication, updateApplication } from "../controllers/application.controller";
import { listApplicationDocuments, uploadApplicationDocument } from "../controllers/document.controller";
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

export const applicationRouter = Router();

applicationRouter.use(requireAuth, requireRole("CITIZEN"));
applicationRouter.post("/", validate(createApplicationRequestSchema), asyncHandler(createApplication));
applicationRouter.get("/", validate(listApplicationsRequestSchema), asyncHandler(listApplications));
applicationRouter.post("/:applicationId/documents", validate(applicationDocumentUploadParamsSchema), documentUpload.single("file"), asyncHandler(uploadApplicationDocument));
applicationRouter.get("/:applicationId/documents", validate(applicationIdParamsSchema), asyncHandler(listApplicationDocuments));
applicationRouter.get("/:applicationId", validate(applicationIdParamsSchema), asyncHandler(getApplication));
applicationRouter.patch("/:applicationId", validate(updateApplicationRequestSchema), asyncHandler(updateApplication));
applicationRouter.post("/:applicationId/submit", validate(submitApplicationRequestSchema), asyncHandler(submitApplication));
applicationRouter.get("/:applicationId/history", validate(applicationIdParamsSchema), asyncHandler(getApplicationHistory));
