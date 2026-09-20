import { randomUUID } from "crypto";
import { ApplicationStatus, Prisma } from "@prisma/client";
import {
  type ApplicationDetails,
  type ApplicationListFilter,
  type ApplicationRepository,
  PrismaApplicationRepository,
} from "../repositories/application.repository";
import { AppError } from "../utils/app-error";

export interface CreateApplicationInput {
  serviceId: string;
  applicationData?: Prisma.InputJsonValue;
}

export interface ListApplicationsInput {
  page: number;
  limit: number;
  status?: ApplicationStatus;
  serviceId?: string;
}

export class ApplicationService {
  constructor(private readonly repository: ApplicationRepository = new PrismaApplicationRepository()) {}

  async createDraft(userId: string, input: CreateApplicationInput) {
    const [citizen, service] = await Promise.all([
      this.repository.findCitizenByUserId(userId),
      this.repository.findActiveServiceById(input.serviceId),
    ]);
    if (!citizen) throw new AppError("Citizen profile not found", 404);
    if (!service) throw new AppError("Government service not found", 404);

    return this.repository.createDraftApplication({
      citizenId: citizen.id,
      userId,
      serviceId: service.id,
      applicationNumber: createApplicationNumber(),
      formData: input.applicationData,
    });
  }

  async listCitizenApplications(userId: string, input: ListApplicationsInput) {
    const citizen = await this.getCitizen(userId);
    const filter: ApplicationListFilter = {
      citizenId: citizen.id,
      status: input.status,
      serviceId: input.serviceId,
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    };
    const result = await this.repository.listCitizenApplications(filter);
    return { ...result, page: input.page, limit: input.limit, totalPages: Math.ceil(result.total / input.limit) };
  }

  async getCitizenApplication(userId: string, applicationId: string): Promise<ApplicationDetails> {
    const citizen = await this.getCitizen(userId);
    return this.getOwnedApplication(citizen.id, applicationId);
  }

  async updateDraft(userId: string, applicationId: string, applicationData: Prisma.InputJsonValue): Promise<ApplicationDetails> {
    const citizen = await this.getCitizen(userId);
    const application = await this.getOwnedApplication(citizen.id, applicationId);
    if (application.status !== ApplicationStatus.DRAFT) {
      throw new AppError("Only draft applications can be updated", 409);
    }

    const updated = await this.repository.updateDraftApplication(applicationId, citizen.id, applicationData);
    if (!updated) throw new AppError("Application draft could not be updated", 409);
    return updated;
  }

  async getHistory(userId: string, applicationId: string) {
    return (await this.getCitizenApplication(userId, applicationId)).statusHistory;
  }

  private async getCitizen(userId: string) {
    const citizen = await this.repository.findCitizenByUserId(userId);
    if (!citizen) throw new AppError("Citizen profile not found", 404);
    return citizen;
  }

  private async getOwnedApplication(citizenId: string, applicationId: string): Promise<ApplicationDetails> {
    const application = await this.repository.findCitizenApplication(applicationId, citizenId);
    if (!application) throw new AppError("Application not found", 404);
    return application;
  }
}

function createApplicationNumber(): string {
  const datePart = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `JX-${datePart}-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
}
