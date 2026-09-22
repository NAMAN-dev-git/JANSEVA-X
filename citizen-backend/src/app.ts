import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { corsOrigins } from "./config/env";
import { requestLogger } from "./config/logger";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";
import { requestId } from "./middleware/request-id";
import { apiRouter } from "./routes";

export const app = express();

app.disable("x-powered-by");
app.use(requestId);
app.use(requestLogger);
app.use(helmet());
app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 200, standardHeaders: "draft-8", legacyHeaders: false }));

app.use("/api", apiRouter);
app.use(notFoundHandler);
app.use(errorHandler);
