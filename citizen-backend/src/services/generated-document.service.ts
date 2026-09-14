import { createHash, randomUUID } from "crypto";
import { ApplicationStatus, GeneratedDocumentSigningSessionStatus } from "@prisma/client";
import { env } from "../config/env";
import { PrismaGeneratedDocumentRepository, type GeneratedDocumentWithApplication } from "../repositories/generated-document.repository";
import { AppError } from "../utils/app-error";
import { assertCitizenCompletionTransition, assertGeneratedDocumentSigningTransition } from "./application-status.service";
import { COMPLETION_CERTIFICATE_TYPE, COMPLETION_TEMPLATE_VERSION, DEMO_DOCUMENT_DISCLAIMER, GeneratedDocumentRendererService } from "./generated-document-renderer.service";
import { GENERATED_DOCUMENT_DEMO_MODE, MockEsignProvider, MockGeneratedDocumentIssuer } from "./generated-document.providers";
import { StorageService } from "./storage/storage.service";

const SIGNING_SESSION_DURATION_MS = 10 * 60 * 1000;
export const MOCK_E_SIGN_CONSENT_VERSION = "batch6-v1";
export const MOCK_E_SIGN_CONSENT_TEXT = "I authorize JANSEVA-X to record a DEMO/PROTOTYPE mock e-sign action for this generated document. This is not a legally valid electronic signature and does not use any government identity or e-sign provider.";

export class GeneratedDocumentService {
  constructor(
    private readonly repository = new PrismaGeneratedDocumentRepository(),
    private readonly storage = new StorageService(),
    private readonly renderer = new GeneratedDocumentRendererService(),
    private readonly issuer = new MockGeneratedDocumentIssuer(),
    private readonly esign = new MockEsignProvider(),
    private readonly demoIssuerEnabled = env.DEMO_DOCUMENT_ISSUER_ENABLED,
  ) {}

  async issue(userId: string, applicationId: string) {
    if (!this.demoIssuerEnabled) throw new AppError("Demo document issuance is disabled", 403);
    const application = await this.repository.findApplicationForIssuer(applicationId);
    if (!application) throw new AppError("Application not found", 404);
    if (application.status !== ApplicationStatus.APPROVED) throw new AppError("Generated documents can be issued only for approved applications", 409);

    const generatedAt = new Date();
    const contents = await this.renderer.renderCompletionCertificate({
      applicationNumber: application.applicationNumber,
      serviceName: application.service.name,
      citizenName: application.citizen.fullName,
      generatedAt,
    });
    const originalFilename = `janseva-x-demo-completion-${application.applicationNumber}.pdf`;
    const stored = await this.storage.store(contents, originalFilename);
    try {
      const document = await this.repository.createGeneratedDocument({
        applicationId,
        documentType: COMPLETION_CERTIFICATE_TYPE,
        storageKey: stored.storageKey,
        originalFilename,
        mimeType: "application/pdf",
        fileSizeBytes: contents.length,
        sha256: digest(contents),
        templateVersion: COMPLETION_TEMPLATE_VERSION,
        generatedByUserId: userId,
        issuanceKey: digest(`batch6:${applicationId}:${COMPLETION_CERTIFICATE_TYPE}`),
      });
      return presentGeneratedDocument(document);
    } catch (error) {
      await this.storage.remove(stored.storageKey);
      if (isUniqueViolation(error)) throw new AppError("Completion certificate has already been issued for this application", 409);
      throw error;
    }
  }

  async list(userId: string, applicationId: string) {
    const citizen = await this.getCitizen(userId);
    if (!await this.repository.findOwnedApplication(applicationId, citizen.id)) throw new AppError("Application not found", 404);
    return (await this.repository.listOwnedGeneratedDocuments(applicationId, citizen.id)).map(presentGeneratedDocument);
  }

  async get(userId: string, generatedDocumentId: string) {
    const citizen = await this.getCitizen(userId);
    return presentGeneratedDocument(await this.getOwnedDocument(generatedDocumentId, citizen.id));
  }

  async download(userId: string, generatedDocumentId: string) {
    const citizen = await this.getCitizen(userId);
    const document = await this.getOwnedDocument(generatedDocumentId, citizen.id);
    this.assertDownloadable(document);
    const contents = await this.storage.read(document.storageKey);
    if (digest(contents) !== document.sha256) throw new AppError("Generated document integrity check failed", 422);
    return { document: presentGeneratedDocument(document), filename: document.originalFilename!, contents };
  }

  async startSigningSession(userId: string, generatedDocumentId: string) {
    const citizen = await this.getCitizen(userId);
    const document = await this.getOwnedDocument(generatedDocumentId, citizen.id);
    this.assertDownloadable(document);
    if (document.application.status !== ApplicationStatus.APPROVED) throw new AppError("Mock e-signing is available only for approved applications", 409);
    if (document.signatureStatus === "SIGNED") throw new AppError("Generated document has already been signed", 409);
    if (document.documentType !== COMPLETION_CERTIFICATE_TYPE) throw new AppError("Generated document type is not available for mock signing", 409);

    const signingChallenge = randomUUID();
    const expiresAt = new Date(Date.now() + SIGNING_SESSION_DURATION_MS);
    try {
      const session = await this.repository.createSigningSession({
        generatedDocumentId: document.id,
        citizenId: citizen.id,
        providerReference: this.esign.createSessionReference(document.id),
        signingChallengeHash: digest(signingChallenge),
        documentSha256: document.sha256!,
        expiresAt,
      });
      return {
        sessionId: session.id,
        state: session.status,
        expiresAt: session.expiresAt,
        signingChallenge,
        consent: { type: "MOCK_E_SIGN_AUTHORIZATION", version: MOCK_E_SIGN_CONSENT_VERSION, text: MOCK_E_SIGN_CONSENT_TEXT },
        document: presentGeneratedDocument(document),
        mode: GENERATED_DOCUMENT_DEMO_MODE,
        disclaimer: DEMO_DOCUMENT_DISCLAIMER,
      };
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppError("An active mock e-sign session already exists", 409);
      throw error;
    }
  }

