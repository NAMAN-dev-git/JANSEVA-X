import type { UserRole } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/app-error";
import { verifyAccessToken } from "../utils/jwt";
export function requireAuth(request: Request, _response: Response, next: NextFunction): void { const value = request.header("authorization"); if (!value?.startsWith("Bearer ")) return next(new AppError("Authentication required", 401)); try { const token = value.slice(7).trim(); if (!token) throw new Error(); request.auth = verifyAccessToken(token); next(); } catch { next(new AppError("Authentication required", 401)); } }
export const requireRole = (...roles: UserRole[]) => (request: Request, _response: Response, next: NextFunction): void => !request.auth || !roles.includes(request.auth.role) ? next(new AppError("Insufficient permissions", 403)) : next();
