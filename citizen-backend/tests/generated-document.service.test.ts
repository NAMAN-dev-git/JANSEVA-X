import { createHash, randomUUID } from "crypto";
import { ApplicationStatus, GeneratedDocumentSigningSessionStatus, Prisma, type CitizenProfile } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { PrismaGeneratedDocumentRepository } from "../src/repositories/generated-document.repository";
import { GeneratedDocumentRendererService } from "../src/services/generated-document-renderer.service";
import { GeneratedDocumentService, MOCK_E_SIGN_CONSENT_VERSION } from "../src/services/generated-document.service";
import { MockEsignProvider, MockGeneratedDocumentIssuer } from "../src/services/generated-document.providers";
import { StorageService } from "../src/services/storage/storage.service";
import type { StorageProvider } from "../src/services/storage/storage.provider";
import { presentApplicationDetails } from "../src/utils/application-response";
import { generatedDocumentSigningCompleteSchema } from "../src/validators/generated-document.validators";

const APPLICATION_ID = "application-1";
const DOCUMENT_ID = "document-1";

class MemoryStorageProvider implements StorageProvider {
  readonly contents = new Map<string, Buffer>();

  async store(input: { contents: Buffer; extension: string }) {
    const storageKey = `${randomUUID()}${input.extension}`;
    this.contents.set(storageKey, input.contents);
    return { storageKey };
  }

  async read(storageKey: string) {
    const contents = this.contents.get(storageKey);
    if (!contents) throw new Error("Missing document");
    return contents;
  }

  async remove(storageKey: string) {
    this.contents.delete(storageKey);
  }
}

class MemoryGeneratedDocumentRepository {
  readonly citizens = [
    { id: "citizen-a", userId: "user-a", fullName: "Citizen A" },
    { id: "citizen-b", userId: "user-b", fullName: "Citizen B" },
  ] as CitizenProfile[];
  readonly application: any = {
    id: APPLICATION_ID,
    citizenId: "citizen-a",
    applicationNumber: "JX-DEMO-001",
    status: ApplicationStatus.APPROVED,
    citizen: { fullName: "Citizen A" },
    service: { name: "Demo Service" },
  };
  readonly documents: any[] = [];
  readonly sessions = new Map<string, any>();
  readonly statusHistory: Array<{ status: ApplicationStatus; applicationId: string }> = [];
  consentCount = 0;

  constructor() {
    this.addDocument(DOCUMENT_ID);
  }

  addDocument(id = randomUUID()) {
    const contents = Buffer.from(`generated-${id}`);
    const document = {
      id,
      applicationId: APPLICATION_ID,
      documentType: "COMPLETION_CERTIFICATE",
      storageKey: `${id}.pdf`,
      originalFilename: `${id}.pdf`,
      mimeType: "application/pdf",
      fileSizeBytes: contents.length,
      sha256: digest(contents),
      templateVersion: "batch6-v1",
      signatureStatus: "NOT_SIGNED",
      generatedAt: new Date(),
      signedAt: null,
      issuanceKey: null,
      generatedByUserId: null,
      application: this.application,
    };
    this.documents.push(document);
    return { document, contents };
  }

  async findApplicationForIssuer(applicationId: string) {
    return applicationId === APPLICATION_ID ? this.application : null;
  }

  async findCitizenByUserId(userId: string) {
    return this.citizens.find((citizen) => citizen.userId === userId) ?? null;
  }

  async findOwnedApplication(applicationId: string, citizenId: string) {
    return applicationId === APPLICATION_ID && citizenId === this.application.citizenId ? this.application : null;
  }

  async findOwnedGeneratedDocument(documentId: string, citizenId: string) {
    const document = this.documents.find((item) => item.id === documentId && item.application.citizenId === citizenId);
    return document ?? null;
  }

  async listOwnedGeneratedDocuments(applicationId: string, citizenId: string) {
    return applicationId === APPLICATION_ID && citizenId === this.application.citizenId ? this.documents : [];
  }

  async createGeneratedDocument(input: any) {
    const document = {
      ...input,
      id: randomUUID(),
      signatureStatus: "NOT_SIGNED",
      generatedAt: new Date(),
      signedAt: null,
      application: this.application,
    };
    this.documents.push(document);
    return document;
  }

  async findGeneratedDocumentByIssuanceKey(issuanceKey: string) {
    return this.documents.find((document) => document.issuanceKey === issuanceKey) ?? null;
  }

  async createSigningSession(input: any) {
    if ([...this.sessions.values()].some((session) => session.generatedDocumentId === input.generatedDocumentId && session.status === GeneratedDocumentSigningSessionStatus.PENDING)) {
      throw Object.assign(new Error("active session"), { code: "P2002" });
    }
    const session = { id: randomUUID(), ...input, status: GeneratedDocumentSigningSessionStatus.PENDING, completedAt: null, generatedDocument: this.documents.find((document) => document.id === input.generatedDocumentId) };
    this.sessions.set(session.id, session);
    return session;
  }

