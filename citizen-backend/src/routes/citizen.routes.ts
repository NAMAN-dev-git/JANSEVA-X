import { Router } from "express";
import { getProfile, updateProfile } from "../controllers/citizen.controller";
import { requireAuth, requireRole } from "../middleware/require-auth";
import { validate } from "../middleware/validate";
import { asyncHandler } from "../utils/async-handler";
import { updateProfileRequestSchema } from "../validators/auth.validators";

export const citizenRouter = Router();

citizenRouter.use(requireAuth, requireRole("CITIZEN"));
citizenRouter.get("/profile", asyncHandler(getProfile));
citizenRouter.patch("/profile", validate(updateProfileRequestSchema), asyncHandler(updateProfile));
