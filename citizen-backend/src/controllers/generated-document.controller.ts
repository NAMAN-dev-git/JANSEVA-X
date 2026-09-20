import type { Request, Response } from "express";
import { GeneratedDocumentService } from "../services/generated-document.service";
import type { GeneratedDocumentSigningCompleteRequestBody } from "../validators/generated-document.validators";

const service = new GeneratedDocumentService();
const applicationId = (request: Request) => (request.validated!.params as { applicationId: string }).applicationId;
const generatedDocumentId = (request: Request) => (request.validated!.params as { generatedDocumentId: string }).generatedDocumentId;

export async function issueGeneratedDocument(request: Request, response: Response): Promise<void> {
  const document = await service.issue(request.auth!.userId, applicationId(request));
  response.status(201).json({ success: true, data: { document } });
}

export async function listGeneratedDocuments(request: Request, response: Response): Promise<void> {
  const documents = await service.list(request.auth!.userId, applicationId(request));
  response.status(200).json({ success: true, data: { documents } });
}

export async function getGeneratedDocument(request: Request, response: Response): Promise<void> {
  const document = await service.get(request.auth!.userId, generatedDocumentId(request));
  response.status(200).json({ success: true, data: { document } });
}

export async function downloadGeneratedDocument(request: Request, response: Response): Promise<void> {
  const result = await service.download(request.auth!.userId, generatedDocumentId(request));
  response.status(200)
    .type("application/pdf")
    .setHeader("Content-Disposition", `attachment; filename="${result.filename.replace(/[^A-Za-z0-9._-]/g, "_")}"`)
    .send(result.contents);
}

export async function startGeneratedDocumentSigning(request: Request, response: Response): Promise<void> {
  const session = await service.startSigningSession(request.auth!.userId, generatedDocumentId(request));
  response.status(201).json({ success: true, data: session });
}

export async function completeGeneratedDocumentSigning(request: Request, response: Response): Promise<void> {
  const params = request.validated!.params as { sessionId: string };
  const body = request.validated!.body as GeneratedDocumentSigningCompleteRequestBody;
  const result = await service.completeSigningSession(request.auth!.userId, params.sessionId, body.signingChallenge, body.consentAccepted, body.consentVersion, {
    ipAddress: request.ip,
    userAgent: request.get("user-agent") ?? undefined,
  });
  response.status(200).json({ success: true, data: result });
}

export async function completeGeneratedDocumentWorkflow(request: Request, response: Response): Promise<void> {
  const result = await service.completeApplication(request.auth!.userId, applicationId(request));
  response.status(200).json({ success: true, data: result });
}
