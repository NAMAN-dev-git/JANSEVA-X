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
export type ExamDeadlineAssessment = "SERVER_ON_TIME" | "CLIENT_CLAIMED_ON_TIME_UNVERIFIED" | "SERVER_LATE";
export type ExamSubmissionReceiptStatus = "RECEIVED" | "ACCEPTED" | "REJECTED_PERMANENT";
export interface ExamSubmissionReceipt {
  receiptId: string;
  applicationId: string;
  idempotencyKey: string;
  payloadHash: string;
  clientCapturedAt: string;
  serverReceivedAt: string;
  serverAcceptedAt: string | null;
  deadlineAtSnapshot: string;
  deadlineAssessment: ExamDeadlineAssessment;
  status: ExamSubmissionReceiptStatus;
  deliveryAttemptCount: number;
  lastDeliveryAt: string | null;
  failureCode: string | null;
}
export interface ExamSubmissionResult {
  application: unknown;
  receipt: ExamSubmissionReceipt | null;
  accepted: boolean;
  stableFinalResult: boolean;
  demoPrototypePolicy: "SERVER_ON_TIME" | "CLIENT_CLAIMED_ON_TIME_UNVERIFIED_ACCEPTED_FOR_DEMO" | null;
  governmentAccepted: false;
  mode: "DEMO/PROTOTYPE";
  payment: string;
}
export type ExamLocalSyncState = "QUEUED_OFFLINE" | "SYNCING" | "RETRY_SCHEDULED" | "AUTH_REQUIRED" | "SERVER_CONFIRMED" | "PERMANENT_FAILURE";
export interface ExamOfflineDraft {
  userId: string;
  applicationId: string;
  examId: string;
  formData: Record<string, unknown>;
  step: number;
  baseServerUpdatedAt: string | null;
  localUpdatedAt: string;
  dirty: boolean;
  conflictState: "NONE" | "SERVER_DRAFT_NEWER";
  version: 1;
}
export interface ExamSubmissionIntent {
  userId: string;
  applicationId: string;
  idempotencyKey: string;
  payloadHash: string;
  clientCapturedAt: string;
  createdAt: string;
  syncState: ExamLocalSyncState;
  attemptCount: number;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  receipt: Pick<ExamSubmissionReceipt, "receiptId" | "serverReceivedAt" | "serverAcceptedAt" | "deadlineAssessment" | "failureCode" | "status"> | null;
}
export interface ServiceRequirement { requirementId: string; serviceId: string; name: string; description: string | null; isRequired: boolean; sortOrder: number; configuration?: string }
export interface Service { serviceId: string; name: string; slug: string; description: string | null; isActive: boolean; isPrototype: boolean; requirements?: ServiceRequirement[] }
export interface ApplicationSummary { applicationId: string; applicationNumber: string; service: Service; status: ApplicationStatus; createdAt: string; updatedAt: string; submittedAt: string | null; latestStatusAt: string }
export type SubmissionTicketProcessingState = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
export interface SubmissionTicket {
  ticketId: string;
  applicationId: string;
  processingState: SubmissionTicketProcessingState;
  attemptCount: number;
  createdAt: string;
  processingStartedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
}
export interface ApplicationSubmissionResult {
  applicationId: string;
  status: ApplicationStatus;
  submittedAt: string;
  service: Service;
  submissionTicket: SubmissionTicket;
}
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
