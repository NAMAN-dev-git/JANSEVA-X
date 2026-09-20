import type { UserRole } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/app-error";
import { verifyAccessToken } from "../utils/jwt";

export function requireAuth(request: Request, _response: Response, next: NextFunction): void {
  const authorization = request.header("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    next(new AppError("Authentication required", 401));
    return;
  }

  const token = authorization.slice("Bearer ".length).trim();
  if (!token) {
    next(new AppError("Authentication required", 401));
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    request.auth = { userId: payload.userId, role: payload.role };
    next();
  } catch {
    next(new AppError("Authentication required", 401));
  }
}

export function requireRole(...roles: UserRole[]) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    if (!request.auth || !roles.includes(request.auth.role)) {
      next(new AppError("Insufficient permissions", 403));
      return;
    }
    next();
  };
}

type AuthAccount = { role: UserRole; isActive: boolean; officer: { isActive: boolean } | null };
type AuthAccountLookup = (userId: string) => Promise<AuthAccount | null>;

const findAuthAccount: AuthAccountLookup = (userId) => prisma.user.findUnique({
  where: { id: userId },
  select: { role: true, isActive: true, officer: { select: { isActive: true } } },
});

/** Re-checks active account state so a valid but stale JWT cannot retain protected access. */
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
