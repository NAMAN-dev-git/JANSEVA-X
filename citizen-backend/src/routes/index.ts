import { Router } from "express";
import { applicationRouter } from "./application.routes";
import { authRouter } from "./auth.routes";
import { catalogRouter } from "./catalog.routes";
import { citizenRouter } from "./citizen.routes";
import { documentRouter } from "./document.routes";
import { healthRouter } from "./health.routes";

export const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/citizen", citizenRouter);
apiRouter.use("/services", catalogRouter);
apiRouter.use("/applications", applicationRouter);
apiRouter.use("/documents", documentRouter);
