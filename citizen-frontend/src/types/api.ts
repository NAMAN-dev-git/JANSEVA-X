export type ApplicationStatus = "DRAFT" | "SUBMITTED" | "IDENTITY_VERIFIED" | "DOCUMENTS_VERIFIED" | "UNDER_REVIEW" | "CORRECTION_REQUIRED" | "APPROVED" | "REJECTED" | "SIGNED" | "COMPLETED";

export interface CitizenProfile {
  id: string;
  userId: string;
  fullName: string;
  phone?: string | null;
  dateOfBirth?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface DemoCitizenProfile {
  profileCode: string;
  fullName: string;
  mobile: string;
  isDemo: true;
  issuedDocumentCount: number;
  mode: "DEMO/PROTOTYPE";
}

export interface MockIssuedDocument {
  documentId: string;
  documentCode: string;
  documentType: string;
  displayName: string;
  issuer: string;
  issueDate: string;
  expiryDate: string | null;
  status: string;
  structuredFields: Record<string, unknown> | null;
  isDemo: true;
  mode: "DEMO/PROTOTYPE";
}

export interface User {
  userId: string;
  email: string;
  role: "CITIZEN" | "OFFICER" | "ADMIN";
  isActive: boolean;
  citizenProfile: CitizenProfile | null;
}

export interface TokenPair { accessToken: string; refreshToken: string; tokenType: "Bearer"; expiresIn: string }
export interface ServiceRequirement { requirementId: string; serviceId: string; name: string; description: string | null; isRequired: boolean; sortOrder: number; configuration?: string }
export interface Service { serviceId: string; name: string; slug: string; description: string | null; isActive: boolean; isPrototype: boolean; requirements?: ServiceRequirement[] }
export interface ApplicationSummary { applicationId: string; applicationNumber: string; service: Service; status: ApplicationStatus; createdAt: string; updatedAt: string; submittedAt: string | null; latestStatusAt: string }
export interface ApplicationDocument { documentId: string; documentType: string; expectedDocumentType: string | null; originalFilename: string; mimeType: string; fileSizeBytes: number; sha256: string; status: string; rejectionReason?: string | null; uploadedAt: string }
export interface MockIssuedDocumentAttachment {
  attachmentId: string;
  requirementId: string;
  requirementName: string | null;
  attachedAt: string;
  source: "MOCK_ISSUED_DOCUMENT";
  mockIssuedDocument: Pick<MockIssuedDocument, "documentId" | "documentType" | "displayName" | "issuer" | "issueDate" | "expiryDate" | "status" | "isDemo" | "mode">;
}
export interface GeneratedDocument { generatedDocumentId: string; applicationId: string; documentType: string; originalFilename: string | null; mimeType: string; fileSizeBytes: number | null; sha256: string | null; templateVersion: string | null; signatureStatus: string; generatedAt: string; signedAt: string | null; mode?: string; disclaimer?: string }
export interface StatusHistory { status: ApplicationStatus; note: string | null; createdAt: string }
export interface ApplicationDetail extends ApplicationSummary { applicationData: Record<string, unknown> | null; service: Service & { requirements: ServiceRequirement[] }; statusHistory: StatusHistory[]; documents: ApplicationDocument[]; mockIssuedDocumentAttachments: MockIssuedDocumentAttachment[]; generatedDocuments: GeneratedDocument[] }
export interface Verification { verificationId: string; verificationType: string; status: string; mode: string; referenceId?: string | null; createdAt?: string; completedAt?: string | null; updatedAt?: string; expiresAt?: string; maskedAadhaar?: string; pan?: string; taxpayerName?: string; entityType?: string; verificationNote?: string; [key: string]: unknown }
export interface VerificationSummary { applicationId: string; identityVerification: { aadhaar: Verification | null; pan: Verification | null; face: Verification | null; fingerprint: Verification | null; ekyc: Verification | null } }
export type FingerprintStep = "RIGHT_INDEX" | "RIGHT_MIDDLE" | "RIGHT_RING" | "RIGHT_PINKY" | "RIGHT_THUMB";
export interface FingerprintSession { sessionId: string; state: "PENDING_PAIRING" | "PAIRED" | "COMPLETED" | "EXPIRED"; paired: boolean; currentStep: FingerprintStep | null; completedSteps: FingerprintStep[]; remainingSteps: FingerprintStep[]; expiresAt: string; verification: Verification; pairingChallenge?: string; qrPayload?: string; step?: FingerprintStep; stepStatus?: string }
export interface SigningSession { sessionId: string; state: string; expiresAt: string; signingChallenge: string; consent: { type: string; version: string; text: string }; document: GeneratedDocument; mode: string; disclaimer: string }

export interface Pagination { page: number; limit: number; total: number; totalPages: number }
