import type { NextFunction, Request, Response } from "express";
import type { ZodTypeAny } from "zod";
export const validate = (schema: ZodTypeAny) => (request: Request, _response: Response, next: NextFunction): void => { const result = schema.safeParse({ body: request.body, params: request.params, query: request.query }); if (!result.success) return next(result.error); request.validated = result.data; next(); };
