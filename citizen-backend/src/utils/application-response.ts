import type { ApplicationDetails, ApplicationWithService, ServiceWithRequirements } from "../repositories/application.repository";

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
  };
}
