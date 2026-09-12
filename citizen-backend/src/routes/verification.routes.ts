import { Router } from "express";
import { completeEkyc, completeFace, completeFingerprintStep, fingerprintStatus, pairFingerprint } from "../controllers/identity-verification.controller";
import { requireAuth, requireRole } from "../middleware/require-auth";
import { asyncHandler } from "../utils/async-handler";
import { validate } from "../middleware/validate";
import { faceCompleteSchema, fingerprintPairSchema, fingerprintStatusSchema, fingerprintStepSchema } from "../validators/verification.validators";

export const verificationRouter = Router();
verificationRouter.use(requireAuth, requireRole("CITIZEN"));
verificationRouter.post("/verifications/:verificationId/face/complete", validate(faceCompleteSchema), asyncHandler(completeFace));
verificationRouter.post("/fingerprint-sessions/:sessionId/pair", validate(fingerprintPairSchema), asyncHandler(pairFingerprint));
verificationRouter.post("/fingerprint-sessions/:sessionId/steps/:step/complete", validate(fingerprintStepSchema), asyncHandler(completeFingerprintStep));
verificationRouter.get("/fingerprint-sessions/:sessionId/status", validate(fingerprintStatusSchema), asyncHandler(fingerprintStatus));
