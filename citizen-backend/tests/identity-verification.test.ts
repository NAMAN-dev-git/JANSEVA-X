import { randomUUID } from "crypto";
import { ApplicationStatus, FingerprintSessionEventType, FingerprintSessionStatus, FingerprintStep, VerificationStatus, VerificationType } from "@prisma/client";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app";
import { IdentityVerificationService } from "../src/services/identity-verification.service";
import { MockAadhaarProvider, MockEkycProvider, MockFaceVerificationProvider, MockFingerprintProvider, MockPanProvider } from "../src/services/identity-verification.providers";
import { aadhaarVerificationSchema, panVerificationSchema } from "../src/validators/verification.validators";

const applicationId = "3f0ab02d-2f89-4145-b980-4ad21aee2e8f";
const secondApplicationId = "3b4e7fc4-5b8a-4617-9e0d-6ddd7d7cff59";
const citizenId = "50cddaa3-d75d-4794-8266-a26cfbbd94d7";
const secondCitizenId = "2aa9ec2e-d6d9-492b-ae78-832e079a3f76";
const now = () => new Date();

class MemoryIdentityDatabase {
  readonly citizens = new Map([["citizen-a", { id: citizenId, userId: "citizen-a" }], ["citizen-b", { id: secondCitizenId, userId: "citizen-b" }]]);
  readonly applications = new Map<string, any>([[applicationId, { id: applicationId, citizenId, status: ApplicationStatus.SUBMITTED }], [secondApplicationId, { id: secondApplicationId, citizenId: secondCitizenId, status: ApplicationStatus.SUBMITTED }]]);
  readonly verifications: any[] = [];
  readonly sessions: any[] = [];
  readonly events: any[] = [];
  readonly history: any[] = [];

  readonly citizenProfile = { findUnique: async ({ where }: any) => this.citizens.get(where.userId) ?? null };
  readonly application = {
    findFirst: async ({ where }: any) => { const item = this.applications.get(where.id); return item?.citizenId === where.citizenId ? item : null; },
    updateMany: async ({ where, data }: any) => { const item = this.applications.get(where.id); if (!item || (where.status && item.status !== where.status)) return { count: 0 }; Object.assign(item, data); return { count: 1 }; },
  };
  readonly applicationStatusHistory = { create: async ({ data }: any) => { const item = { id: randomUUID(), ...data, createdAt: now() }; this.history.push(item); return item; } };
  readonly verification = {
    findFirst: async ({ where }: any) => this.verifications.filter((item) => matchesVerification(item, where, this.citizens)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null,
    findMany: async ({ where, select }: any) => { const values = this.verifications.filter((item) => matchesVerification(item, where, this.citizens)).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()); return select ? values.map((item) => ({ type: item.type })) : values; },
    create: async ({ data }: any) => { if (this.verifications.some((item) => item.applicationId === data.applicationId && item.type === data.type && item.documentId === null)) throw { code: "P2002" }; const item = verificationRecord(data); this.verifications.push(item); return item; },
    update: async ({ where, data }: any) => { const item = this.verifications.find((value) => value.id === where.id); if (!item) throw new Error("Missing verification"); Object.assign(item, data, { updatedAt: now() }); return item; },
    findUniqueOrThrow: async ({ where }: any) => { const item = this.verifications.find((value) => value.id === where.id); if (!item) throw new Error("Missing verification"); return item; },
  };
  readonly fingerprintSession = {
    findUnique: async ({ where }: any) => this.sessions.find((item) => (where.id ? item.id === where.id : item.verificationId === where.verificationId)) ?? null,
    findUniqueOrThrow: async ({ where }: any) => { const item = this.sessions.find((value) => value.id === where.id); if (!item) throw new Error("Missing session"); return item; },
    findFirst: async ({ where }: any) => { const item = this.sessions.find((value) => value.id === where.id && (!where.citizen || this.citizens.get(where.citizen.userId)?.id === value.citizenId)); return item ? { ...item, verification: this.verifications.find((verification) => verification.id === item.verificationId) } : null; },
    create: async ({ data }: any) => { if (this.sessions.some((item) => item.verificationId === data.verificationId)) throw { code: "P2002" }; const item = { id: randomUUID(), status: FingerprintSessionStatus.PENDING_PAIRING, completedSteps: [], pairedAt: null, completedAt: null, createdAt: now(), updatedAt: now(), ...data }; this.sessions.push(item); return item; },
    updateMany: async ({ where, data }: any) => { const item = this.sessions.find((value) => matchesSession(value, where)); if (!item) return { count: 0 }; Object.assign(item, data, { updatedAt: now() }); return { count: 1 }; },
  };
  readonly fingerprintSessionEvent = { create: async ({ data }: any) => { const event = { id: randomUUID(), createdAt: now(), ...data }; this.events.push(event); return event; } };
  async $transaction<T>(callback: (transaction: any) => Promise<T>): Promise<T> { return callback(this); }
}

