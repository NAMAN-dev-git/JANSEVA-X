import type { Request, Response } from "express";
import { MockIssuedDocumentAttachmentService } from "../services/mock-issued-document-attachment.service";
import { presentMockIssuedDocumentAttachment } from "../utils/application-response";
import type { AttachMockIssuedDocumentRequestBody } from "../validators/mock-issued-document-attachment.validators";

const service = new MockIssuedDocumentAttachmentService();

export async function attachMockIssuedDocument(request: Request, response: Response): Promise<void> {
  const applicationId = (request.validated!.params as { applicationId: string }).applicationId;
  const result = await service.attach(request.auth!.userId, applicationId, request.validated!.body as AttachMockIssuedDocumentRequestBody);
  response.status(200).json({ success: true, data: { attachment: presentMockIssuedDocumentAttachment(result.attachment, result.requirementName) } });
}
