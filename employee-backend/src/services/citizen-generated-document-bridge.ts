import { env } from "../config/env";
import { AppError } from "../utils/app-error";

export interface GeneratedDocumentSummary {
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

export interface CanonicalGeneratedDocumentIssuer {
  issue(applicationId: string, authorization: string): Promise<GeneratedDocumentSummary>;
}

type FetchLike = typeof fetch;

/**
 * Delegates issuance to citizen-backend, which remains the sole owner of mock
 * rendering, storage, integrity checks, signing sessions, and citizen consent.
 */
export class CitizenGeneratedDocumentBridge implements CanonicalGeneratedDocumentIssuer {
  constructor(private readonly baseUrl = env.CITIZEN_BACKEND_API_URL.replace(/\/$/, ""), private readonly request: FetchLike = fetch) {}

  async issue(applicationId: string, authorization: string): Promise<GeneratedDocumentSummary> {
    let response: Response;
    try {
      response = await this.request(`${this.baseUrl}/applications/${encodeURIComponent(applicationId)}/generated-documents`, {
        method: "POST",
        headers: { authorization },
      });
    } catch {
      throw new AppError("Canonical document issuance service is unavailable", 502);
    }

    const payload = await response.json().catch(() => null) as { success?: boolean; data?: { document?: GeneratedDocumentSummary }; error?: { message?: string } } | null;
    if (!response.ok || !payload?.success || !payload.data?.document) {
      const statusCode = response.status >= 400 && response.status < 500 ? response.status : 502;
      throw new AppError(payload?.error?.message ?? "Canonical document issuance failed", statusCode);
    }
    return payload.data.document;
  }
}