function verificationRecord(data: any) { const createdAt = now(); return { id: randomUUID(), documentId: null, failureReason: null, verifiedAt: null, updatedAt: createdAt, createdAt, ...data }; }
function matchesVerification(item: any, where: any, citizens: Map<string, { id: string }>) {
  if (where.id && item.id !== where.id) return false;
  if (where.applicationId && item.applicationId !== where.applicationId) return false;
  if (where.citizenId && item.citizenId !== where.citizenId) return false;
  if (where.documentId === null && item.documentId !== null) return false;
  if (where.type && (where.type.in ? !where.type.in.includes(item.type) : item.type !== where.type)) return false;
  if (where.status && item.status !== where.status) return false;
  if (where.citizen && citizens.get(where.citizen.userId)?.id !== item.citizenId) return false;
  return true;
}
function matchesSession(item: any, where: any) {
  if (where.id && item.id !== where.id) return false;
  if (where.status && (typeof where.status === "string" ? item.status !== where.status : where.status.not && item.status === where.status.not)) return false;
  if (where.pairingChallengeHash && item.pairingChallengeHash !== where.pairingChallengeHash) return false;
  if (where.expiresAt?.gt && !(item.expiresAt > where.expiresAt.gt)) return false;
  if (where.expiresAt?.lte && !(item.expiresAt <= where.expiresAt.lte)) return false;
  if (where.completedSteps?.equals && JSON.stringify(item.completedSteps) !== JSON.stringify(where.completedSteps.equals)) return false;
  if (where.OR && !where.OR.some((condition: any) => matchesSession(item, condition))) return false;
  return true;
}
function makeService(database = new MemoryIdentityDatabase()) { return { database, service: new IdentityVerificationService(undefined, undefined, undefined, undefined, undefined, database as any) }; }

describe("Batch 5 identity verification validation and mock providers", () => {
  it("accepts safe demo identifier input and rejects malformed values", () => {
    expect(aadhaarVerificationSchema.safeParse({ body: { aadhaar: "XXXX-XXXX-1234" }, params: { applicationId }, query: {} }).success).toBe(true);
    expect(aadhaarVerificationSchema.safeParse({ body: { aadhaar: "123" }, params: { applicationId }, query: {} }).success).toBe(false);
    expect(panVerificationSchema.safeParse({ body: { pan: "ABCDE1234F" }, params: { applicationId }, query: {} }).success).toBe(true);
    expect(panVerificationSchema.safeParse({ body: { pan: "ABCDE123F" }, params: { applicationId }, query: {} }).success).toBe(false);
  });

  it("returns deterministic, explicitly mock provider results without raw identifiers", () => {
    const aadhaar = new MockAadhaarProvider().verify({ applicationId, aadhaar: "1234-5678-9012" });
    const pan = new MockPanProvider().verify({ applicationId, pan: "ABCDE1234F" });
    expect(aadhaar).toMatchObject({ maskedAadhaar: "XXXX-XXXX-9012", provider: "MOCK_AADHAAR" });
    expect(JSON.stringify(aadhaar)).not.toContain("123456789012");
    expect(pan).toMatchObject({ maskedPan: "ABCDE****F", taxpayerName: "DEMO CITIZEN", provider: "MOCK_PAN" });
    expect(new MockFaceVerificationProvider().complete({ verificationId: applicationId })).toMatchObject({ provider: "MOCK_FACE", confidenceMode: "DEMO/SIMULATED" });
    expect(new MockFingerprintProvider().complete({ verificationId: applicationId }).limitation).toContain("no physical fingerprint");
    expect(new MockEkycProvider().complete({ applicationId }).provider).toBe("MOCK_EKYC");
  });
});

