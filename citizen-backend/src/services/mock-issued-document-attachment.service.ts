import { ApplicationStatus } from "@prisma/client";
import { AppError } from "../utils/app-error";
import {
  type MockIssuedDocumentAttachmentRecord,
  type MockIssuedDocumentAttachmentRepository,
  PrismaMockIssuedDocumentAttachmentRepository,
} from "../repositories/mock-issued-document-attachment.repository";

export interface AttachMockIssuedDocumentInput {
  mockIssuedDocumentId: string;
  requirementId: string;
}

export interface AttachedMockIssuedDocument {
  attachment: MockIssuedDocumentAttachmentRecord;
  requirementName: string;
}

export class MockIssuedDocumentAttachmentService {
  constructor(private readonly repository: MockIssuedDocumentAttachmentRepository = new PrismaMockIssuedDocumentAttachmentRepository()) {}

  async attach(userId: string, applicationId: string, input: AttachMockIssuedDocumentInput): Promise<AttachedMockIssuedDocument> {
    const citizen = await this.repository.findCitizenByUserId(userId);
    if (!citizen) throw new AppError("Citizen profile not found", 404);

    const application = await this.repository.findOwnedApplication(applicationId, citizen.id);
    if (!application) throw new AppError("Application not found", 404);
    if (application.status !== ApplicationStatus.DRAFT) throw new AppError("Documents can be changed only while the application is a draft", 409);

    const requirement = application.service.requirements.find((item) => item.id === input.requirementId);
    if (!requirement) throw new AppError("Service requirement not found for this application", 400);

    const document = await this.repository.findOwnedMockIssuedDocument(input.mockIssuedDocumentId, userId);
    // Deliberately identical for unknown and cross-citizen document IDs.
    if (!document) throw new AppError("Issued demo document not found", 404);
    if (!document.isDemo || !document.demoCitizenProfile.isDemo) throw new AppError("Issued demo document not found", 404);
    if (document.status !== "AVAILABLE") throw new AppError("Issued demo document is not available for attachment", 409);
    if (document.expiryDate && document.expiryDate.getTime() < Date.now()) throw new AppError("Issued demo document has expired", 409);

    const allowedType = mockDocumentTypeForRequirement(requirement.name);
    if (!allowedType || document.documentType !== allowedType) {
      throw new AppError("Issued demo document does not match this service requirement", 400);
    }

    const attachment = await this.repository.upsertAttachment({ applicationId: application.id, mockIssuedDocumentId: document.id, requirementId: requirement.id });
    return { attachment, requirementName: requirement.name };
  }
}

export function mockDocumentTypeForRequirement(requirementName: string): string | null {
  const normalized = requirementName.trim().toLowerCase().replace(/\s+/g, " ");
  if (normalized === "identity proof") return "MOCK_AADHAAR_CARD";
  if (normalized === "pan" || normalized === "pan supporting document") return "MOCK_PAN_CARD";
  if (normalized === "address proof") return "MOCK_ADDRESS_CERTIFICATE";
  if (normalized === "birth record supporting document") return "MOCK_BIRTH_CERTIFICATE";
  if (/\b(education|qualification)\b/.test(normalized)) return "MOCK_10TH_MARKSHEET";
  // Property supporting evidence must remain a normal citizen upload.
  return null;
}
