import { type ServiceWithRequirements, PrismaApplicationRepository, type ApplicationRepository } from "../repositories/application.repository";
import { AppError } from "../utils/app-error";

export class CatalogService {
  constructor(private readonly repository: Pick<ApplicationRepository, "findActiveServices" | "findActiveServiceById"> = new PrismaApplicationRepository()) {}

  async listServices(): Promise<ServiceWithRequirements[]> {
    return this.repository.findActiveServices();
  }

  async getService(serviceId: string): Promise<ServiceWithRequirements> {
    const service = await this.repository.findActiveServiceById(serviceId);
    if (!service) throw new AppError("Government service not found", 404);
    return service;
  }

  async getRequirements(serviceId: string): Promise<ServiceWithRequirements["requirements"]> {
    return (await this.getService(serviceId)).requirements;
  }
}