describe("IdentityVerificationService workflow", () => {
  it("verifies Aadhaar and PAN safely and controls duplicate retries", async () => {
    const { database, service } = makeService();
    await expect(service.verifyAadhaar("citizen-a", applicationId, "1234-5678-9012")).resolves.toMatchObject({ status: "VERIFIED", maskedAadhaar: "XXXX-XXXX-9012" });
    await expect(service.verifyPan("citizen-a", applicationId, "ABCDE1234F")).resolves.toMatchObject({ pan: "ABCDE****F", taxpayerName: "DEMO CITIZEN" });
    await service.verifyAadhaar("citizen-a", applicationId, "9999-9999-9012");
    expect(database.verifications.filter((item) => item.type === VerificationType.AADHAAR)).toHaveLength(1);
    expect(JSON.stringify(database.verifications)).not.toContain("123456789012");
  });

  it("starts and completes an owned face verification", async () => {
    const { service } = makeService();
    const started = await service.startFace("citizen-a", applicationId);
    expect(started).toMatchObject({ verificationType: "FACE", status: "IN_PROGRESS", mode: "DEMO" });
    await expect(service.completeFace("citizen-a", started.verificationId)).resolves.toMatchObject({ status: "VERIFIED", matchResult: "MATCH", livenessResult: "PASSED" });
    await expect(service.completeFace("citizen-a", started.verificationId)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("enforces pairing, ordering, immutable audit entries, and final fingerprint verification", async () => {
    const { database, service } = makeService();
    const started = await service.startFingerprint("citizen-a", applicationId);
    expect(started).toMatchObject({ state: "PENDING_PAIRING", completedSteps: [] });
    await expect(service.pairFingerprint("citizen-a", started.sessionId, "00000000-0000-4000-8000-000000000000")).rejects.toMatchObject({ statusCode: 400 });
    await service.pairFingerprint("citizen-a", started.sessionId, started.pairingChallenge);
    await expect(service.fingerprintStatus("citizen-a", started.sessionId)).resolves.toMatchObject({ state: "PAIRED", currentStep: "RIGHT_INDEX" });
    await expect(service.pairFingerprint("citizen-a", started.sessionId, started.pairingChallenge)).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.completeFingerprintStep("citizen-a", started.sessionId, FingerprintStep.RIGHT_MIDDLE)).rejects.toMatchObject({ statusCode: 409 });
    for (const step of [FingerprintStep.RIGHT_INDEX, FingerprintStep.RIGHT_MIDDLE, FingerprintStep.RIGHT_RING, FingerprintStep.RIGHT_PINKY, FingerprintStep.RIGHT_THUMB]) await service.completeFingerprintStep("citizen-a", started.sessionId, step);
    await expect(service.completeFingerprintStep("citizen-a", started.sessionId, FingerprintStep.RIGHT_THUMB)).rejects.toMatchObject({ statusCode: 409 });
    expect(database.events.map((event) => event.type)).toEqual([FingerprintSessionEventType.CREATED, FingerprintSessionEventType.PAIRED, ...Array(5).fill(FingerprintSessionEventType.STEP_COMPLETED), FingerprintSessionEventType.COMPLETED]);
    expect(JSON.stringify(database.events)).not.toContain(started.pairingChallenge);
  });

  it("rejects expired sessions and protects concurrent starts and repeated step completion", async () => {
    const { database, service } = makeService();
    const [first, second] = await Promise.allSettled([service.startFingerprint("citizen-a", applicationId), service.startFingerprint("citizen-a", applicationId)]);
    expect([first, second].filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const started = first.status === "fulfilled" ? first.value : (second as PromiseFulfilledResult<any>).value;
    database.sessions[0].expiresAt = new Date(Date.now() - 1);
    await expect(service.fingerprintStatus("citizen-a", started.sessionId)).resolves.toMatchObject({ state: "EXPIRED" });
    await expect(service.pairFingerprint("citizen-a", started.sessionId, started.pairingChallenge)).rejects.toMatchObject({ statusCode: 410 });
    const restarted = await service.startFingerprint("citizen-a", applicationId);
    await service.pairFingerprint("citizen-a", restarted.sessionId, restarted.pairingChallenge);
    const results = await Promise.allSettled([service.completeFingerprintStep("citizen-a", restarted.sessionId, FingerprintStep.RIGHT_INDEX), service.completeFingerprintStep("citizen-a", restarted.sessionId, FingerprintStep.RIGHT_INDEX)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  });

  it("prevents application, verification, and fingerprint-session IDOR", async () => {
    const { service } = makeService();
    await expect(service.verifyAadhaar("citizen-b", applicationId, "XXXX-XXXX-1234")).rejects.toMatchObject({ statusCode: 404 });
    const face = await service.startFace("citizen-a", applicationId);
    await expect(service.completeFace("citizen-b", face.verificationId)).rejects.toMatchObject({ statusCode: 404 });
    const fingerprint = await service.startFingerprint("citizen-a", applicationId);
    await expect(service.fingerprintStatus("citizen-b", fingerprint.sessionId)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("enforces e-KYC prerequisites, aggregates only application identity records, and transitions only when complete", async () => {
    const { database, service } = makeService();
    await expect(service.completeEkyc("citizen-a", applicationId)).rejects.toMatchObject({ statusCode: 409 });
    await service.verifyAadhaar("citizen-a", applicationId, "XXXX-XXXX-1234");
    expect(database.applications.get(applicationId).status).toBe(ApplicationStatus.SUBMITTED);
    for (const type of [VerificationType.PAN, VerificationType.FACE, VerificationType.FINGERPRINT]) database.verifications.push(verificationRecord({ applicationId, citizenId, documentId: "document-linked", type, status: VerificationStatus.VERIFIED, providerReference: "DOCUMENT-ONLY", result: {} }));
    await service.verifyAadhaar("citizen-a", applicationId, "XXXX-XXXX-1234");
    expect(database.applications.get(applicationId).status).toBe(ApplicationStatus.SUBMITTED);
    await service.verifyPan("citizen-a", applicationId, "ABCDE1234F");
    const face = await service.startFace("citizen-a", applicationId); await service.completeFace("citizen-a", face.verificationId);
    const fingerprint = await service.startFingerprint("citizen-a", applicationId); await service.pairFingerprint("citizen-a", fingerprint.sessionId, fingerprint.pairingChallenge);
    for (const step of [FingerprintStep.RIGHT_INDEX, FingerprintStep.RIGHT_MIDDLE, FingerprintStep.RIGHT_RING, FingerprintStep.RIGHT_PINKY, FingerprintStep.RIGHT_THUMB]) await service.completeFingerprintStep("citizen-a", fingerprint.sessionId, step);
    expect(database.applications.get(applicationId).status).toBe(ApplicationStatus.IDENTITY_VERIFIED);
    await expect(service.completeEkyc("citizen-a", applicationId)).resolves.toMatchObject({ verificationType: "EKYC", status: "COMPLETED" });
    await expect(service.summary("citizen-a", applicationId)).resolves.toMatchObject({ identityVerification: { aadhaar: { status: "VERIFIED" }, pan: { status: "VERIFIED" }, face: { status: "VERIFIED" }, fingerprint: { status: "VERIFIED" }, ekyc: { status: "COMPLETED" } } });
  });

  it("keeps document-linked Batch 4 verification records out of the Batch 5 summary", async () => {
    const { database, service } = makeService();
    database.verifications.push(verificationRecord({ applicationId, citizenId, documentId: "batch4-document", type: VerificationType.DOCUMENT, status: VerificationStatus.MANUAL_REVIEW, providerReference: null, result: { analysis: "Batch 4" } }));
    await expect(service.summary("citizen-a", applicationId)).resolves.toMatchObject({ identityVerification: { aadhaar: null, pan: null, face: null, fingerprint: null, ekyc: null } });
  });
});

describe("Batch 5 authorization boundary", () => {
  it("rejects unauthenticated identity and QR-session endpoints before database access", async () => {
    await request(app).post(`/api/applications/${applicationId}/verifications/aadhaar`).send({ aadhaar: "XXXX-XXXX-1234" }).expect(401);
    await request(app).post(`/api/verifications/${applicationId}/face/complete`).send({}).expect(401);
    await request(app).post(`/api/fingerprint-sessions/${applicationId}/pair`).send({ pairingChallenge: "f5b9b3d8-58c1-4cfd-a310-8a5ee917e8e3" }).expect(401);
    await request(app).get(`/api/applications/${applicationId}/verifications/summary`).expect(401);
  });
});
