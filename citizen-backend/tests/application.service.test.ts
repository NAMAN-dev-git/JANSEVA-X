import { randomUUID } from "crypto";
import { ApplicationStatus, OfficerReviewStatus, type CitizenProfile, type Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import {
  type ApplicationDetails,
  type ApplicationListFilter,
  type ApplicationRepository,
  type ApplicationWithService,
  type ServiceWithRequirements,
} from "../src/repositories/application.repository";
import { ApplicationService } from "../src/services/application.service";
import { assertCitizenStatusTransition } from "../src/services/application-status.service";
import { CatalogService } from "../src/services/catalog.service";
import { AppError } from "../src/utils/app-error";

function createService(name: string, isActive = true): ServiceWithRequirements {
  const now = new Date();
  const serviceId = randomUUID();
  return {
    id: serviceId,
    name,
    slug: name.toLowerCase().replaceAll(" ", "-"),
    description: `DEMO/PROTOTYPE ${name}`,
    isActive,
    isPrototype: true,
    createdAt: now,
    updatedAt: now,
    requirements: [{
      id: randomUUID(),
      serviceId,
      name: "Identity Proof",
      description: "DEMO/PROTOTYPE requirement",
      isRequired: true,
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    }],
  };
}

function createCitizen(userId: string): CitizenProfile {
  const now = new Date();
  return {
    id: randomUUID(),
    userId,
    fullName: `Citizen ${userId}`,
    phone: null,
    dateOfBirth: null,
    address: null,
    city: null,
    state: null,
    pincode: null,
    createdAt: now,
    updatedAt: now,
  };
}

class MemoryApplicationRepository implements ApplicationRepository {
  readonly services = [createService("Trade Licence"), createService("Inactive Demo Service", false)];
  readonly citizens = [createCitizen("citizen-a"), createCitizen("citizen-b")];
  readonly applications = new Map<string, ApplicationDetails>();

  async findActiveServices(): Promise<ServiceWithRequirements[]> {
    return this.services.filter((service) => service.isActive);
  }

  async findActiveServiceById(serviceId: string): Promise<ServiceWithRequirements | null> {
    return this.services.find((service) => service.id === serviceId && service.isActive) ?? null;
  }

  async findCitizenByUserId(userId: string): Promise<CitizenProfile | null> {
    return this.citizens.find((citizen) => citizen.userId === userId) ?? null;
  }

  async createDraftApplication(input: { citizenId: string; userId: string; serviceId: string; applicationNumber: string; formData?: Prisma.InputJsonValue }): Promise<ApplicationWithService> {
    const service = this.services.find((item) => item.id === input.serviceId)!;
    const now = new Date();
    const applicationId = randomUUID();
    const application = {
      id: applicationId,
      citizenId: input.citizenId,
      serviceId: input.serviceId,
      applicationNumber: input.applicationNumber,
      status: ApplicationStatus.DRAFT,
      formData: input.formData ?? null,
      correctionReason: null,
      assignedOfficerId: null,
      reviewStatus: OfficerReviewStatus.NOT_ASSIGNED,
      assignedAt: null,
      reviewedAt: null,
      createdAt: now,
      updatedAt: now,
      submittedAt: null,
      service,
      statusHistory: [{ id: randomUUID(), applicationId, status: ApplicationStatus.DRAFT, note: "Draft application created", changedByUserId: input.userId, createdAt: now }],
      applicationDocuments: [],
    } as ApplicationDetails;
    this.applications.set(applicationId, application);
    return application as ApplicationWithService;
  }

  async listCitizenApplications(filter: ApplicationListFilter): Promise<{ applications: ApplicationWithService[]; total: number }> {
    const matching = [...this.applications.values()].filter((application) => (
      application.citizenId === filter.citizenId
      && (!filter.status || application.status === filter.status)
      && (!filter.serviceId || application.serviceId === filter.serviceId)
    )).sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
    return {
      applications: matching.slice(filter.skip, filter.skip + filter.take).map((application) => ({
        ...application,
        statusHistory: [application.statusHistory.at(-1)!],
      } as ApplicationWithService)),
      total: matching.length,
    };
  }

  async findCitizenApplication(applicationId: string, citizenId: string): Promise<ApplicationDetails | null> {
    const application = this.applications.get(applicationId);
    return application?.citizenId === citizenId ? application : null;
  }

  async updateDraftApplication(applicationId: string, citizenId: string, formData: Prisma.InputJsonValue): Promise<ApplicationDetails | null> {
    const application = await this.findCitizenApplication(applicationId, citizenId);
    if (!application || application.status !== ApplicationStatus.DRAFT) return null;
    application.formData = formData;
    application.updatedAt = new Date();
    return application;
  }

  async submitDraftApplication(applicationId: string, citizenId: string, userId: string, submittedAt: Date): Promise<ApplicationDetails | null> {
    const application = await this.findCitizenApplication(applicationId, citizenId);
    if (!application || application.status !== ApplicationStatus.DRAFT) return null;
    application.status = ApplicationStatus.SUBMITTED;
    application.submittedAt = submittedAt;
    application.updatedAt = submittedAt;
    application.statusHistory.push({ id: randomUUID(), applicationId, status: ApplicationStatus.SUBMITTED, note: "Application submitted", changedByUserId: userId, createdAt: submittedAt });
    return application;
  }
}

describe("CatalogService", () => {
  let repository: MemoryApplicationRepository;
  let service: CatalogService;

  beforeEach(() => {
    repository = new MemoryApplicationRepository();
    service = new CatalogService(repository);
  });

  it("lists only active demo services", async () => {
    const services = await service.listServices();
    expect(services).toHaveLength(1);
    expect(services[0]).toMatchObject({ name: "Trade Licence", isActive: true });
  });

  it("returns service details and requirements", async () => {
    const activeService = repository.services[0];
    await expect(service.getService(activeService.id)).resolves.toMatchObject({ id: activeService.id, requirements: [{ name: "Identity Proof" }] });
    await expect(service.getRequirements(activeService.id)).resolves.toHaveLength(1);
  });

  it("does not expose nonexistent or inactive services", async () => {
    await expect(service.getService(randomUUID())).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.getService(repository.services[1].id)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("ApplicationService", () => {
  let repository: MemoryApplicationRepository;
  let service: ApplicationService;
  let activeService: ServiceWithRequirements;

  beforeEach(() => {
    repository = new MemoryApplicationRepository();
    service = new ApplicationService(repository);
    activeService = repository.services[0];
  });

  async function createForCitizenA() {
    return service.createDraft("citizen-a", { serviceId: activeService.id, applicationData: { applicantName: "Demo Citizen" } });
  }

  it("creates a DRAFT application with initial history", async () => {
    const application = await createForCitizenA();
    expect(application).toMatchObject({ citizenId: repository.citizens[0].id, status: ApplicationStatus.DRAFT, formData: { applicantName: "Demo Citizen" } });
    expect(application.statusHistory).toHaveLength(1);
    expect(application.statusHistory[0].status).toBe(ApplicationStatus.DRAFT);
  });

  it("rejects invalid and inactive services", async () => {
    await expect(service.createDraft("citizen-a", { serviceId: randomUUID() })).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.createDraft("citizen-a", { serviceId: repository.services[1].id })).rejects.toMatchObject({ statusCode: 404 });
  });

  it("lists only the authenticated citizen applications and supports filters", async () => {
    const ownApplication = await createForCitizenA();
    await service.createDraft("citizen-b", { serviceId: activeService.id });
    const result = await service.listCitizenApplications("citizen-a", { page: 1, limit: 10, status: ApplicationStatus.DRAFT, serviceId: activeService.id });

    expect(result.total).toBe(1);
    expect(result.applications[0].id).toBe(ownApplication.id);
  });

  it("gets history and updates a draft owned by the citizen", async () => {
    const application = await createForCitizenA();
    const updated = await service.updateDraft("citizen-a", application.id, { businessName: "Demo Store" });
    const history = await service.getHistory("citizen-a", application.id);

    expect(updated.formData).toEqual({ businessName: "Demo Store" });
    expect(history.map((entry) => entry.status)).toEqual([ApplicationStatus.DRAFT]);
  });

  it("submits a draft and records the only implemented transition", async () => {
    const application = await createForCitizenA();
    const submitted = await service.submitDraft("citizen-a", application.id);

    expect(submitted).toMatchObject({ status: ApplicationStatus.SUBMITTED });
    expect(submitted.submittedAt).not.toBeNull();
    expect(submitted.statusHistory.map((entry) => entry.status)).toEqual([ApplicationStatus.DRAFT, ApplicationStatus.SUBMITTED]);
    await expect(service.updateDraft("citizen-a", application.id, { rejected: true })).rejects.toMatchObject({ statusCode: 409 });
  });

  it("rejects invalid citizen status transitions", () => {
    expect(() => assertCitizenStatusTransition(ApplicationStatus.DRAFT, ApplicationStatus.SUBMITTED)).not.toThrow();
    expect(() => assertCitizenStatusTransition(ApplicationStatus.SUBMITTED, ApplicationStatus.SUBMITTED)).toThrow(AppError);
  });

  it("prevents one citizen from reading, updating, or submitting another citizen application", async () => {
    const application = await createForCitizenA();
    await expect(service.getCitizenApplication("citizen-b", application.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.updateDraft("citizen-b", application.id, { businessName: "Unauthorized" })).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.submitDraft("citizen-b", application.id)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("rejects submission when the associated service is no longer active", async () => {
    const application = await createForCitizenA();
    activeService.isActive = false;
    await expect(service.submitDraft("citizen-a", application.id)).rejects.toMatchObject({ statusCode: 409 });
  });
});
