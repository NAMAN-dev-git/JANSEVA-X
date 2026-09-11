import { DocumentStatus, Prisma, VerificationStatus, VerificationType, type CitizenProfile } from "@prisma/client";
import { prisma } from "../lib/prisma";

export type OwnedApplicationForDocuments = Prisma.ApplicationGetPayload<{
  include: { service: { include: { requirements: true } }; applicationDocuments: { include: { document: true } } };
}>;
export type OwnedDocument = Prisma.DocumentGetPayload<{
  include: { applicationLinks: { include: { application: { include: { service: { include: { requirements: true } }; applicationDocuments: { include: { document: true } } } } } } };
}>;

export interface DocumentRepository {
  findCitizenByUserId(userId: string): Promise<CitizenProfile | null>;
  findOwnedApplication(applicationId: string, citizenId: string): Promise<OwnedApplicationForDocuments | null>;
  createDocument(input: { userId: string; applicationId: string; requirementId?: string; expectedDocumentType?: string; originalFilename: string; storageKey: string; mimeType: string; fileSizeBytes: number; sha256: string }): Promise<OwnedDocument>;
  findOwnedDocument(documentId: string, citizenId: string): Promise<OwnedDocument | null>;
  listOwnedDocuments(applicationId: string, citizenId: string): Promise<OwnedDocument[]>;
  updateAnalysis(input: { documentId: string; detectedDocumentType: string; requirementId?: string; analysis: Prisma.InputJsonValue; applicationId: string; citizenId: string }): Promise<OwnedDocument>;
  deleteApplicationDocument(input: { documentId: string; applicationId: string }): Promise<boolean>;
}

function ownedDocumentInclude(citizenId?: string) {
  return {
  applicationLinks: {
    ...(citizenId ? { where: { application: { citizenId } } } : {}),
    include: {
      application: {
        include: {
          service: { include: { requirements: { orderBy: { sortOrder: "asc" } } } },
          applicationDocuments: { include: { document: true }, orderBy: { createdAt: "asc" } },
        },
      },
    },
  },
  } as const;
}

export class PrismaDocumentRepository implements DocumentRepository {
  findCitizenByUserId(userId: string): Promise<CitizenProfile | null> {
    return prisma.citizenProfile.findUnique({ where: { userId } });
  }

  findOwnedApplication(applicationId: string, citizenId: string): Promise<OwnedApplicationForDocuments | null> {
    return prisma.application.findFirst({
      where: { id: applicationId, citizenId },
      include: { service: { include: { requirements: { orderBy: { sortOrder: "asc" } } } }, applicationDocuments: { include: { document: true } } },
    });
  }

  createDocument(input: { userId: string; applicationId: string; requirementId?: string; expectedDocumentType?: string; originalFilename: string; storageKey: string; mimeType: string; fileSizeBytes: number; sha256: string }): Promise<OwnedDocument> {
    return prisma.document.create({
      data: {
        userId: input.userId,
        documentType: "UNKNOWN",
        expectedDocumentType: input.expectedDocumentType,
        originalFilename: input.originalFilename,
        storageKey: input.storageKey,
        mimeType: input.mimeType,
        fileSizeBytes: input.fileSizeBytes,
        sha256: input.sha256,
        status: DocumentStatus.UPLOADED,
        applicationLinks: { create: { applicationId: input.applicationId, requirementId: input.requirementId } },
      },
      include: ownedDocumentInclude(),
    });
  }

  findOwnedDocument(documentId: string, citizenId: string): Promise<OwnedDocument | null> {
    return prisma.document.findFirst({ where: { id: documentId, applicationLinks: { some: { application: { citizenId } } } }, include: ownedDocumentInclude(citizenId) });
  }

  listOwnedDocuments(applicationId: string, citizenId: string): Promise<OwnedDocument[]> {
    return prisma.document.findMany({ where: { applicationLinks: { some: { applicationId, application: { citizenId } } } }, include: ownedDocumentInclude(citizenId), orderBy: { uploadedAt: "asc" } });
  }

  async updateAnalysis(input: { documentId: string; detectedDocumentType: string; requirementId?: string; analysis: Prisma.InputJsonValue; applicationId: string; citizenId: string }): Promise<OwnedDocument> {
    await prisma.$transaction(async (transaction) => {
      await transaction.document.update({ data: { documentType: input.detectedDocumentType, status: DocumentStatus.PENDING_VERIFICATION, aiExtractionResult: input.analysis }, where: { id: input.documentId } });
      if (input.requirementId) await transaction.applicationDocument.updateMany({ where: { documentId: input.documentId, applicationId: input.applicationId, requirementId: null }, data: { requirementId: input.requirementId } });
      const verification = {
        applicationId: input.applicationId,
        citizenId: input.citizenId,
        documentId: input.documentId,
        type: VerificationType.DOCUMENT,
        status: VerificationStatus.MANUAL_REVIEW,
        result: input.analysis,
        verifiedAt: null,
      };
      await transaction.verification.upsert({ where: { documentId_type: { documentId: input.documentId, type: VerificationType.DOCUMENT } }, create: verification, update: verification });
    });
    const document = await prisma.document.findFirst({ where: { id: input.documentId, applicationLinks: { some: { application: { citizenId: input.citizenId } } } }, include: ownedDocumentInclude(input.citizenId) });
    if (!document) throw new Error("Document disappeared during analysis update");
    return document;
  }

  async deleteApplicationDocument(input: { documentId: string; applicationId: string }): Promise<boolean> {
    return prisma.$transaction(async (transaction) => {
      await transaction.applicationDocument.deleteMany({ where: { documentId: input.documentId, applicationId: input.applicationId } });
      const remainingLinks = await transaction.applicationDocument.count({ where: { documentId: input.documentId } });
      if (remainingLinks === 0) {
        await transaction.document.delete({ where: { id: input.documentId } });
        return true;
      }
      return false;
    });
  }
}
