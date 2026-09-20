import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { logError } from "../config/logger";
import { AppError } from "../utils/app-error";
export function notFoundHandler(request: Request, _response: Response, next: NextFunction): void { next(new AppError(`Route not found: ${request.method} ${request.originalUrl}`, 404)); }
export function errorHandler(error: unknown, request: Request, response: Response, _next: NextFunction): void { logError(error); if (error instanceof ZodError) return void response.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Request validation failed", details: error.flatten() }, requestId: request.requestId }); if (error instanceof AppError) return void response.status(error.statusCode).json({ success: false, error: { code: "APPLICATION_ERROR", message: error.message }, requestId: request.requestId }); response.status(500).json({ success: false, error: { code: "INTERNAL_SERVER_ERROR", message: "An unexpected error occurred" }, requestId: request.requestId }); }
