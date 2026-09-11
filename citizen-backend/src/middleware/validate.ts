import type { NextFunction, Request, Response } from "express";
import type { ZodTypeAny } from "zod";

export function validate(schema: ZodTypeAny) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    const result = schema.safeParse({ body: request.body, params: request.params, query: request.query });
    if (!result.success) {
      next(result.error);
      return;
    }

    request.validated = result.data;
    next();
  };
}
