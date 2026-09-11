import type { Request, Response } from "express";
import { DocumentService } from "../services/document.service";
import { AppError } from "../utils/app-error";
import { uploadDocumentBodySchema } from "../validators/document.validators";

const documentService = new DocumentService();

export async function uploadApplicationDocument(request: Request, response: Response): Promise<void> {
  if (!request.file) throw new AppError("A file is required", 400);
  const body = uploadDocumentBodySchema.parse(request.body);
  const document = await documentService.upload(request.auth!.userId, applicationId(request), { file: request.file, ...body });
  response.status(201).json({ success: true, data: { document: presentDocument(document) } });
}

export async function listApplicationDocuments(request: Request, response: Response): Promise<void> {
  const documents = await documentService.list(request.auth!.userId, applicationId(request));
  response.status(200).json({ success: true, data: { documents: documents.map(presentDocument) } });
}

export async function getDocument(request: Request, response: Response): Promise<void> {
  const document = await documentService.get(request.auth!.userId, documentId(request));
  response.status(200).json({ success: true, data: { document: presentDocument(document) } });
}

export async function deleteDocument(request: Request, response: Response): Promise<void> {
  await documentService.delete(request.auth!.userId, documentId(request));
  response.status(204).send();
}

export async function analyzeDocument(request: Request, response: Response): Promise<void> {
  const result = await documentService.analyze(request.auth!.userId, documentId(request));
  response.status(200).json({ success: true, data: { document: presentDocument(result.document), analysis: result.analysis, mode: "DEMO/PROTOTYPE deterministic analysis" } });
}

export async function getDocumentVerification(request: Request, response: Response): Promise<void> {
  const analysis = await documentService.verification(request.auth!.userId, documentId(request));
  response.status(200).json({ success: true, data: { analysis, mode: analysis ? "DEMO/PROTOTYPE deterministic analysis" : "NOT_ANALYZED" } });
}

function presentDocument(document: Awaited<ReturnType<DocumentService["get"]>>) {
  return {
    documentId: document.id,
    documentType: document.documentType,
    expectedDocumentType: document.expectedDocumentType,
    originalFilename: document.originalFilename,
    mimeType: document.mimeType,
    fileSizeBytes: document.fileSizeBytes,
    sha256: document.sha256,
    status: document.status,
    uploadedAt: document.uploadedAt,
    applications: document.applicationLinks.map((link) => ({ applicationId: link.applicationId, requirementId: link.requirementId })),
  };
}

function applicationId(request: Request): string {
  return (request.validated!.params as { applicationId: string }).applicationId;
}

function documentId(request: Request): string {
  return (request.validated!.params as { documentId: string }).documentId;
}
