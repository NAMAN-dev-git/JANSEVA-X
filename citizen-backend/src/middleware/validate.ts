import type { NextFunction, Request, Response } from "express";
import type { ZodTypeAny } from "zod";

export function validate(schema: ZodTypeAny) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    // Vercel's /api/:path* rewrite exposes its catch-all path as `query.path`.
    // It is routing metadata, not public client input, and must not participate
    // in route-level strict query validation.
    const query = { ...request.query };
    delete query.path;
    const result = schema.safeParse({ body: request.body, params: request.params, query });
    if (!result.success) {
      next(result.error);
      return;
    }

    request.validated = result.data;
    next();
  };
}
