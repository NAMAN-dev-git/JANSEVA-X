import { Router } from "express";
import { applicationRouter } from "./application.routes";
import { authRouter } from "./auth.routes";
import { catalogRouter } from "./catalog.routes";
import { citizenRouter } from "./citizen.routes";
import { documentRouter } from "./document.routes";
import { generatedDocumentRouter } from "./generated-document.routes";
import { examRouter } from "./exam.routes";
import { healthRouter } from "./health.routes";
import { verificationRouter } from "./verification.routes";

export const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/citizen", citizenRouter);
apiRouter.use("/services", catalogRouter);
apiRouter.use(examRouter);
// The officer-only issuance bridge also uses the /applications/:id path.
// It must be registered before the citizen-only application router so its
// own OFFICER/ADMIN authorization guard can evaluate the request.
apiRouter.use(generatedDocumentRouter);
apiRouter.use("/applications", applicationRouter);
apiRouter.use("/documents", documentRouter);
apiRouter.use(verificationRouter);
