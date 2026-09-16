import { ApplicationStatus, Prisma, type CitizenProfile } from "@prisma/client";
import { prisma } from "../lib/prisma";

export type OwnedApplicationForMockAttachment = Prisma.ApplicationGetPayload<{
  include: { service: { include: { requirements: true } } };
}>;

export type OwnedMockIssuedDocumentForAttachment = Prisma.MockIssuedDocumentGetPayload<{
  include: { demoCitizenProfile: { include: { citizenProfile: true } } };
}>;

export type MockIssuedDocumentAttachmentRecord = Prisma.ApplicationMockIssuedDocumentGetPayload<{
  include: { mockIssuedDocument: true };
}>;

export interface MockIssuedDocumentAttachmentRepository {
  findCitizenByUserId(userId: string): Promise<CitizenProfile | null>;
  findOwnedApplication(applicationId: string, citizenId: string): Promise<OwnedApplicationForMockAttachment | null>;
  findOwnedMockIssuedDocument(mockIssuedDocumentId: string, userId: string): Promise<OwnedMockIssuedDocumentForAttachment | null>;
  upsertAttachment(input: { applicationId: string; mockIssuedDocumentId: string; requirementId: string }): Promise<MockIssuedDocumentAttachmentRecord>;
}

export class PrismaMockIssuedDocumentAttachmentRepository implements MockIssuedDocumentAttachmentRepository {
  findCitizenByUserId(userId: string): Promise<CitizenProfile | null> {
    return prisma.citizenProfile.findUnique({ where: { userId } });
  }

  findOwnedApplication(applicationId: string, citizenId: string): Promise<OwnedApplicationForMockAttachment | null> {
    return prisma.application.findFirst({
      where: { id: applicationId, citizenId },
      include: { service: { include: { requirements: { orderBy: { sortOrder: "asc" } } } } },
    });
  }

  // The ownership predicate is part of the lookup. A document is never found
  // globally and then compared by display data, profile code, or citizen name.
  findOwnedMockIssuedDocument(mockIssuedDocumentId: string, userId: string): Promise<OwnedMockIssuedDocumentForAttachment | null> {
    return prisma.mockIssuedDocument.findFirst({
      where: {
        id: mockIssuedDocumentId,
        isDemo: true,
        demoCitizenProfile: {
          isDemo: true,
          citizenProfile: { userId },
        },
      },
      include: { demoCitizenProfile: { include: { citizenProfile: true } } },
    });
  }

  upsertAttachment(input: { applicationId: string; mockIssuedDocumentId: string; requirementId: string }): Promise<MockIssuedDocumentAttachmentRecord> {
    return prisma.applicationMockIssuedDocument.upsert({
      where: {
        applicationId_mockIssuedDocumentId_requirementId: {
          applicationId: input.applicationId,
          mockIssuedDocumentId: input.mockIssuedDocumentId,
          requirementId: input.requirementId,
        },
      },
      create: input,
      update: {},
      include: { mockIssuedDocument: true },
    });
  }
}
