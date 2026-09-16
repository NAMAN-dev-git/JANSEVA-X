import type { Request, Response } from "express";
import { DemoProfileService } from "../services/demo-profile.service";

const demoProfileService = new DemoProfileService();

export async function getDemoProfile(request: Request, response: Response): Promise<void> {
  const profile = await demoProfileService.getProfile(request.auth!.userId);
  response.status(200).json({ success: true, data: { profile } });
}

export async function listIssuedDocuments(request: Request, response: Response): Promise<void> {
  const documents = await demoProfileService.listIssuedDocuments(request.auth!.userId);
  response.status(200).json({ success: true, data: { documents } });
}

export async function getIssuedDocument(request: Request, response: Response): Promise<void> {
  const documentId = (request.validated!.params as { documentId: string }).documentId;
  const document = await demoProfileService.getIssuedDocument(request.auth!.userId, documentId);
  response.status(200).json({ success: true, data: { document } });
}
