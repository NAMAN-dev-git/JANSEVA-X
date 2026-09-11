import { z } from "zod";
import { documentTypes } from "../services/document-analysis.service";

const uuid = z.string().uuid();

export const documentIdParamsSchema = z.object({
  body: z.object({}).strict(),
  params: z.object({ documentId: uuid }).strict(),
  query: z.object({}),
});

export const uploadDocumentBodySchema = z.object({
  expectedDocumentType: z.enum(documentTypes).optional(),
  requirementId: uuid.optional(),
}).strict();

export const applicationDocumentUploadParamsSchema = z.object({
  body: z.unknown(),
  params: z.object({ applicationId: uuid }).strict(),
  query: z.object({}),
});

export type UploadDocumentBody = z.infer<typeof uploadDocumentBodySchema>;
