import type { Request, Response } from "express";
import { env } from "../config/env";
export function health(_request: Request, response: Response): void { response.status(200).json({ success: true, service: "JANSEVA-X Employee Backend", status: "healthy", environment: env.NODE_ENV, timestamp: new Date().toISOString() }); }
