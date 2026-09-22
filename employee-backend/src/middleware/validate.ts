import type { NextFunction, Request, Response } from "express";
import type { ZodTypeAny } from "zod";

export const validate = (schema: ZodTypeAny) => (request: Request, _response: Response, next: NextFunction): void => {
  // Vercel's /api/:path* rewrite exposes its catch-all path as `query.path`.
  // It is routing metadata, not public client input, so strict route-query
  // validation must not treat it as a request field.
  const query = { ...request.query };
  delete query.path;
  const result = schema.safeParse({ body: request.body, params: request.params, query });
  if (!result.success) return next(result.error);
  request.validated = result.data;
  next();
};
