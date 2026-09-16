import { z } from "zod";

const uuid = z.string().uuid();

export const issuedDocumentIdParamsSchema = z.object({
  body: z.object({}),
  params: z.object({ documentId: uuid }).strict(),
  query: z.object({}),
});
