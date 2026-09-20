import { ApplicationStatus, type Prisma } from "@prisma/client";
import { z } from "zod";

const uuid = z.string().uuid();

function isValidJsonValue(value: unknown, depth = 0): boolean {
  if (depth > 10 || value === null || typeof value === "boolean") return depth <= 10;
  if (typeof value === "string") return value.length <= 10_000;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length <= 50 && value.every((item) => isValidJsonValue(item, depth + 1));
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.keys(record).length <= 50 && Object.entries(record).every(([key, item]) => key.length <= 100 && isValidJsonValue(item, depth + 1));
  }
  return false;
}

const applicationData = z.record(z.unknown()).refine(
  (value) => Object.keys(value).length > 0 && isValidJsonValue(value),
  "applicationData must be a non-empty JSON object with supported values",
).transform((value) => value as Prisma.InputJsonValue);

export const serviceIdParamsSchema = z.object({
  body: z.object({}),
  params: z.object({ serviceId: uuid }).strict(),
  query: z.object({}),
});

export const applicationIdParamsSchema = z.object({
  body: z.object({}),
  params: z.object({ applicationId: uuid }).strict(),
  query: z.object({}),
});

export const createApplicationRequestSchema = z.object({
  body: z.object({ serviceId: uuid, applicationData: applicationData.optional() }).strict(),
  params: z.object({}),
  query: z.object({}),
});

export const listApplicationsRequestSchema = z.object({
  body: z.object({}),
  params: z.object({}),
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10),
    status: z.nativeEnum(ApplicationStatus).optional(),
    serviceId: uuid.optional(),
  }).strict(),
});

export const updateApplicationRequestSchema = z.object({
  body: z.object({ applicationData }).strict(),
  params: z.object({ applicationId: uuid }).strict(),
  query: z.object({}),
});

export const submitApplicationRequestSchema = z.object({
  body: z.object({ idempotencyKey: uuid.optional() }).strict(),
  params: z.object({ applicationId: uuid }).strict(),
  query: z.object({}),
});

export type CreateApplicationRequestBody = z.infer<typeof createApplicationRequestSchema>["body"];
export type ListApplicationsRequestQuery = z.infer<typeof listApplicationsRequestSchema>["query"];
export type UpdateApplicationRequestBody = z.infer<typeof updateApplicationRequestSchema>["body"];
export type SubmitApplicationRequestBody = z.infer<typeof submitApplicationRequestSchema>["body"];