  async findSigningSession(sessionId: string, citizenId: string) {
    const session = this.sessions.get(sessionId);
    return session?.citizenId === citizenId ? session : null;
  }

  async completeSigningSession(input: any) {
    const session = await this.findSigningSession(input.sessionId, input.citizenId);
    if (!session) return { kind: "NOT_FOUND" as const };
    if (session.status === GeneratedDocumentSigningSessionStatus.COMPLETED) return { kind: "COMPLETED" as const, session };
    if (session.expiresAt <= new Date()) {
      session.status = GeneratedDocumentSigningSessionStatus.EXPIRED;
      return { kind: "EXPIRED" as const };
    }
    if (session.signingChallengeHash !== input.signingChallengeHash) return { kind: "INVALID_CHALLENGE" as const };
    if (!session.generatedDocument.sha256 || session.generatedDocument.sha256 !== session.documentSha256) return { kind: "DOCUMENT_CHANGED" as const };
    if (session.generatedDocument.application.status !== ApplicationStatus.APPROVED) return { kind: "INVALID_APPLICATION_STATUS" as const };

    session.status = GeneratedDocumentSigningSessionStatus.COMPLETED;
    session.completedAt = new Date();
    this.consentCount += 1;
    session.generatedDocument.signatureStatus = "SIGNED";
    session.generatedDocument.signedAt = session.completedAt;
    const unsigned = this.documents.filter((document) => document.documentType === "COMPLETION_CERTIFICATE" && document.signatureStatus !== "SIGNED");
    if (unsigned.length === 0 && this.application.status === ApplicationStatus.APPROVED) {
      this.application.status = ApplicationStatus.SIGNED;
      this.statusHistory.push({ applicationId: APPLICATION_ID, status: ApplicationStatus.SIGNED });
    }
    return { kind: "SIGNED" as const, applicationStatus: this.application.status, consentId: `consent-${this.consentCount}` };
  }

  async completeApplication(applicationId: string, citizenId: string) {
    if (applicationId !== APPLICATION_ID || citizenId !== this.application.citizenId) return null;
    if (this.application.status === ApplicationStatus.COMPLETED) return this.application;
    if (this.application.status !== ApplicationStatus.SIGNED) return this.application;
    const unsigned = this.documents.some((document) => document.documentType === "COMPLETION_CERTIFICATE" && document.signatureStatus !== "SIGNED");
    if (unsigned || !this.documents.some((document) => document.documentType === "COMPLETION_CERTIFICATE")) return this.application;
    this.application.status = ApplicationStatus.COMPLETED;
    this.statusHistory.push({ applicationId: APPLICATION_ID, status: ApplicationStatus.COMPLETED });
    return this.application;
  }
}

