import { z } from "zod";

const uuid = z.string().uuid();

export const attachMockIssuedDocumentRequestSchema = z.object({
  body: z.object({
    mockIssuedDocumentId: uuid,
    requirementId: uuid,
  }).strict(),
  params: z.object({ applicationId: uuid }).strict(),
  query: z.object({}).strict(),
});

export type AttachMockIssuedDocumentRequestBody = z.infer<typeof attachMockIssuedDocumentRequestSchema>["body"];
