import type { Request, Response } from "express";
import { CatalogService } from "../services/catalog.service";
import { presentService, presentServiceDetails } from "../utils/application-response";

const catalogService = new CatalogService();

export async function listServices(_request: Request, response: Response): Promise<void> {
  const services = await catalogService.listServices();
  response.status(200).json({ success: true, data: { services: services.map(presentService) } });
}

export async function getService(request: Request, response: Response): Promise<void> {
  const service = await catalogService.getService((request.validated!.params as { serviceId: string }).serviceId);
  response.status(200).json({ success: true, data: { service: presentServiceDetails(service) } });
}

export async function getServiceRequirements(request: Request, response: Response): Promise<void> {
  const serviceId = (request.validated!.params as { serviceId: string }).serviceId;
  const requirements = await catalogService.getRequirements(serviceId);
  response.status(200).json({
    success: true,
    data: {
      requirements: requirements.map((requirement) => ({
        requirementId: requirement.id,
        serviceId: requirement.serviceId,
        name: requirement.name,
        description: requirement.description,
        isRequired: requirement.isRequired,
        sortOrder: requirement.sortOrder,
        configuration: "DEMO/PROTOTYPE - not legally authoritative government requirements",
      })),
    },
  });
}
