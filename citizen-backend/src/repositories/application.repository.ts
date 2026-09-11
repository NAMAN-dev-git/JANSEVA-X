import { ApplicationStatus, Prisma, type CitizenProfile } from "@prisma/client";
import { prisma } from "../lib/prisma";

export type ServiceWithRequirements = Prisma.GovernmentServiceGetPayload<{ include: { requirements: true } }>;
export type ApplicationWithService = Prisma.ApplicationGetPayload<{ include: { service: true; statusHistory: true } }>;
export type ApplicationDetails = Prisma.ApplicationGetPayload<{
  include: {
    service: { include: { requirements: true } };
    statusHistory: true;
    applicationDocuments: { include: { document: true } };
  };
}>;

export interface ApplicationListFilter {
  citizenId: string;
  status?: ApplicationStatus;
  serviceId?: string;
  skip: number;
  take: number;
}

export interface ApplicationRepository {
  findActiveServices(): Promise<ServiceWithRequirements[]>;
  findActiveServiceById(serviceId: string): Promise<ServiceWithRequirements | null>;
  findCitizenByUserId(userId: string): Promise<CitizenProfile | null>;
  createDraftApplication(input: { citizenId: string; userId: string; serviceId: string; applicationNumber: string; formData?: Prisma.InputJsonValue }): Promise<ApplicationWithService>;
  listCitizenApplications(filter: ApplicationListFilter): Promise<{ applications: ApplicationWithService[]; total: number }>;
  findCitizenApplication(applicationId: string, citizenId: string): Promise<ApplicationDetails | null>;
  updateDraftApplication(applicationId: string, citizenId: string, formData: Prisma.InputJsonValue): Promise<ApplicationDetails | null>;
  submitDraftApplication(applicationId: string, citizenId: string, userId: string, submittedAt: Date): Promise<ApplicationDetails | null>;
}

export class PrismaApplicationRepository implements ApplicationRepository {
  findActiveServices(): Promise<ServiceWithRequirements[]> {
    return prisma.governmentService.findMany({
      where: { isActive: true },
      include: { requirements: { orderBy: { sortOrder: "asc" } } },
      orderBy: { name: "asc" },
    });
  }

  findActiveServiceById(serviceId: string): Promise<ServiceWithRequirements | null> {
    return prisma.governmentService.findFirst({
      where: { id: serviceId, isActive: true },
      include: { requirements: { orderBy: { sortOrder: "asc" } } },
    });
  }

  findCitizenByUserId(userId: string): Promise<CitizenProfile | null> {
    return prisma.citizenProfile.findUnique({ where: { userId } });
  }

  createDraftApplication(input: { citizenId: string; userId: string; serviceId: string; applicationNumber: string; formData?: Prisma.InputJsonValue }): Promise<ApplicationWithService> {
    return prisma.application.create({
      data: {
        citizenId: input.citizenId,
        serviceId: input.serviceId,
        applicationNumber: input.applicationNumber,
        status: ApplicationStatus.DRAFT,
        formData: input.formData,
        statusHistory: { create: { status: ApplicationStatus.DRAFT, note: "Draft application created", changedByUserId: input.userId } },
      },
      include: { service: true, statusHistory: { orderBy: { createdAt: "asc" } } },
    });
  }

  async listCitizenApplications(filter: ApplicationListFilter): Promise<{ applications: ApplicationWithService[]; total: number }> {
    const where: Prisma.ApplicationWhereInput = {
      citizenId: filter.citizenId,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.serviceId ? { serviceId: filter.serviceId } : {}),
    };
    const [applications, total] = await prisma.$transaction([
      prisma.application.findMany({
        where,
        skip: filter.skip,
        take: filter.take,
        include: { service: true, statusHistory: { orderBy: { createdAt: "desc" }, take: 1 } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.application.count({ where }),
    ]);
    return { applications, total };
  }

  findCitizenApplication(applicationId: string, citizenId: string): Promise<ApplicationDetails | null> {
    return prisma.application.findFirst({
      where: { id: applicationId, citizenId },
      include: {
        service: { include: { requirements: { orderBy: { sortOrder: "asc" } } } },
        statusHistory: { orderBy: { createdAt: "asc" } },
        applicationDocuments: { include: { document: true }, orderBy: { createdAt: "asc" } },
      },
    });
  }

  async updateDraftApplication(applicationId: string, citizenId: string, formData: Prisma.InputJsonValue): Promise<ApplicationDetails | null> {
    const updated = await prisma.application.updateMany({
      where: { id: applicationId, citizenId, status: ApplicationStatus.DRAFT },
      data: { formData },
    });
    return updated.count === 1 ? this.findCitizenApplication(applicationId, citizenId) : null;
  }

  async submitDraftApplication(applicationId: string, citizenId: string, userId: string, submittedAt: Date): Promise<ApplicationDetails | null> {
    return prisma.$transaction(async (transaction) => {
      const updated = await transaction.application.updateMany({
        where: { id: applicationId, citizenId, status: ApplicationStatus.DRAFT },
        data: { status: ApplicationStatus.SUBMITTED, submittedAt },
      });
      if (updated.count !== 1) return null;

      await transaction.applicationStatusHistory.create({
        data: { applicationId, status: ApplicationStatus.SUBMITTED, note: "Application submitted", changedByUserId: userId },
      });

      return transaction.application.findFirst({
        where: { id: applicationId, citizenId },
        include: {
          service: { include: { requirements: { orderBy: { sortOrder: "asc" } } } },
          statusHistory: { orderBy: { createdAt: "asc" } },
          applicationDocuments: { include: { document: true }, orderBy: { createdAt: "asc" } },
        },
      });
    });
  }
}
