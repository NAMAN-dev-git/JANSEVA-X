import { Router } from "express";
import { getService, getServiceRequirements, listServices } from "../controllers/catalog.controller";
import { validate } from "../middleware/validate";
import { asyncHandler } from "../utils/async-handler";
import { serviceIdParamsSchema } from "../validators/application.validators";

export const catalogRouter = Router();

catalogRouter.get("/", asyncHandler(listServices));
catalogRouter.get("/:serviceId", validate(serviceIdParamsSchema), asyncHandler(getService));
catalogRouter.get("/:serviceId/requirements", validate(serviceIdParamsSchema), asyncHandler(getServiceRequirements));
