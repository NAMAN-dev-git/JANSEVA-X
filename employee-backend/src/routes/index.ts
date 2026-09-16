import { Router } from "express";
import { applicationRouter } from "./application.routes";
import { documentRouter } from "./document.routes";
import { employeeRouter } from "./employee.routes";
import { healthRouter } from "./health.routes";
export const apiRouter = Router(); apiRouter.use(healthRouter); apiRouter.use("/employee", employeeRouter); apiRouter.use("/employee/applications", applicationRouter); apiRouter.use("/employee/documents", documentRouter);
