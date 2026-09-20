import { Router } from "express";
import { dashboard, me } from "../controllers/employee.controller";
import { requireActiveAccount, requireAuth, requireRole } from "../middleware/require-auth";
import { validate } from "../middleware/validate";
import { asyncHandler } from "../utils/async-handler";
import { dashboardSchema } from "../validators/employee.validators";
export const employeeRouter = Router(); employeeRouter.get("/me", requireAuth, requireRole("OFFICER", "ADMIN"), requireActiveAccount, asyncHandler(me)); employeeRouter.get("/dashboard", requireAuth, requireRole("OFFICER", "ADMIN"), requireActiveAccount, validate(dashboardSchema), asyncHandler(dashboard));
