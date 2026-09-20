import { clearSession, clearToken, getToken, type EmployeeRole, type EmployeeSession } from "./auth";

type ApiFailure = {
  success: false;
  error?: {
    code?: string;
    message?: string;
  };
  requestId?: string;
};

type ApiSuccess<T> = {
  success: true;
  data: T;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function configuredUrl(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new ApiError(`${name} is not configured.`, 0, "CONFIGURATION_ERROR");
  return value.replace(/\/$/, "");
}

const citizenApiUrl = () => configuredUrl(import.meta.env.VITE_CITIZEN_API_URL, "Citizen API URL");
const employeeApiUrl = () => configuredUrl(import.meta.env.VITE_EMPLOYEE_API_URL, "Employee API URL");

async function request<T>(baseUrl: string, path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${baseUrl}${path}`, init);
  } catch {
    throw new ApiError("The service is unavailable. Check your network connection and try again.", 0, "NETWORK_ERROR");
  }

  const payload = await response.json().catch(() => null) as ApiSuccess<T> | ApiFailure | null;
  if (!response.ok || !payload || !payload.success) {
    const failure = payload as ApiFailure | null;
    const message = failure?.error?.message ?? "The request could not be completed.";
    throw new ApiError(message, response.status, failure?.error?.code);
  }

  return payload.data;
}

function jsonRequest(method: "POST" | "PATCH", body?: unknown): RequestInit {
  return {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

async function employeeRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  if (!token) throw new ApiError("Your employee session has expired. Please sign in again.", 401, "UNAUTHORIZED");
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);

  try {
    return await request<T>(employeeApiUrl(), path, {
      ...init,
      headers,
    });
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      clearToken();
      clearSession();
    }
    throw error;
  }
}

type CitizenLoginData = {
  tokens?: {
    accessToken?: string;
  };
};

type EmployeeMeData = {
  user: {
    userId: string;
    email: string;
    displayName: string | null;
    role: EmployeeRole;
  };
  officer: EmployeeSession["officer"];
};

export type ApplicationStatus = "DRAFT" | "SUBMITTED" | "IDENTITY_VERIFIED" | "DOCUMENTS_VERIFIED" | "UNDER_REVIEW" | "CORRECTION_REQUIRED" | "APPROVED" | "REJECTED" | "SIGNED" | "COMPLETED";
export type OfficerReviewStatus = "NOT_ASSIGNED" | "ASSIGNED" | "IN_REVIEW" | "REVIEWED";
export type ApplicationHistoryRole = EmployeeRole | "CITIZEN";

export interface QueueApplication {
  applicationId: string;
  applicationNumber: string;
  status: ApplicationStatus;
  reviewStatus: OfficerReviewStatus;
  service: { serviceId: string; name: string; slug: string; isPrototype: boolean };
  assignedOfficer: { officerId: string; displayName: string | null } | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  citizen: { citizenId: string; fullName: string; city: string | null; state: string | null };
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface DashboardData {
  role: EmployeeRole;
  counts: {
    total: number;
    claimable: number;
    byApplicationStatus: Record<ApplicationStatus, number>;
    byReviewStatus: Record<OfficerReviewStatus, number>;
  };
  recentApplications: QueueApplication[];
}

export interface ApplicationQuery {
  page?: number;
  limit?: number;
  status?: ApplicationStatus;
  reviewStatus?: OfficerReviewStatus;
  search?: string;
  sortBy?: "submittedAt" | "createdAt" | "updatedAt";
  sortOrder?: "asc" | "desc";
}

export interface ApplicationDetail extends Omit<QueueApplication, "citizen"> {
  correctionReason: string | null;
  applicationData: Record<string, unknown> | null;
  citizen: QueueApplication["citizen"];
  documents: Array<{
    documentId: string;
    requirementId: string | null;
    documentType: string;
    expectedDocumentType: string | null;
    originalFilename: string;
    mimeType: string;
    fileSizeBytes: number;
    status: string;
    rejectionReason: string | null;
    uploadedAt: string;
    verification: { status: string; failureReason: string | null; verifiedAt: string | null } | null;
  }>;
  mockIssuedDocumentAttachments: Array<{
    attachmentId: string;
    requirementId: string;
    requirementName: string | null;
    attachedAt: string;
    source: "MOCK_ISSUED_DOCUMENT";
    mockIssuedDocument: {
      documentId: string;
      documentType: string;
      displayName: string;
      issuer: string;
      issueDate: string;
      expiryDate: string | null;
      status: string;
      isDemo: boolean;
      mode: "DEMO/PROTOTYPE";
    };
  }>;
  generatedDocuments: GeneratedDocumentState[];
  history: Array<{
    status: ApplicationStatus;
    note: string | null;
    createdAt: string;
    changedBy: { displayName: string | null; role: ApplicationHistoryRole } | null;
  }>;
}

export interface GeneratedDocumentState {
  generatedDocumentId: string;
  documentType: string;
  documentName: string;
  signatureStatus: string;
  generatedAt: string;
  signedAt: string | null;
  signingSession: { state: string; expiresAt: string; completedAt: string | null } | null;
  mode: "DEMO/PROTOTYPE";
}

export interface GeneratedDocumentIssuance {
  generatedDocumentId: string;
  applicationId: string;
  documentType: string;
  originalFilename: string | null;
  mimeType: string;
  fileSizeBytes: number | null;
  signatureStatus: string;
  generatedAt: string;
  signedAt: string | null;
  mode: string;
  disclaimer: string;
}

export interface CompletedApplication extends QueueApplication {
  completedAt: string | null;
  generatedDocuments: GeneratedDocumentState[];
}

export interface CompletedApplicationQuery {
  page?: number;
  limit?: number;
  serviceId?: string;
  search?: string;
  sortBy?: "createdAt" | "updatedAt";
  sortOrder?: "asc" | "desc";
}

export interface AdvisoryDiagnostics {
  documentType: string | null;
  confidence: number | null;
  missingFields: string[];
  detectedIssues: string[];
  signatureDetected: "DETECTED" | "NOT_DETECTED" | "NOT_AVAILABLE" | null;
  sealDetected: "DETECTED" | "NOT_DETECTED" | "NOT_AVAILABLE" | null;
  isReadable: boolean | null;
  recommendation: string | null;
  advisory: string;
}

export interface ApplicationReview {
  applicationId: string;
  applicationNumber: string;
  status: ApplicationStatus;
  reviewStatus: OfficerReviewStatus;
  correctionReason: string | null;
  applicationData: Record<string, unknown> | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  applicant: QueueApplication["citizen"];
  service: {
    serviceId: string;
    name: string;
    slug: string;
    description: string | null;
    isPrototype: boolean;
    requirements: Array<{ requirementId: string; name: string; description: string | null; isRequired: boolean; sortOrder: number }>;
  };
  assignment: {
    officerId: string;
    displayName: string | null;
    department: string;
    designation: string;
    assignedAt: string | null;
    reviewedAt: string | null;
  } | null;
  documents: Array<{
    documentId: string;
    requirement: { requirementId: string; name: string; isRequired: boolean } | null;
    label: string | null;
    documentType: string;
    expectedDocumentType: string | null;
    originalFilename: string;
    mimeType: string;
    fileSizeBytes: number;
    status: string;
    rejectionReason: string | null;
    uploadedAt: string;
    review: { verificationId: string; status: string; failureReason: string | null; verifiedAt: string | null; createdAt: string; updatedAt: string } | null;
    diagnostics: AdvisoryDiagnostics | null;
  }>;
  mockIssuedDocumentAttachments: ApplicationDetail["mockIssuedDocumentAttachments"];
  generatedDocuments: ApplicationDetail["generatedDocuments"];
  identityVerifications: Array<{
    verificationId: string;
    type: "AADHAAR" | "PAN" | "FACE" | "FINGERPRINT" | "E_KYC";
    status: string;
    failureReason: string | null;
    verifiedAt: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  history: ApplicationDetail["history"];
}

export type DocumentReviewAction = "VERIFY" | "REJECT" | "REQUEST_CORRECTION";
export type IdentityReviewAction = "VERIFY" | "REJECT" | "REQUEST_MANUAL_REVIEW";
export type EmployeeDecisionStatus = "APPROVED" | "CORRECTION_REQUIRED" | "REJECTED";

export interface ReviewNotePayload<TAction extends string> {
  action: TAction;
  note: string;
}

function queryString(query: object): string {
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") parameters.set(key, String(value));
  }
  const serialized = parameters.toString();
  return serialized ? `?${serialized}` : "";
}

export const citizenAuthApi = {
  login(email: string, password: string): Promise<CitizenLoginData> {
    return request<CitizenLoginData>(citizenApiUrl(), "/auth/login", jsonRequest("POST", { email, password }));
  },
};

export const employeeApi = {
  me(): Promise<EmployeeMeData> {
    return employeeRequest<EmployeeMeData>("/employee/me");
  },
  dashboard(): Promise<DashboardData> {
    return employeeRequest<DashboardData>("/employee/dashboard");
  },
  applications(query: ApplicationQuery): Promise<{ applications: QueueApplication[]; pagination: Pagination }> {
    return employeeRequest<{ applications: QueueApplication[]; pagination: Pagination }>(`/employee/applications${queryString(query)}`);
  },
  completedApplications(query: CompletedApplicationQuery): Promise<{ applications: CompletedApplication[]; pagination: Pagination }> {
    return employeeRequest<{ applications: CompletedApplication[]; pagination: Pagination }>(`/employee/applications/completed${queryString(query)}`);
  },
  application(applicationId: string): Promise<{ application: ApplicationDetail }> {
    return employeeRequest<{ application: ApplicationDetail }>(`/employee/applications/${encodeURIComponent(applicationId)}`);
  },
  claimApplication(applicationId: string): Promise<{ application: ApplicationDetail }> {
    return employeeRequest<{ application: ApplicationDetail }>(`/employee/applications/${encodeURIComponent(applicationId)}/claim`, { method: "POST" });
  },
  applicationReview(applicationId: string): Promise<{ application: ApplicationReview }> {
    return employeeRequest<{ application: ApplicationReview }>(`/employee/applications/${encodeURIComponent(applicationId)}/review`);
  },
  startApplicationReview(applicationId: string): Promise<{ application: ApplicationDetail }> {
    return employeeRequest<{ application: ApplicationDetail }>(`/employee/applications/${encodeURIComponent(applicationId)}/review/start`, { method: "POST" });
  },
  reviewDocument(documentId: string, payload: ReviewNotePayload<DocumentReviewAction>): Promise<{ document: { documentId: string; status: string } }> {
    return employeeRequest<{ document: { documentId: string; status: string } }>(`/employee/documents/${encodeURIComponent(documentId)}/review`, jsonRequest("PATCH", payload));
  },
  reviewIdentityVerification(applicationId: string, verificationId: string, payload: ReviewNotePayload<IdentityReviewAction>): Promise<{ verification: { verificationId: string; status: string } }> {
    return employeeRequest<{ verification: { verificationId: string; status: string } }>(`/employee/applications/${encodeURIComponent(applicationId)}/identity-verifications/${encodeURIComponent(verificationId)}/review`, jsonRequest("PATCH", payload));
  },
  decideApplication(applicationId: string, payload: { status: EmployeeDecisionStatus; note: string }): Promise<{ application: ApplicationDetail }> {
    return employeeRequest<{ application: ApplicationDetail }>(`/employee/applications/${encodeURIComponent(applicationId)}/decision`, jsonRequest("POST", payload));
  },
  issueGeneratedDocument(applicationId: string): Promise<{ document: GeneratedDocumentIssuance }> {
    return employeeRequest<{ document: GeneratedDocumentIssuance }>(`/employee/applications/${encodeURIComponent(applicationId)}/generated-documents/issue`, { method: "POST" });
  },
};
