import { z } from "zod";
import { MOCK_E_SIGN_CONSENT_VERSION } from "../services/generated-document.service";

const uuid = z.string().uuid();
const empty = z.object({}).strict();

export const generatedDocumentIdParamsSchema = z.object({ body: empty, params: z.object({ generatedDocumentId: uuid }).strict(), query: empty });
export const generatedDocumentIssueSchema = z.object({ body: empty, params: z.object({ applicationId: uuid }).strict(), query: empty });
export const generatedDocumentListSchema = z.object({ body: empty, params: z.object({ applicationId: uuid }).strict(), query: empty });
export const generatedDocumentSigningStartSchema = z.object({ body: empty, params: z.object({ generatedDocumentId: uuid }).strict(), query: empty });
export const generatedDocumentSigningCompleteSchema = z.object({
  body: z.object({ signingChallenge: z.string().uuid(), consentAccepted: z.literal(true), consentVersion: z.literal(MOCK_E_SIGN_CONSENT_VERSION) }).strict(),
  params: z.object({ sessionId: uuid }).strict(),
  query: empty,
});
export const applicationCompletionSchema = z.object({ body: empty, params: z.object({ applicationId: uuid }).strict(), query: empty });

export type GeneratedDocumentSigningCompleteRequestBody = z.infer<typeof generatedDocumentSigningCompleteSchema>["body"];
