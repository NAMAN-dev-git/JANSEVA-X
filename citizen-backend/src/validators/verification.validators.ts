import { z } from "zod";

const uuid = z.string().uuid();
const empty = z.object({}).strict();
const aadhaarValue = z.string().trim().regex(/^(?:\d{4}[ -]?\d{4}[ -]?\d{4}|XXXX[ -]?XXXX[ -]?\d{4})$/, "aadhaar must be a 12-digit or masked demo Aadhaar value");
const panValue = z.string().trim().toUpperCase().regex(/^[A-Z]{5}(?:\d{4}|\*{4})[A-Z]$/, "pan must be a demo PAN or masked PAN value");

export const fingerprintSteps = ["RIGHT_INDEX", "RIGHT_MIDDLE", "RIGHT_RING", "RIGHT_PINKY", "RIGHT_THUMB"] as const;

export const aadhaarVerificationSchema = z.object({ body: z.object({ aadhaar: aadhaarValue }).strict(), params: z.object({ applicationId: uuid }).strict(), query: empty });
export const panVerificationSchema = z.object({ body: z.object({ pan: panValue }).strict(), params: z.object({ applicationId: uuid }).strict(), query: empty });
export const applicationVerificationEmptySchema = z.object({ body: empty, params: z.object({ applicationId: uuid }).strict(), query: empty });
export const faceCompleteSchema = z.object({ body: empty, params: z.object({ verificationId: uuid }).strict(), query: empty });
export const fingerprintPairSchema = z.object({ body: z.object({ pairingChallenge: z.string().uuid() }).strict(), params: z.object({ sessionId: uuid }).strict(), query: empty });
export const fingerprintStepSchema = z.object({ body: empty, params: z.object({ sessionId: uuid, step: z.enum(fingerprintSteps) }).strict(), query: empty });
export const fingerprintStatusSchema = z.object({ body: empty, params: z.object({ sessionId: uuid }).strict(), query: empty });
