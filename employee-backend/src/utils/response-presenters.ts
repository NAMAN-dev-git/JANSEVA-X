import { presentAdvisoryDiagnostics } from "./advisory-diagnostics";

export function presentQueueItem(app: any) { return { applicationId: app.id, applicationNumber: app.applicationNumber, status: app.status, reviewStatus: app.reviewStatus, service: { serviceId: app.service.id, name: app.service.name, slug: app.service.slug, isPrototype: app.service.isPrototype }, assignedOfficer: app.assignedOfficer ? { officerId: app.assignedOfficer.id, displayName: app.assignedOfficer.user.displayName } : null, submittedAt: app.submittedAt, createdAt: app.createdAt, updatedAt: app.updatedAt }; }
export function presentRegistryItem(app: any) { return { ...presentQueueItem(app), citizen: { citizenId: app.citizen.id, fullName: app.citizen.fullName, city: app.citizen.city, state: app.citizen.state } }; }
export function presentCompletedItem(app: any) { return { ...presentRegistryItem(app), completedAt: app.statusHistory[0]?.createdAt ?? null }; }
export function presentIdentityVerification(verification: any) { return { verificationId: verification.id, type: verification.type, status: verification.status, failureReason: verification.failureReason, verifiedAt: verification.verifiedAt, createdAt: verification.createdAt, updatedAt: verification.updatedAt }; }
export function presentApplicationReview(app: any) {
  const requirements = new Map<string, any>(app.service.requirements.map((requirement: any) => [requirement.id, requirement]));
  return {
    applicationId: app.id,
    applicationNumber: app.applicationNumber,
    status: app.status,
    reviewStatus: app.reviewStatus,
    correctionReason: app.correctionReason,
    applicationData: app.formData,
    submittedAt: app.submittedAt,
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
    applicant: { citizenId: app.citizen.id, fullName: app.citizen.fullName, city: app.citizen.city, state: app.citizen.state },
    service: { serviceId: app.service.id, name: app.service.name, slug: app.service.slug, description: app.service.description, isPrototype: app.service.isPrototype, requirements: app.service.requirements.map((requirement: any) => ({ requirementId: requirement.id, name: requirement.name, description: requirement.description, isRequired: requirement.isRequired, sortOrder: requirement.sortOrder })) },
    assignment: app.assignedOfficer ? { officerId: app.assignedOfficer.id, displayName: app.assignedOfficer.user.displayName, department: app.assignedOfficer.department, designation: app.assignedOfficer.designation, assignedAt: app.assignedAt, reviewedAt: app.reviewedAt } : null,
    documents: app.applicationDocuments.map((link: any) => {
      const document = link.document;
      const requirement = link.requirementId ? requirements.get(link.requirementId) : null;
      const verification = document.verifications[0];
      return { documentId: document.id, requirement: requirement ? { requirementId: requirement.id, name: requirement.name, isRequired: requirement.isRequired } : null, label: link.label, documentType: document.documentType, expectedDocumentType: document.expectedDocumentType, originalFilename: document.originalFilename, mimeType: document.mimeType, fileSizeBytes: document.fileSizeBytes, status: document.status, rejectionReason: document.rejectionReason, uploadedAt: document.uploadedAt, review: verification ? { verificationId: verification.id, status: verification.status, failureReason: verification.failureReason, verifiedAt: verification.verifiedAt, createdAt: verification.createdAt, updatedAt: verification.updatedAt } : null, diagnostics: presentAdvisoryDiagnostics(document.aiExtractionResult) };
    }),
    identityVerifications: app.verifications.map(presentIdentityVerification),
    history: app.statusHistory.map((entry: any) => ({ status: entry.status, note: entry.note, createdAt: entry.createdAt, changedBy: entry.changedBy ? { displayName: entry.changedBy.displayName, role: entry.changedBy.role } : null })),
  };
}
export function presentApplication(app: any) { return { ...presentQueueItem(app), correctionReason: app.correctionReason, applicationData: app.formData, citizen: { citizenId: app.citizen.id, fullName: app.citizen.fullName, city: app.citizen.city, state: app.citizen.state }, documents: app.applicationDocuments.map((link: any) => ({ documentId: link.document.id, requirementId: link.requirementId, documentType: link.document.documentType, expectedDocumentType: link.document.expectedDocumentType, originalFilename: link.document.originalFilename, mimeType: link.document.mimeType, fileSizeBytes: link.document.fileSizeBytes, status: link.document.status, rejectionReason: link.document.rejectionReason, uploadedAt: link.document.uploadedAt, verification: link.document.verifications[0] ? { status: link.document.verifications[0].status, failureReason: link.document.verifications[0].failureReason, verifiedAt: link.document.verifications[0].verifiedAt } : null })), history: app.statusHistory.map((entry: any) => ({ status: entry.status, note: entry.note, createdAt: entry.createdAt, changedBy: entry.changedBy ? { displayName: entry.changedBy.displayName, role: entry.changedBy.role } : null })) }; }
export function presentDocument(document: any) { const link = document.applicationLinks[0]; const verification = document.verifications[0]; return { documentId: document.id, applicationId: link.applicationId, documentType: document.documentType, expectedDocumentType: document.expectedDocumentType, originalFilename: document.originalFilename, mimeType: document.mimeType, fileSizeBytes: document.fileSizeBytes, status: document.status, rejectionReason: document.rejectionReason, uploadedAt: document.uploadedAt, verification: verification ? { verificationId: verification.id, status: verification.status, failureReason: verification.failureReason, verifiedAt: verification.verifiedAt } : null, advisory: "Document analysis and OCR are advisory prototype inputs only; they do not verify authenticity or independently determine application outcomes." }; }
