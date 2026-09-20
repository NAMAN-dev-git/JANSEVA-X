import type { ApplicationDetails, ApplicationWithService, ServiceWithRequirements } from "../repositories/application.repository";

type MockIssuedAttachmentInput = {
  id: string;
  requirementId: string;
  attachedAt: Date;
  mockIssuedDocument: {
    id: string;
    documentType: string;
    displayName: string;
    issuer: string;
    issueDate: Date;
    expiryDate: Date | null;
    status: string;
    isDemo: boolean;
  };
};

export function presentMockIssuedDocumentAttachment(attachment: MockIssuedAttachmentInput, requirementName?: string) {
  return {
    attachmentId: attachment.id,
    requirementId: attachment.requirementId,
    requirementName: requirementName ?? null,
    attachedAt: attachment.attachedAt,
    source: "MOCK_ISSUED_DOCUMENT" as const,
    mockIssuedDocument: {
      documentId: attachment.mockIssuedDocument.id,
      documentType: attachment.mockIssuedDocument.documentType,
      displayName: attachment.mockIssuedDocument.displayName,
      issuer: attachment.mockIssuedDocument.issuer,
      issueDate: attachment.mockIssuedDocument.issueDate,
      expiryDate: attachment.mockIssuedDocument.expiryDate,
      status: attachment.mockIssuedDocument.status,
      isDemo: attachment.mockIssuedDocument.isDemo,
      mode: "DEMO/PROTOTYPE" as const,
    },
  };
}

export function presentService(service: ServiceWithRequirements | ApplicationWithService["service"]) {
  return {
    serviceId: service.id,
    name: service.name,
    slug: service.slug,
    description: service.description,
    isActive: service.isActive,
    isPrototype: service.isPrototype,
  };
}

export function presentServiceDetails(service: ServiceWithRequirements) {
  return {
    ...presentService(service),
    requirements: service.requirements.map((requirement) => ({
      requirementId: requirement.id,
      serviceId: requirement.serviceId,
      name: requirement.name,
      description: requirement.description,
      isRequired: requirement.isRequired,
      sortOrder: requirement.sortOrder,
      configuration: "DEMO/PROTOTYPE - not legally authoritative government requirements",
    })),
  };
}

export function presentApplicationSummary(application: ApplicationWithService) {
  return {
    applicationId: application.id,
    applicationNumber: application.applicationNumber,
    service: presentService(application.service),
    status: application.status,
    createdAt: application.createdAt,
    updatedAt: application.updatedAt,
    submittedAt: application.submittedAt,
    latestStatusAt: application.statusHistory[0]?.createdAt ?? application.createdAt,
  };
}

export function presentApplicationDetails(application: ApplicationDetails) {
  return {
    applicationId: application.id,
    applicationNumber: application.applicationNumber,
    service: presentServiceDetails(application.service),
    status: application.status,
    applicationData: application.formData,
    createdAt: application.createdAt,
    updatedAt: application.updatedAt,
    submittedAt: application.submittedAt,
    statusHistory: application.statusHistory.map((entry) => ({
      status: entry.status,
      note: entry.note,
      createdAt: entry.createdAt,
    })),
    documents: application.applicationDocuments.map((applicationDocument) => ({
      documentId: applicationDocument.document.id,
      documentType: applicationDocument.document.documentType,
      expectedDocumentType: applicationDocument.document.expectedDocumentType,
      originalFilename: applicationDocument.document.originalFilename,
      mimeType: applicationDocument.document.mimeType,
      fileSizeBytes: applicationDocument.document.fileSizeBytes,
      sha256: applicationDocument.document.sha256,
      status: applicationDocument.document.status,
      rejectionReason: applicationDocument.document.rejectionReason,
      uploadedAt: applicationDocument.document.uploadedAt,
    })),
    mockIssuedDocumentAttachments: (application.mockIssuedDocumentAttachments ?? []).map((attachment) => presentMockIssuedDocumentAttachment(
      attachment,
      application.service.requirements.find((requirement) => requirement.id === attachment.requirementId)?.name,
    )),
    generatedDocuments: application.generatedDocuments.map((document) => ({
      generatedDocumentId: document.id,
      documentType: document.documentType,
      originalFilename: document.originalFilename,
      mimeType: document.mimeType,
      fileSizeBytes: document.fileSizeBytes,
      sha256: document.sha256,
      templateVersion: document.templateVersion,
      signatureStatus: document.signatureStatus,
      generatedAt: document.generatedAt,
      signedAt: document.signedAt,
    })),
  };
}
