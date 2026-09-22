import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { MulterError } from "multer";
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { env } from "../config/env";
import { logError } from "../config/logger";
import { AppError } from "../utils/app-error";

export function notFoundHandler(request: Request, _response: Response, next: NextFunction): void {
  next(new AppError(`Route not found: ${request.method} ${request.originalUrl}`, 404));
}

export function errorHandler(error: unknown, request: Request, response: Response, _next: NextFunction): void {
  logError(error);

  if (error instanceof ZodError) {
    response.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Request validation failed", details: error.flatten() }, requestId: request.requestId });
    return;
  }

  if (error instanceof MulterError) {
    const statusCode = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    const message = error.code === "LIMIT_FILE_SIZE" ? "Uploaded file exceeds the 4 MB limit" : "File upload could not be processed";
    response.status(statusCode).json({ success: false, error: { code: "UPLOAD_ERROR", message }, requestId: request.requestId });
    return;
  }

  if (error instanceof PrismaClientKnownRequestError) {
    const conflict = error.code === "P2002" || error.code === "P2034";
    const message = error.code === "P2034" ? "The request conflicted with another update; retry the request" : "The request could not be processed";
    response.status(conflict ? 409 : 400).json({ success: false, error: { code: "DATABASE_ERROR", message }, requestId: request.requestId });
    return;
  }

  if (error instanceof AppError) {
    response.status(error.statusCode).json({ success: false, error: { code: "APPLICATION_ERROR", message: error.message }, requestId: request.requestId });
    return;
  }

  response.status(500).json({
    success: false,
    error: { code: "INTERNAL_SERVER_ERROR", message: env.NODE_ENV === "production" ? "An unexpected error occurred" : "An unexpected error occurred. Check server logs." },
    requestId: request.requestId,
  });
}
