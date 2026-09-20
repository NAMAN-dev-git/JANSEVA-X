import type { UserRole } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/app-error";
import { verifyAccessToken } from "../utils/jwt";
export function requireAuth(request: Request, _response: Response, next: NextFunction): void { const value = request.header("authorization"); if (!value?.startsWith("Bearer ")) return next(new AppError("Authentication required", 401)); try { const token = value.slice(7).trim(); if (!token) throw new Error(); request.auth = verifyAccessToken(token); next(); } catch { next(new AppError("Authentication required", 401)); } }
export const requireRole = (...roles: UserRole[]) => (request: Request, _response: Response, next: NextFunction): void => !request.auth || !roles.includes(request.auth.role) ? next(new AppError("Insufficient permissions", 403)) : next();

type AuthAccount = { role: UserRole; isActive: boolean; officer: { isActive: boolean } | null };
type AuthAccountLookup = (userId: string) => Promise<AuthAccount | null>;

const findAuthAccount: AuthAccountLookup = (userId) => prisma.user.findUnique({
  where: { id: userId },
  select: { role: true, isActive: true, officer: { select: { isActive: true } } },
});

/** Re-checks account activity and role so a stale citizen-issued JWT cannot retain employee access. */
export function createRequireActiveAccount(lookup: AuthAccountLookup = findAuthAccount) {
  return async (request: Request, _response: Response, next: NextFunction): Promise<void> => {
    if (!request.auth) {
      next(new AppError("Authentication required", 401));
      return;
    }
    try {
      const account = await lookup(request.auth.userId);
      if (!account || !account.isActive || account.role !== request.auth.role) {
        next(new AppError("Authentication required", 401));
        return;
      }
      if (account.role === "OFFICER" && !account.officer?.isActive) {
        next(new AppError("This officer account is inactive", 403));
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export const requireActiveAccount = createRequireActiveAccount();
