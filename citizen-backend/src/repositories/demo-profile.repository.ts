import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

export type DemoProfileForLogin = Prisma.DemoCitizenProfileGetPayload<{
  include: { citizenProfile: { include: { user: true } } };
}>;

export type OwnedDemoProfile = Prisma.DemoCitizenProfileGetPayload<{
  include: { citizenProfile: true; issuedDocuments: { orderBy: { issueDate: "desc" } } };
}>;

export type OwnedMockIssuedDocument = Prisma.MockIssuedDocumentGetPayload<{
  include: { demoCitizenProfile: { include: { citizenProfile: true } } };
}>;

export interface DemoProfileRepository {
  findForDemoLogin(normalizedMobile: string): Promise<DemoProfileForLogin | null>;
  findByUserId(userId: string): Promise<OwnedDemoProfile | null>;
  findDocumentByIdForUser(documentId: string, userId: string): Promise<OwnedMockIssuedDocument | null>;
}

export class PrismaDemoProfileRepository implements DemoProfileRepository {
  findForDemoLogin(normalizedMobile: string): Promise<DemoProfileForLogin | null> {
    return prisma.demoCitizenProfile.findFirst({
      where: { normalizedMobile, isDemo: true },
      include: { citizenProfile: { include: { user: true } } },
    });
  }

  findByUserId(userId: string): Promise<OwnedDemoProfile | null> {
    return prisma.demoCitizenProfile.findFirst({
      where: { isDemo: true, citizenProfile: { userId } },
      include: { citizenProfile: true, issuedDocuments: { orderBy: { issueDate: "desc" } } },
    });
  }

  findDocumentByIdForUser(documentId: string, userId: string): Promise<OwnedMockIssuedDocument | null> {
    return prisma.mockIssuedDocument.findFirst({
      where: { id: documentId, isDemo: true, demoCitizenProfile: { isDemo: true, citizenProfile: { userId } } },
      include: { demoCitizenProfile: { include: { citizenProfile: true } } },
    });
  }
}
