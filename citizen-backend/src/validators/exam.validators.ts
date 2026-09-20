import { Prisma } from "@prisma/client";
import { z } from "zod";
const uuid = z.string().uuid();
const formData = z.record(z.unknown()).refine((value) => Object.keys(value).length > 0 && Object.keys(value).length <= 50, "formData must be a non-empty object").transform((value) => value as Prisma.InputJsonValue);
const empty = z.object({}).strict();
export const examIdSchema = z.object({ body: empty, params: z.object({ examId: uuid }).strict(), query: empty });
export const examApplicationIdSchema = z.object({ body: empty, params: z.object({ applicationId: uuid }).strict(), query: empty });
export const createExamApplicationSchema = z.object({ body: z.object({ examId: uuid }).strict(), params: empty, query: empty });
export const updateExamApplicationSchema = z.object({ body: z.object({ formData }).strict(), params: z.object({ applicationId: uuid }).strict(), query: empty });
export const examApplicationActionSchema = z.object({ body: empty, params: z.object({ applicationId: uuid }).strict(), query: empty });

const payloadHash = z.string().regex(/^[a-fA-F0-9]{64}$/, "payloadHash must be a SHA-256 hexadecimal digest");
export const examSubmissionSchema = z.object({
  body: z.object({
    idempotencyKey: uuid,
    clientCapturedAt: z.string().datetime({ offset: true }).transform((value) => new Date(value)),
    payloadHash,
  }).strict(),
  params: z.object({ applicationId: uuid }).strict(),
  query: empty,
});

export type ExamSubmissionRequestBody = z.infer<typeof examSubmissionSchema>["body"];
