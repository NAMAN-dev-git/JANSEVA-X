import { ApplicationStatus, GeneratedDocumentSigningSessionStatus, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

const generatedDocumentInclude = {
  application: { include: { citizen: true, service: true } },
} as const;

const SERIALIZABLE_TRANSACTION_RETRIES = 2;

export type GeneratedDocumentWithApplication = Prisma.GeneratedDocumentGetPayload<{ include: typeof generatedDocumentInclude }>;
export type SigningSessionWithDocument = Prisma.GeneratedDocumentSigningSessionGetPayload<{
  include: { generatedDocument: { include: typeof generatedDocumentInclude }; citizen: true; consent: true };
}>;

export class PrismaGeneratedDocumentRepository {
  constructor(private readonly database: typeof prisma = prisma) {}

  findApplicationForIssuer(applicationId: string) {
    return this.database.application.findUnique({
      where: { id: applicationId },
      include: { citizen: true, service: true },
    });
  }

  findCitizenByUserId(userId: string) {
    return this.database.citizenProfile.findUnique({ where: { userId } });
  }

  findOwnedApplication(applicationId: string, citizenId: string) {
    return this.database.application.findFirst({ where: { id: applicationId, citizenId } });
  }

  findOwnedGeneratedDocument(generatedDocumentId: string, citizenId: string): Promise<GeneratedDocumentWithApplication | null> {
    return this.database.generatedDocument.findFirst({
      where: { id: generatedDocumentId, application: { citizenId } },
      include: generatedDocumentInclude,
    });
  }

  listOwnedGeneratedDocuments(applicationId: string, citizenId: string): Promise<GeneratedDocumentWithApplication[]> {
    return this.database.generatedDocument.findMany({
      where: { applicationId, application: { citizenId } },
      include: generatedDocumentInclude,
      orderBy: { generatedAt: "asc" },
    });
  }

  createGeneratedDocument(input: {
    applicationId: string; documentType: string; storageKey: string; originalFilename: string; mimeType: string;
    fileSizeBytes: number; sha256: string; templateVersion: string; generatedByUserId: string; issuanceKey: string;
  }) {
    return this.database.generatedDocument.create({ data: { ...input, signatureStatus: "NOT_SIGNED" }, include: generatedDocumentInclude });
  }

  findGeneratedDocumentByIssuanceKey(issuanceKey: string): Promise<GeneratedDocumentWithApplication | null> {
    return this.database.generatedDocument.findUnique({
      where: { issuanceKey },
      include: generatedDocumentInclude,
    });
  }

  findSigningSession(sessionId: string, citizenId: string): Promise<SigningSessionWithDocument | null> {
    return this.database.generatedDocumentSigningSession.findFirst({
      where: { id: sessionId, citizenId },
      include: { generatedDocument: { include: generatedDocumentInclude }, citizen: true, consent: true },
    });
  }

  async createSigningSession(input: {
    generatedDocumentId: string; citizenId: string; providerReference: string; signingChallengeHash: string; documentSha256: string; expiresAt: Date;
  }) {
    const now = new Date();
    return this.database.$transaction(async (transaction) => {
      await transaction.generatedDocumentSigningSession.updateMany({
        where: { generatedDocumentId: input.generatedDocumentId, status: GeneratedDocumentSigningSessionStatus.PENDING, expiresAt: { lte: now } },
        data: { status: GeneratedDocumentSigningSessionStatus.EXPIRED },
      });
      return transaction.generatedDocumentSigningSession.create({ data: input });
    });
  }

  async completeSigningSession(input: {
    sessionId: string; citizenId: string; signingChallengeHash: string; userId: string; consentText: string; consentVersion: string;
    ipAddress?: string; deviceMetadata?: Prisma.InputJsonValue; completedProviderReference: string;
  }) {
    return this.serializableTransaction(async (transaction) => {
      const now = new Date();
      const session = await transaction.generatedDocumentSigningSession.findFirst({
        where: { id: input.sessionId, citizenId: input.citizenId },
        include: { generatedDocument: { include: { application: true } } },
      });
      if (!session) return { kind: "NOT_FOUND" as const };
      if (session.status === GeneratedDocumentSigningSessionStatus.COMPLETED) return { kind: "COMPLETED" as const, session };
      if (session.status !== GeneratedDocumentSigningSessionStatus.PENDING || session.expiresAt <= now) {
        if (session.status === GeneratedDocumentSigningSessionStatus.PENDING) await transaction.generatedDocumentSigningSession.update({ where: { id: session.id }, data: { status: GeneratedDocumentSigningSessionStatus.EXPIRED } });
        return { kind: "EXPIRED" as const };
      }
      if (session.signingChallengeHash !== input.signingChallengeHash) return { kind: "INVALID_CHALLENGE" as const };
      if (session.generatedDocument.signatureStatus === "SIGNED") return { kind: "COMPLETED" as const, session };
      if (!session.generatedDocument.sha256 || session.generatedDocument.sha256 !== session.documentSha256) return { kind: "DOCUMENT_CHANGED" as const };
      if (session.generatedDocument.application.status !== ApplicationStatus.APPROVED) return { kind: "INVALID_APPLICATION_STATUS" as const };

      const locked = await transaction.generatedDocumentSigningSession.updateMany({
        where: { id: session.id, status: GeneratedDocumentSigningSessionStatus.PENDING, signingChallengeHash: input.signingChallengeHash, expiresAt: { gt: now } },
        data: { status: GeneratedDocumentSigningSessionStatus.COMPLETED, completedAt: now, providerReference: input.completedProviderReference },
      });
      if (locked.count !== 1) return { kind: "CONFLICT" as const };

      const consent = await transaction.consent.create({ data: {
        userId: input.userId, citizenId: input.citizenId, applicationId: session.generatedDocument.applicationId,
        consentType: "MOCK_E_SIGN_AUTHORIZATION", consentText: input.consentText, consentVersion: input.consentVersion,
        ipAddress: input.ipAddress, deviceMetadata: input.deviceMetadata,
      } });
      await transaction.generatedDocumentSigningSession.update({ where: { id: session.id }, data: { consentId: consent.id } });
      const signed = await transaction.generatedDocument.updateMany({
        where: { id: session.generatedDocumentId, signatureStatus: "NOT_SIGNED", sha256: session.documentSha256 },
        data: { signatureStatus: "SIGNED", signedAt: now },
      });
      if (signed.count !== 1) return { kind: "CONFLICT" as const };

      const remaining = await transaction.generatedDocument.count({
        where: { applicationId: session.generatedDocument.applicationId, documentType: "COMPLETION_CERTIFICATE", signatureStatus: { not: "SIGNED" } },
      });
      let applicationStatus: ApplicationStatus = session.generatedDocument.application.status;
      if (remaining === 0) {
        const transitioned = await transaction.application.updateMany({
          where: { id: session.generatedDocument.applicationId, status: ApplicationStatus.APPROVED },
          data: { status: ApplicationStatus.SIGNED },
        });
        if (transitioned.count === 1) {
          applicationStatus = ApplicationStatus.SIGNED;
          await transaction.applicationStatusHistory.create({ data: {
            applicationId: session.generatedDocument.applicationId, status: ApplicationStatus.SIGNED,
            note: "All required generated documents signed (DEMO/PROTOTYPE mock e-sign only)", changedByUserId: input.userId,
          } });
        }
      }
      return { kind: "SIGNED" as const, applicationStatus, consentId: consent.id };
    });
  }

  async completeApplication(applicationId: string, citizenId: string, userId: string) {
    return this.serializableTransaction(async (transaction) => {
      const application = await transaction.application.findFirst({ where: { id: applicationId, citizenId } });
      if (!application) return null;
      if (application.status === ApplicationStatus.COMPLETED) return application;
      if (application.status !== ApplicationStatus.SIGNED) return application;
      const unsigned = await transaction.generatedDocument.count({ where: { applicationId, documentType: "COMPLETION_CERTIFICATE", signatureStatus: { not: "SIGNED" } } });
      const required = await transaction.generatedDocument.count({ where: { applicationId, documentType: "COMPLETION_CERTIFICATE" } });
      if (required === 0 || unsigned !== 0) return application;
      const transitioned = await transaction.application.updateMany({ where: { id: applicationId, citizenId, status: ApplicationStatus.SIGNED }, data: { status: ApplicationStatus.COMPLETED } });
      if (transitioned.count !== 1) return transaction.application.findFirst({ where: { id: applicationId, citizenId } });
      await transaction.applicationStatusHistory.create({ data: { applicationId, status: ApplicationStatus.COMPLETED, note: "Citizen completed the generated-document workflow (DEMO/PROTOTYPE)", changedByUserId: userId } });
      return transaction.application.findFirst({ where: { id: applicationId, citizenId } });
    });
  }

  private async serializableTransaction<T>(operation: (transaction: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.database.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (attempt >= SERIALIZABLE_TRANSACTION_RETRIES || !isTransactionConflict(error)) throw error;
      }
    }
  }
}

function isTransactionConflict(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2034");
}
