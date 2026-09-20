import { createHash, randomUUID } from "crypto";
import { ApplicationStatus, FingerprintSessionEventType, FingerprintSessionStatus, FingerprintStep, Prisma, VerificationStatus, VerificationType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/app-error";
import { assertIdentityVerificationTransition } from "./application-status.service";
import { DEMO_MODE, MockAadhaarProvider, MockEkycProvider, MockFaceVerificationProvider, MockFingerprintProvider, MockPanProvider } from "./identity-verification.providers";

const CORE_TYPES = [VerificationType.AADHAAR, VerificationType.PAN, VerificationType.FACE, VerificationType.FINGERPRINT];
const STEPS = [FingerprintStep.RIGHT_INDEX, FingerprintStep.RIGHT_MIDDLE, FingerprintStep.RIGHT_RING, FingerprintStep.RIGHT_PINKY, FingerprintStep.RIGHT_THUMB];
const SESSION_DURATION_MS = 10 * 60 * 1000;

export class IdentityVerificationService {
  constructor(
    private readonly aadhaarProvider = new MockAadhaarProvider(),
    private readonly panProvider = new MockPanProvider(),
    private readonly faceProvider = new MockFaceVerificationProvider(),
    private readonly fingerprintProvider = new MockFingerprintProvider(),
    private readonly ekycProvider = new MockEkycProvider(),
    private readonly database: typeof prisma = prisma,
  ) {}

  async verifyAadhaar(userId: string, applicationId: string, aadhaar: string) {
    const { citizen } = await this.eligibleApplication(userId, applicationId);
    const result = this.aadhaarProvider.verify({ applicationId, aadhaar });
    const verification = await this.save(applicationId, citizen.id, VerificationType.AADHAAR, VerificationStatus.VERIFIED, result.referenceId, {
      mode: DEMO_MODE, provider: result.provider, maskedAadhaar: result.maskedAadhaar, verificationNote: "DEMO verification only; UIDAI was not contacted.",
    });
    await this.maybeMarkIdentityVerified(applicationId, userId);
    return presentVerification(verification);
  }

  async verifyPan(userId: string, applicationId: string, pan: string) {
    const { citizen } = await this.eligibleApplication(userId, applicationId);
    const result = this.panProvider.verify({ applicationId, pan });
    const verification = await this.save(applicationId, citizen.id, VerificationType.PAN, VerificationStatus.VERIFIED, result.referenceId, {
      mode: DEMO_MODE, provider: result.provider, pan: result.maskedPan, taxpayerName: result.taxpayerName, entityType: result.entityType, verificationNote: "DEMO verification only; PAN/CBDT systems were not contacted.",
    });
    await this.maybeMarkIdentityVerified(applicationId, userId);
    return presentVerification(verification);
  }

  async startFace(userId: string, applicationId: string) {
    const { citizen } = await this.eligibleApplication(userId, applicationId);
    const existing = await this.find(applicationId, VerificationType.FACE);
    if (existing?.status === VerificationStatus.VERIFIED) return presentVerification(existing);
    const sessionReference = existing?.providerReference ?? `DEMO-FACE-SESSION-${randomUUID().toUpperCase()}`;
    const verification = await this.save(applicationId, citizen.id, VerificationType.FACE, VerificationStatus.IN_PROGRESS, sessionReference, {
      mode: DEMO_MODE, provider: "MOCK_FACE", sessionReference, expiresAt: new Date(Date.now() + SESSION_DURATION_MS).toISOString(), verificationNote: "DEMO face session only; no image, embedding, or biometric template is collected.",
    }, false);
    return presentVerification(verification);
  }

  async completeFace(userId: string, verificationId: string) {
    const owned = await this.database.verification.findFirst({ where: { id: verificationId, citizen: { userId }, type: VerificationType.FACE } });
    if (!owned) throw new AppError("Face verification not found", 404);
    await this.eligibleApplication(userId, owned.applicationId);
    if (owned.status === VerificationStatus.VERIFIED) throw new AppError("Face verification has already been completed", 409);
    if (owned.status !== VerificationStatus.IN_PROGRESS) throw new AppError("Face verification is not ready for completion", 409);
    const current = owned.result as { expiresAt?: string } | null;
    if (!current?.expiresAt || new Date(current.expiresAt) <= new Date()) throw new AppError("Face verification session has expired", 410);
    const result = this.faceProvider.complete({ verificationId });
    const verification = await this.database.verification.update({ where: { id: verificationId }, data: {
      status: VerificationStatus.VERIFIED, providerReference: result.referenceId, verifiedAt: new Date(),
      result: { mode: DEMO_MODE, provider: result.provider, matchResult: result.matchResult, livenessResult: result.livenessResult, confidence: result.confidence, confidenceMode: result.confidenceMode, verificationNote: "Simulated demo result; no real biometric matching occurred." } as Prisma.InputJsonValue,
    } });
    await this.maybeMarkIdentityVerified(owned.applicationId, userId);
    return presentVerification(verification);
  }

  async startFingerprint(userId: string, applicationId: string) {
    const { citizen } = await this.eligibleApplication(userId, applicationId);
    let verification = await this.find(applicationId, VerificationType.FINGERPRINT);
    if (!verification) {
      try {
        verification = await this.database.verification.create({ data: { applicationId, citizenId: citizen.id, type: VerificationType.FINGERPRINT, status: VerificationStatus.IN_PROGRESS, providerReference: `DEMO-FINGERPRINT-${randomUUID().toUpperCase()}`, result: { mode: DEMO_MODE, provider: "MOCK_FINGERPRINT", verificationNote: "QR sequence prototype only; no fingerprint data is captured." } } });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        verification = await this.find(applicationId, VerificationType.FINGERPRINT);
        if (!verification) throw error;
      }
    }
    const existingSession = await this.database.fingerprintSession.findUnique({ where: { verificationId: verification.id } });
    if (verification.status === VerificationStatus.VERIFIED && existingSession) return presentFingerprintSession(existingSession, verification);
    if (existingSession && existingSession.status !== FingerprintSessionStatus.EXPIRED && existingSession.expiresAt > new Date()) {
      throw new AppError("An active fingerprint session already exists", 409);
    }
    const pairingChallenge = randomUUID();
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    let session;
    try {
      session = await this.database.$transaction(async (transaction) => {
        if (existingSession) {
          const restarted = await transaction.fingerprintSession.updateMany({ where: { id: existingSession.id, OR: [{ status: FingerprintSessionStatus.EXPIRED }, { expiresAt: { lte: new Date() } }] }, data: { status: FingerprintSessionStatus.PENDING_PAIRING, pairingChallengeHash: digest(pairingChallenge), expiresAt, pairedAt: null, completedAt: null, completedSteps: [] } });
          if (restarted.count !== 1) throw new AppError("Fingerprint session state changed; start again", 409);
          await transaction.fingerprintSessionEvent.create({ data: { sessionId: existingSession.id, type: FingerprintSessionEventType.RESTARTED, metadata: demoAuditMetadata("Fingerprint demo session restarted") } });
          return transaction.fingerprintSession.findUniqueOrThrow({ where: { id: existingSession.id } });
        }
        const created = await transaction.fingerprintSession.create({ data: { verificationId: verification.id, applicationId, citizenId: citizen.id, pairingChallengeHash: digest(pairingChallenge), providerReference: verification.providerReference!, expiresAt } });
        await transaction.fingerprintSessionEvent.create({ data: { sessionId: created.id, type: FingerprintSessionEventType.CREATED, metadata: demoAuditMetadata("Fingerprint demo session created") } });
        return created;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppError("An active fingerprint session already exists", 409);
      throw error;
    }
    return { ...presentFingerprintSession(session, verification), pairingChallenge, qrPayload: `JANSEVA-X-DEMO-FP:${session.id}:${pairingChallenge}` };
  }

  async pairFingerprint(userId: string, sessionId: string, pairingChallenge: string) {
    const { session, verification } = await this.ownedSession(userId, sessionId);
    this.assertActiveSession(session);
    if (session.status === FingerprintSessionStatus.COMPLETED) throw new AppError("Fingerprint session is already completed", 409);
    if (session.status !== FingerprintSessionStatus.PENDING_PAIRING) throw new AppError("Fingerprint session has already been paired", 409);
    if (digest(pairingChallenge) !== session.pairingChallengeHash) throw new AppError("Invalid fingerprint pairing challenge", 400);
    const paired = await this.database.$transaction(async (transaction) => {
      const now = new Date();
      const updated = await transaction.fingerprintSession.updateMany({ where: { id: session.id, status: FingerprintSessionStatus.PENDING_PAIRING, pairingChallengeHash: digest(pairingChallenge), expiresAt: { gt: now } }, data: { status: FingerprintSessionStatus.PAIRED, pairedAt: now } });
      if (updated.count !== 1) return null;
      await transaction.fingerprintSessionEvent.create({ data: { sessionId: session.id, type: FingerprintSessionEventType.PAIRED, metadata: demoAuditMetadata("Fingerprint demo session paired") } });
      return transaction.fingerprintSession.findUniqueOrThrow({ where: { id: session.id } });
    });
    if (!paired) throw new AppError("Fingerprint session state changed; pairing was not completed", 409);
    return presentFingerprintSession(paired, verification);
  }

  async completeFingerprintStep(userId: string, sessionId: string, step: FingerprintStep) {
    const { session, verification } = await this.ownedSession(userId, sessionId);
    this.assertActiveSession(session);
    if (session.status !== FingerprintSessionStatus.PAIRED) throw new AppError("Fingerprint session must be paired before completing steps", 409);
    const expected = STEPS[session.completedSteps.length];
    if (step !== expected) throw new AppError(`Fingerprint step out of sequence; expected ${expected ?? "no further step"}`, 409);
    const completedSteps = [...session.completedSteps, step];
    const completed = completedSteps.length === STEPS.length;
    const updated = await this.database.$transaction(async (tx) => {
      const now = new Date();
      const updatedSession = await tx.fingerprintSession.updateMany({ where: { id: session.id, status: FingerprintSessionStatus.PAIRED, expiresAt: { gt: now }, completedSteps: { equals: session.completedSteps } }, data: { completedSteps, status: completed ? FingerprintSessionStatus.COMPLETED : FingerprintSessionStatus.PAIRED, completedAt: completed ? now : null } });
      if (updatedSession.count !== 1) return null;
      await tx.fingerprintSessionEvent.create({ data: { sessionId: session.id, type: FingerprintSessionEventType.STEP_COMPLETED, step, metadata: demoAuditMetadata(`Fingerprint demo step completed: ${step}`) } });
      if (completed) {
        await tx.verification.update({ where: { id: verification.id }, data: { status: VerificationStatus.VERIFIED, verifiedAt: now, providerReference: this.fingerprintProvider.complete({ verificationId: verification.id }).referenceId, result: this.fingerprintResult(verification.id, completedSteps) as Prisma.InputJsonValue } });
        await tx.fingerprintSessionEvent.create({ data: { sessionId: session.id, type: FingerprintSessionEventType.COMPLETED, metadata: demoAuditMetadata("Fingerprint demo sequence completed") } });
      }
      return tx.fingerprintSession.findUniqueOrThrow({ where: { id: session.id } });
    });
    if (!updated) throw new AppError("Fingerprint session state changed; step was not completed", 409);
    if (completed) await this.maybeMarkIdentityVerified(session.applicationId, userId);
    return { ...presentFingerprintSession(updated, completed ? await this.database.verification.findUniqueOrThrow({ where: { id: verification.id } }) : verification), step, stepStatus: "COMPLETED", mode: DEMO_MODE };
  }

  async fingerprintStatus(userId: string, sessionId: string) {
    const { session, verification } = await this.ownedSession(userId, sessionId);
    if (session.status !== FingerprintSessionStatus.COMPLETED && new Date(session.expiresAt) <= new Date()) {
      const expired = await this.database.$transaction(async (transaction) => {
        const updated = await transaction.fingerprintSession.updateMany({ where: { id: session.id, status: { not: FingerprintSessionStatus.COMPLETED }, expiresAt: { lte: new Date() } }, data: { status: FingerprintSessionStatus.EXPIRED } });
        if (updated.count === 1) await transaction.fingerprintSessionEvent.create({ data: { sessionId: session.id, type: FingerprintSessionEventType.EXPIRED, metadata: demoAuditMetadata("Fingerprint demo session expired") } });
        return transaction.fingerprintSession.findUniqueOrThrow({ where: { id: session.id } });
      });
      return presentFingerprintSession(expired, verification);
    }
    return presentFingerprintSession(session, verification);
  }

  async completeEkyc(userId: string, applicationId: string) {
    const { citizen } = await this.eligibleApplication(userId, applicationId);
    const prerequisites = await this.database.verification.findMany({ where: { applicationId, citizenId: citizen.id, documentId: null, type: { in: [VerificationType.AADHAAR, VerificationType.PAN] }, status: VerificationStatus.VERIFIED }, select: { type: true } });
    if (new Set(prerequisites.map((verification) => verification.type)).size !== 2) throw new AppError("Aadhaar and PAN demo verification must be completed before e-KYC", 409);
    const result = this.ekycProvider.complete({ applicationId });
    const verification = await this.save(applicationId, citizen.id, VerificationType.E_KYC, VerificationStatus.VERIFIED, result.referenceId, { mode: DEMO_MODE, provider: result.provider, documentReference: result.documentReference, verificationNote: "Synthetic demo e-KYC result; no real e-KYC document or provider was used." });
    return presentVerification(verification);
  }

  async summary(userId: string, applicationId: string) {
    const { citizen } = await this.ownedApplication(userId, applicationId);
    const records = await this.database.verification.findMany({ where: { applicationId, citizenId: citizen.id, documentId: null, type: { in: [...CORE_TYPES, VerificationType.E_KYC] } }, orderBy: { updatedAt: "desc" } });
    const byType = new Map(records.map((record) => [record.type, presentVerification(record)]));
    return { applicationId, identityVerification: { aadhaar: byType.get(VerificationType.AADHAAR) ?? null, pan: byType.get(VerificationType.PAN) ?? null, face: byType.get(VerificationType.FACE) ?? null, fingerprint: byType.get(VerificationType.FINGERPRINT) ?? null, ekyc: byType.get(VerificationType.E_KYC) ?? null } };
  }

  private async ownedApplication(userId: string, applicationId: string) {
    const citizen = await this.database.citizenProfile.findUnique({ where: { userId } });
    if (!citizen) throw new AppError("Citizen profile not found", 404);
    const application = await this.database.application.findFirst({ where: { id: applicationId, citizenId: citizen.id } });
    if (!application) throw new AppError("Application not found", 404);
    return { citizen, application };
  }

  private async eligibleApplication(userId: string, applicationId: string) {
    const owned = await this.ownedApplication(userId, applicationId);
    if (owned.application.status !== ApplicationStatus.DRAFT && owned.application.status !== ApplicationStatus.IDENTITY_VERIFIED) throw new AppError("Identity verification is available only for draft applications", 409);
    return owned;
  }

  private find(applicationId: string, type: VerificationType) { return this.database.verification.findFirst({ where: { applicationId, type, documentId: null }, orderBy: { createdAt: "desc" } }); }

  private async save(applicationId: string, citizenId: string, type: VerificationType, status: VerificationStatus, providerReference: string, result: Prisma.InputJsonValue, verified = true) {
    const existing = await this.find(applicationId, type);
    const data = { status, providerReference, result, failureReason: null, verifiedAt: verified ? new Date() : null };
    return existing ? this.database.verification.update({ where: { id: existing.id }, data }) : this.database.verification.create({ data: { applicationId, citizenId, type, ...data } });
  }

  private async ownedSession(userId: string, sessionId: string) {
    const session = await this.database.fingerprintSession.findFirst({ where: { id: sessionId, citizen: { userId } }, include: { verification: true } });
    if (!session) throw new AppError("Fingerprint session not found", 404);
    await this.eligibleApplication(userId, session.applicationId);
    return { session, verification: session.verification };
  }

  private assertActiveSession(session: { status: FingerprintSessionStatus; expiresAt: Date }) {
    if (new Date(session.expiresAt) <= new Date()) throw new AppError("Fingerprint session has expired", 410);
    if (session.status === FingerprintSessionStatus.EXPIRED) throw new AppError("Fingerprint session has expired", 410);
  }

  private fingerprintResult(verificationId: string, completedSteps: FingerprintStep[]) {
    const result = this.fingerprintProvider.complete({ verificationId });
    return { mode: DEMO_MODE, provider: result.provider, result: result.result, completedSteps, limitation: result.limitation };
  }

  private async maybeMarkIdentityVerified(applicationId: string, userId: string) {
    const completed = await this.database.verification.findMany({ where: { applicationId, documentId: null, type: { in: CORE_TYPES }, status: VerificationStatus.VERIFIED }, select: { type: true } });
    if (new Set(completed.map((verification) => verification.type)).size !== CORE_TYPES.length) return;
    assertIdentityVerificationTransition(ApplicationStatus.DRAFT, ApplicationStatus.IDENTITY_VERIFIED);
    const transitioned = await this.database.application.updateMany({ where: { id: applicationId, status: ApplicationStatus.DRAFT }, data: { status: ApplicationStatus.IDENTITY_VERIFIED } });
    if (transitioned.count === 1) await this.database.applicationStatusHistory.create({ data: { applicationId, status: ApplicationStatus.IDENTITY_VERIFIED, note: "Core identity verification completed (DEMO only; no government or biometric provider contacted)", changedByUserId: userId } });
  }
}

function digest(value: string) { return createHash("sha256").update(value).digest("hex"); }

function isUniqueViolation(error: unknown): boolean { return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002"); }

function demoAuditMetadata(note: string): Prisma.InputJsonValue { return { mode: DEMO_MODE, note }; }

function presentVerification(record: { id: string; type: VerificationType; status: VerificationStatus; providerReference: string | null; result: unknown; createdAt: Date; verifiedAt: Date | null; updatedAt: Date }) {
  const result = (record.result && typeof record.result === "object" ? record.result : {}) as Record<string, unknown>;
  const safeMetadata = Object.fromEntries(Object.entries(result).filter(([key]) => ["maskedAadhaar", "pan", "taxpayerName", "entityType", "matchResult", "livenessResult", "confidence", "confidenceMode", "documentReference", "provider", "mode", "result", "completedSteps", "limitation", "verificationNote", "sessionReference", "expiresAt"].includes(key)));
  return { verificationId: record.id, verificationType: record.type === VerificationType.E_KYC ? "EKYC" : record.type, status: record.status === VerificationStatus.VERIFIED && record.type === VerificationType.E_KYC ? "COMPLETED" : record.status, mode: DEMO_MODE, referenceId: record.providerReference, createdAt: record.createdAt, completedAt: record.verifiedAt, updatedAt: record.updatedAt, ...safeMetadata };
}

function presentFingerprintSession(session: { id: string; status: FingerprintSessionStatus; providerReference: string; completedSteps: FingerprintStep[]; pairedAt: Date | null; completedAt: Date | null; expiresAt: Date }, verification: { id: string; type: VerificationType; status: VerificationStatus; providerReference: string | null; result: unknown; createdAt: Date; verifiedAt: Date | null; updatedAt: Date }) {
  const completedSteps = session.completedSteps;
  return { sessionId: session.id, state: session.status, paired: session.status === FingerprintSessionStatus.PAIRED || session.status === FingerprintSessionStatus.COMPLETED, currentStep: STEPS[completedSteps.length] ?? null, completedSteps, remainingSteps: STEPS.slice(completedSteps.length), referenceId: session.providerReference, pairedAt: session.pairedAt, completedAt: session.completedAt, expiresAt: session.expiresAt, verification: presentVerification(verification) };
}
