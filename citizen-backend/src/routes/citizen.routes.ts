import { Router } from "express";
import { getProfile, updateProfile } from "../controllers/citizen.controller";
import { getDemoProfile, getIssuedDocument, listIssuedDocuments } from "../controllers/demo-profile.controller";
import { requireActiveAccount, requireAuth, requireRole } from "../middleware/require-auth";
import { validate } from "../middleware/validate";
import { asyncHandler } from "../utils/async-handler";
import { updateProfileRequestSchema } from "../validators/auth.validators";
import { issuedDocumentIdParamsSchema } from "../validators/demo-profile.validators";

export const citizenRouter = Router();

citizenRouter.use(requireAuth, requireActiveAccount, requireRole("CITIZEN"));
citizenRouter.get("/profile", asyncHandler(getProfile));
citizenRouter.patch("/profile", validate(updateProfileRequestSchema), asyncHandler(updateProfile));
citizenRouter.get("/demo-profile", asyncHandler(getDemoProfile));
citizenRouter.get("/issued-documents", asyncHandler(listIssuedDocuments));
citizenRouter.get("/issued-documents/:documentId", validate(issuedDocumentIdParamsSchema), asyncHandler(getIssuedDocument));
