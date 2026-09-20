import { ApplicationStatus, OfficerReviewStatus } from "@prisma/client";
import { z } from "zod";

const uuid = z.string().uuid();
const empty = z.object({}).strict();
const isoDateTime = z.string().datetime({ offset: true }).transform((value) => new Date(value));

const registryQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  status: z.nativeEnum(ApplicationStatus).optional(),
  reviewStatus: z.nativeEnum(OfficerReviewStatus).optional(),
  serviceId: uuid.optional(),
  search: z.string().trim().min(1).max(100).optional(),
  assignedOfficerId: z.union([uuid, z.literal("unassigned")]).optional(),
  submittedFrom: isoDateTime.optional(),
  submittedTo: isoDateTime.optional(),
  sortBy: z.enum(["submittedAt", "createdAt", "updatedAt"]).default("submittedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
}).strict().superRefine((query, context) => {
  if (query.submittedFrom && query.submittedTo && query.submittedFrom > query.submittedTo) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["submittedTo"], message: "submittedTo must be on or after submittedFrom" });
  }
});

const completedQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  serviceId: uuid.optional(),
  search: z.string().trim().min(1).max(100).optional(),
  sortBy: z.enum(["createdAt", "updatedAt"]).default("updatedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
}).strict();

export const applicationParams = z.object({ body: empty, params: z.object({ applicationId: uuid }).strict(), query: empty });
export const documentParams = z.object({ body: empty, params: z.object({ documentId: uuid }).strict(), query: empty });
export const queueSchema = z.object({ body: empty, params: empty, query: registryQuery });
export const dashboardSchema = z.object({ body: empty, params: empty, query: empty });
export const completedSchema = z.object({ body: empty, params: empty, query: completedQuery });
export const assignmentSchema = z.object({ body: z.object({ officerId: uuid.nullable() }).strict(), params: z.object({ applicationId: uuid }).strict(), query: empty });
export const decisionSchema = z.object({ body: z.object({ status: z.enum(["CORRECTION_REQUIRED", "APPROVED", "REJECTED"]), note: z.string().trim().min(3).max(1000) }).strict(), params: z.object({ applicationId: uuid }).strict(), query: empty });
export const documentReviewSchema = z.object({ body: z.object({ action: z.enum(["VERIFY", "REJECT", "REQUEST_CORRECTION"]), note: z.string().trim().min(3).max(1000) }).strict(), params: z.object({ documentId: uuid }).strict(), query: empty });
export const identityReviewSchema = z.object({ body: z.object({ action: z.enum(["VERIFY", "REJECT", "REQUEST_MANUAL_REVIEW"]), note: z.string().trim().min(3).max(1000) }).strict(), params: z.object({ applicationId: uuid, verificationId: uuid }).strict(), query: empty });
