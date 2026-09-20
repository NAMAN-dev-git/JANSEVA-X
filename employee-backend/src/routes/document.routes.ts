import { Router } from "express";
import { review } from "../controllers/document.controller";
import { requireActiveAccount, requireAuth, requireRole } from "../middleware/require-auth";
import { validate } from "../middleware/validate";
import { asyncHandler } from "../utils/async-handler";
import { documentReviewSchema } from "../validators/employee.validators";
export const documentRouter = Router(); documentRouter.use(requireAuth, requireRole("OFFICER", "ADMIN"), requireActiveAccount); documentRouter.patch("/:documentId/review", validate(documentReviewSchema), asyncHandler(review));