function digest(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

describe("GeneratedDocumentService", () => {
  let repository: MemoryGeneratedDocumentRepository;
  let storageProvider: MemoryStorageProvider;
  let service: GeneratedDocumentService;

  beforeEach(() => {
    repository = new MemoryGeneratedDocumentRepository();
    storageProvider = new MemoryStorageProvider();
    const initial = repository.documents[0];
    storageProvider.contents.set(initial.storageKey, Buffer.from(`generated-${initial.id}`));
    service = new GeneratedDocumentService(
      repository as unknown as PrismaGeneratedDocumentRepository,
      new StorageService(storageProvider),
      { renderCompletionCertificate: async () => Buffer.from("issued-certificate") } as GeneratedDocumentRendererService,
      new MockGeneratedDocumentIssuer(),
      new MockEsignProvider(),
      true,
    );
  });

  it("enforces demo issuance feature flag and APPROVED status", async () => {
    const disabled = new GeneratedDocumentService(
      repository as unknown as PrismaGeneratedDocumentRepository,
      new StorageService(storageProvider),
      { renderCompletionCertificate: async () => Buffer.from("issued-certificate") } as GeneratedDocumentRendererService,
      new MockGeneratedDocumentIssuer(),
      new MockEsignProvider(),
      false,
    );
    await expect(disabled.issue("officer-1", APPLICATION_ID)).rejects.toMatchObject({ statusCode: 403 });

    repository.application.status = ApplicationStatus.SUBMITTED;
    await expect(service.issue("officer-1", APPLICATION_ID)).rejects.toMatchObject({ statusCode: 409 });

    repository.application.status = ApplicationStatus.APPROVED;
    await expect(service.issue("officer-1", APPLICATION_ID)).resolves.toMatchObject({ documentType: "COMPLETION_CERTIFICATE", signatureStatus: "NOT_SIGNED" });
  });

  it("returns the same safe generated document for repeated approved issuance", async () => {
    const first = await service.issue("officer-1", APPLICATION_ID);
    const second = await service.issue("officer-1", APPLICATION_ID);

    expect(second).toMatchObject({ generatedDocumentId: first.generatedDocumentId, signatureStatus: "NOT_SIGNED" });
    expect(repository.documents.filter((document) => document.issuanceKey).length).toBe(1);
  });

  it("limits list, get, download, and signing sessions to the owning citizen", async () => {
    await expect(service.list("user-b", APPLICATION_ID)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.get("user-b", DOCUMENT_ID)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.download("user-b", DOCUMENT_ID)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.startSigningSession("user-b", DOCUMENT_ID)).rejects.toMatchObject({ statusCode: 404 });

    await expect(service.list("user-a", APPLICATION_ID)).resolves.toHaveLength(1);
    await expect(service.get("user-a", DOCUMENT_ID)).resolves.toMatchObject({ generatedDocumentId: DOCUMENT_ID });
    await expect(service.download("user-a", DOCUMENT_ID)).resolves.toMatchObject({ filename: `${DOCUMENT_ID}.pdf` });

    const signing = await service.startSigningSession("user-a", DOCUMENT_ID);
    await expect(service.completeSigningSession("user-b", signing.sessionId, signing.signingChallenge, true, MOCK_E_SIGN_CONSENT_VERSION, {})).rejects.toMatchObject({ statusCode: 404 });
  });

  it("requires explicit accepted consent and completes the valid signing workflow once", async () => {
    const signing = await service.startSigningSession("user-a", DOCUMENT_ID);
    await expect(service.completeSigningSession("user-a", signing.sessionId, signing.signingChallenge, false, MOCK_E_SIGN_CONSENT_VERSION, {})).rejects.toMatchObject({ statusCode: 400 });

    const result = await service.completeSigningSession("user-a", signing.sessionId, signing.signingChallenge, true, MOCK_E_SIGN_CONSENT_VERSION, {});
    expect(result).toMatchObject({ state: "COMPLETED", applicationStatus: ApplicationStatus.SIGNED });
    expect(repository.consentCount).toBe(1);
    expect(repository.statusHistory).toEqual([{ applicationId: APPLICATION_ID, status: ApplicationStatus.SIGNED }]);

    await expect(service.completeSigningSession("user-a", signing.sessionId, signing.signingChallenge, true, MOCK_E_SIGN_CONSENT_VERSION, {})).resolves.toMatchObject({ state: "COMPLETED", applicationStatus: ApplicationStatus.SIGNED });
    expect(repository.consentCount).toBe(1);
    expect(repository.statusHistory).toHaveLength(1);
  });

  it("returns controlled errors for invalid challenge, expiry, changed hash, and invalid application status", async () => {
    storageProvider.contents.set(repository.documents[0].storageKey, Buffer.from("tampered contents"));
    await expect(service.download("user-a", DOCUMENT_ID)).rejects.toMatchObject({ statusCode: 422 });
    storageProvider.contents.set(repository.documents[0].storageKey, Buffer.from(`generated-${DOCUMENT_ID}`));

    const invalidChallenge = await service.startSigningSession("user-a", DOCUMENT_ID);
    await expect(service.completeSigningSession("user-a", invalidChallenge.sessionId, randomUUID(), true, MOCK_E_SIGN_CONSENT_VERSION, {})).rejects.toMatchObject({ statusCode: 400 });

    repository.sessions.get(invalidChallenge.sessionId).expiresAt = new Date(Date.now() - 1);
    await expect(service.completeSigningSession("user-a", invalidChallenge.sessionId, invalidChallenge.signingChallenge, true, MOCK_E_SIGN_CONSENT_VERSION, {})).rejects.toMatchObject({ statusCode: 410 });

    const changed = await service.startSigningSession("user-a", DOCUMENT_ID);
    repository.documents[0].sha256 = digest("changed");
    await expect(service.completeSigningSession("user-a", changed.sessionId, changed.signingChallenge, true, MOCK_E_SIGN_CONSENT_VERSION, {})).rejects.toMatchObject({ statusCode: 409 });

    repository.documents[0].sha256 = changed.document.sha256;
    repository.application.status = ApplicationStatus.SUBMITTED;
    await expect(service.completeSigningSession("user-a", changed.sessionId, changed.signingChallenge, true, MOCK_E_SIGN_CONSENT_VERSION, {})).rejects.toMatchObject({ statusCode: 409 });
  });

  it("serializes completion state across concurrent signing and repeated completion", async () => {
    const second = repository.addDocument("document-2");
    storageProvider.contents.set(second.document.storageKey, second.contents);
    const firstSigning = await service.startSigningSession("user-a", DOCUMENT_ID);
    const secondSigning = await service.startSigningSession("user-a", "document-2");

    await Promise.all([
      service.completeSigningSession("user-a", firstSigning.sessionId, firstSigning.signingChallenge, true, MOCK_E_SIGN_CONSENT_VERSION, {}),
      service.completeSigningSession("user-a", secondSigning.sessionId, secondSigning.signingChallenge, true, MOCK_E_SIGN_CONSENT_VERSION, {}),
    ]);
    expect(repository.application.status).toBe(ApplicationStatus.SIGNED);
    expect(repository.statusHistory.filter((entry) => entry.status === ApplicationStatus.SIGNED)).toHaveLength(1);

    await Promise.all([service.completeApplication("user-a", APPLICATION_ID), service.completeApplication("user-a", APPLICATION_ID)]);
    expect(repository.application.status).toBe(ApplicationStatus.COMPLETED);
    expect(repository.statusHistory).toEqual([
      { applicationId: APPLICATION_ID, status: ApplicationStatus.SIGNED },
      { applicationId: APPLICATION_ID, status: ApplicationStatus.COMPLETED },
    ]);
  });

  it("retries a serializable transaction conflict before returning a completion result", async () => {
    const isolationLevels: Prisma.TransactionIsolationLevel[] = [];
    let attempts = 0;
    const database = {
      $transaction: async (operation: (transaction: unknown) => Promise<string>, options: { isolationLevel: Prisma.TransactionIsolationLevel }) => {
        isolationLevels.push(options.isolationLevel);
        attempts += 1;
        if (attempts === 1) throw Object.assign(new Error("serialization conflict"), { code: "P2034" });
        return operation({});
      },
    };
    const prismaRepository = new PrismaGeneratedDocumentRepository(database as any);

    await expect((prismaRepository as any).serializableTransaction(async () => "completed")).resolves.toBe("completed");
    expect(attempts).toBe(2);
    expect(isolationLevels).toEqual([Prisma.TransactionIsolationLevel.Serializable, Prisma.TransactionIsolationLevel.Serializable]);
  });
});

describe("generated-document validation and application tracking projection", () => {
  it("accepts only explicit true consent", () => {
    const base = { signingChallenge: "f5b9b3d8-58c1-4cfd-a310-8a5ee917e8e3", consentVersion: MOCK_E_SIGN_CONSENT_VERSION };
    expect(generatedDocumentSigningCompleteSchema.safeParse({ body: base, params: { sessionId: "a1e4f8d8-d04e-4c79-a6df-692fd4217a24" }, query: {} }).success).toBe(false);
    expect(generatedDocumentSigningCompleteSchema.safeParse({ body: { ...base, consentAccepted: false }, params: { sessionId: "a1e4f8d8-d04e-4c79-a6df-692fd4217a24" }, query: {} }).success).toBe(false);
    expect(generatedDocumentSigningCompleteSchema.safeParse({ body: { ...base, consentAccepted: true }, params: { sessionId: "a1e4f8d8-d04e-4c79-a6df-692fd4217a24" }, query: {} }).success).toBe(true);
  });

  it("projects generated-document tracking metadata without sensitive storage or signing fields", () => {
    const response = presentApplicationDetails({
      id: APPLICATION_ID,
      applicationNumber: "JX-DEMO-001",
      status: ApplicationStatus.SIGNED,
      formData: { name: "Citizen A" },
      createdAt: new Date(),
      updatedAt: new Date(),
      submittedAt: new Date(),
      service: { id: "service-1", name: "Demo Service", slug: "demo-service", description: null, isActive: true, isPrototype: true, requirements: [] },
      statusHistory: [],
      applicationDocuments: [],
      generatedDocuments: [{
        id: DOCUMENT_ID, applicationId: APPLICATION_ID, documentType: "COMPLETION_CERTIFICATE", storageKey: "private/document.pdf",
        originalFilename: "completion.pdf", mimeType: "application/pdf", fileSizeBytes: 123, sha256: digest("certificate"), templateVersion: "batch6-v1",
        signatureStatus: "SIGNED", generatedAt: new Date(), signedAt: new Date(), issuanceKey: "private-issuance", generatedByUserId: "officer-1",
      }],
    } as any);

    expect(response.generatedDocuments).toEqual([expect.objectContaining({ generatedDocumentId: DOCUMENT_ID, signatureStatus: "SIGNED", sha256: digest("certificate") })]);
    expect(response.generatedDocuments[0]).not.toHaveProperty("storageKey");
    expect(response.generatedDocuments[0]).not.toHaveProperty("issuanceKey");
    expect(response.generatedDocuments[0]).not.toHaveProperty("generatedByUserId");
    expect(JSON.stringify(response)).not.toContain("private/document.pdf");
  });
});
