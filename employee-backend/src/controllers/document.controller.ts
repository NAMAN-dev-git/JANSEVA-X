import "../repositories/employee.repository.extensions";
import type { Request, Response } from "express";
import { EmployeeService } from "../services/employee.service";
import { presentDocument } from "../utils/response-presenters";
const service = new EmployeeService();
export async function review(request: Request, response: Response): Promise<void> { const body = request.validated!.body as any; const document = await service.reviewDocument(request.auth!.userId, request.auth!.role as "OFFICER" | "ADMIN", (request.validated!.params as any).documentId, body.action, body.note); response.json({ success: true, data: { document: presentDocument(document) } }); }