  async completeSigningSession(userId: string, sessionId: string, signingChallenge: string, consentAccepted: boolean, consentVersion: string, requestMetadata: { ipAddress?: string; userAgent?: string }) {
    if (consentAccepted !== true) throw new AppError("Mock e-sign consent must be accepted", 400);
    if (consentVersion !== MOCK_E_SIGN_CONSENT_VERSION) throw new AppError("Unsupported mock e-sign consent version", 409);
    const citizen = await this.getCitizen(userId);
    const existing = await this.repository.findSigningSession(sessionId, citizen.id);
    if (!existing) throw new AppError("Mock e-sign session not found", 404);
    if (existing.status === GeneratedDocumentSigningSessionStatus.COMPLETED) {
      return { sessionId: existing.id, state: existing.status, generatedDocumentId: existing.generatedDocumentId, applicationStatus: existing.generatedDocument.application.status, mode: GENERATED_DOCUMENT_DEMO_MODE };
    }
    const result = await this.repository.completeSigningSession({
      sessionId,
      citizenId: citizen.id,
      signingChallengeHash: digest(signingChallenge),
      userId,
      consentText: MOCK_E_SIGN_CONSENT_TEXT,
      consentVersion,
      ipAddress: requestMetadata.ipAddress,
      deviceMetadata: requestMetadata.userAgent ? { userAgent: requestMetadata.userAgent.slice(0, 300), mode: GENERATED_DOCUMENT_DEMO_MODE } : { mode: GENERATED_DOCUMENT_DEMO_MODE },
      completedProviderReference: this.esign.complete(sessionId),
    });
    if (result.kind === "NOT_FOUND") throw new AppError("Mock e-sign session not found", 404);
    if (result.kind === "EXPIRED") throw new AppError("Mock e-sign session has expired", 410);
    if (result.kind === "INVALID_CHALLENGE") throw new AppError("Invalid mock e-sign challenge", 400);
    if (result.kind === "DOCUMENT_CHANGED") throw new AppError("Generated document changed and cannot be signed", 409);
    if (result.kind === "INVALID_APPLICATION_STATUS") throw new AppError("Mock e-signing is available only for approved applications", 409);
    if (result.kind === "CONFLICT") throw new AppError("Mock e-sign session state changed; start again", 409);
    if (result.kind === "COMPLETED") {
      return { sessionId, state: "COMPLETED", generatedDocumentId: existing.generatedDocumentId, applicationStatus: existing.generatedDocument.application.status, mode: GENERATED_DOCUMENT_DEMO_MODE };
    }
    if (result.applicationStatus === ApplicationStatus.SIGNED) {
      assertGeneratedDocumentSigningTransition(ApplicationStatus.APPROVED, result.applicationStatus);
    }
    return { sessionId, state: "COMPLETED", generatedDocumentId: existing.generatedDocumentId, applicationStatus: result.applicationStatus, consentId: result.consentId, mode: GENERATED_DOCUMENT_DEMO_MODE };
  }

  async completeApplication(userId: string, applicationId: string) {
    const citizen = await this.getCitizen(userId);
    const application = await this.repository.findOwnedApplication(applicationId, citizen.id);
    if (!application) throw new AppError("Application not found", 404);
    if (application.status === ApplicationStatus.COMPLETED) return { applicationId, status: ApplicationStatus.COMPLETED, mode: GENERATED_DOCUMENT_DEMO_MODE };
    assertCitizenCompletionTransition(application.status, ApplicationStatus.COMPLETED);
    const completed = await this.repository.completeApplication(applicationId, citizen.id, userId);
    if (!completed || completed.status !== ApplicationStatus.COMPLETED) throw new AppError("Application could not be completed", 409);
    return { applicationId: completed.id, status: completed.status, mode: GENERATED_DOCUMENT_DEMO_MODE };
  }

  private async getCitizen(userId: string) {
    const citizen = await this.repository.findCitizenByUserId(userId);
    if (!citizen) throw new AppError("Citizen profile not found", 404);
    return citizen;
  }

  private async getOwnedDocument(generatedDocumentId: string, citizenId: string) {
    const document = await this.repository.findOwnedGeneratedDocument(generatedDocumentId, citizenId);
    if (!document) throw new AppError("Generated document not found", 404);
    return document;
  }

  private assertDownloadable(document: GeneratedDocumentWithApplication) {
    if (document.mimeType !== "application/pdf" || !document.originalFilename || !document.fileSizeBytes || !document.sha256 || !document.templateVersion) {
      throw new AppError("Generated document is a legacy artifact without required integrity metadata", 422);
    }
  }
}

export function presentGeneratedDocument(document: GeneratedDocumentWithApplication) {
  return {
    generatedDocumentId: document.id,
    applicationId: document.applicationId,
    documentType: document.documentType,
    originalFilename: document.originalFilename,
    mimeType: document.mimeType,
    fileSizeBytes: document.fileSizeBytes,
    sha256: document.sha256,
    templateVersion: document.templateVersion,
    signatureStatus: document.signatureStatus,
    generatedAt: document.generatedAt,
    signedAt: document.signedAt,
    mode: GENERATED_DOCUMENT_DEMO_MODE,
    disclaimer: DEMO_DOCUMENT_DISCLAIMER,
  };
}

function digest(value: string | Buffer): string { return createHash("sha256").update(value).digest("hex"); }
function isUniqueViolation(error: unknown): boolean { return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002"); }
