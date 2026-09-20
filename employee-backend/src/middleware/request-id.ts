import { randomUUID } from "crypto";
import type { NextFunction, Request, Response } from "express";
export function requestId(request: Request, response: Response, next: NextFunction): void { request.requestId = request.header("x-request-id") ?? randomUUID(); response.setHeader("x-request-id", request.requestId); next(); }
