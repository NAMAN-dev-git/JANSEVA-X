import { createHash, randomUUID } from "crypto";
import {
  ExamApplicationStatus,
  ExamPaymentStatus,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/app-error";

const applicationInclude = {
  exam: { include: { requirements: { orderBy: { sortOrder: "asc" } } } },
  documents: { include: { requirement: true, mockIssuedDocument: true }, orderBy: { attachedAt: "asc" } },
  timelineEvents: { orderBy: { sortOrder: "asc" } },
  reminder: true,
} satisfies Prisma.ExamApplicationInclude;

const timeline = [
  ["APPLICATION_SUBMITTED", "Application Submitted", "Completed", "2026-09-17", "COMPLETED"],
  ["PAYMENT_CONFIRMED", "Payment Confirmed", "Controlled DEMO payment recorded after server-side acceptance", "2026-09-17", "COMPLETED"],
  ["APPLICATION_ACCEPTED", "Application Accepted", "Prototype status update; not a government acceptance", "2026-09-18", "COMPLETED"],
  ["CORRECTION_WINDOW", "Correction Window", "20–25 October 2026", "2026-10-20", "UPCOMING"],
  ["CITY_SLIP", "Exam City Slip", "Expected DEMO information", "2026-12-01", "UPCOMING"],
  ["ADMIT_CARD", "Admit Card", "Expected DEMO admit card date", "2026-12-10", "UPCOMING"],
  ["EXAM_DATE", "Exam Date", "Fictional prototype exam date", "2026-12-15", "UPCOMING"],
  ["ANSWER_KEY", "Answer Key", "Expected DEMO release", "2026-12-22", "UPCOMING"],
  ["RESULT", "Result", "Expected DEMO release", "2027-01-15", "UPCOMING"],
] as const;

export interface ExamSubmissionRequest {
  applicationId: string;
  idempotencyKey: string;
  clientCapturedAt: Date;
  payloadHash: string;
}

export const ExamSubmissionAttemptStatus = {
  RECEIVED: "RECEIVED",
  ACCEPTED: "ACCEPTED",
  REJECTED_PERMANENT: "REJECTED_PERMANENT",
} as const;
export type ExamSubmissionAttemptStatus = (typeof ExamSubmissionAttemptStatus)[keyof typeof ExamSubmissionAttemptStatus];

export const ExamDeadlineAssessment = {
  SERVER_ON_TIME: "SERVER_ON_TIME",
  CLIENT_CLAIMED_ON_TIME_UNVERIFIED: "CLIENT_CLAIMED_ON_TIME_UNVERIFIED",
  SERVER_LATE: "SERVER_LATE",
} as const;
export type ExamDeadlineAssessment = (typeof ExamDeadlineAssessment)[keyof typeof ExamDeadlineAssessment];

export type SubmissionApplication = Prisma.ExamApplicationGetPayload<{ include: typeof applicationInclude }>;
export interface SubmissionAttempt {
  id: string;
  applicationId: string;
  idempotencyKey: string;
  payloadHash: string;
  clientCapturedAt: Date;
  serverReceivedAt: Date;
  serverAcceptedAt: Date | null;
  deadlineAtSnapshot: Date;
  deadlineAssessment: ExamDeadlineAssessment;
  status: ExamSubmissionAttemptStatus;
  deliveryAttemptCount: number;
  lastDeliveryAt: Date | null;
  failureCode: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExamSubmissionResult {
  application: SubmissionApplication;
  receipt: SubmissionAttempt | null;
  accepted: boolean;
  stableFinalResult: boolean;
  demoPrototypePolicy: "SERVER_ON_TIME" | "CLIENT_CLAIMED_ON_TIME_UNVERIFIED_ACCEPTED_FOR_DEMO" | null;
}

type SubmissionTransaction = Prisma.TransactionClient;

export interface ExamSubmissionPersistence {
  findCitizenId(userId: string): Promise<string | null>;
  transaction<T>(operation: (tx: SubmissionTransaction) => Promise<T>): Promise<T>;
}

export class PrismaExamSubmissionPersistence implements ExamSubmissionPersistence {
  constructor(private readonly client: PrismaClient = prisma) {}

  async findCitizenId(userId: string): Promise<string | null> {
    return (await this.client.citizenProfile.findUnique({ where: { userId }, select: { id: true } }))?.id ?? null;
  }

  transaction<T>(operation: (tx: SubmissionTransaction) => Promise<T>): Promise<T> {
    return this.client.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 2_000, timeout: 8_000 });
  }
}

export function assessDeadline(serverReceivedAt: Date, clientCapturedAt: Date, deadlineAt: Date): ExamDeadlineAssessment {
  if (serverReceivedAt <= deadlineAt) return ExamDeadlineAssessment.SERVER_ON_TIME;
  if (clientCapturedAt <= deadlineAt) return ExamDeadlineAssessment.CLIENT_CLAIMED_ON_TIME_UNVERIFIED;
  return ExamDeadlineAssessment.SERVER_LATE;
}

export function isFinallySubmitted(status: ExamApplicationStatus): boolean {
  return status !== ExamApplicationStatus.DRAFT && status !== ExamApplicationStatus.READY_FOR_SUBMISSION;
}

function validationFor(application: SubmissionApplication) {
  const data = (application.formData ?? {}) as Record<string, unknown>;
  const missingFields = ["fullName", "dateOfBirth", "gender", "mobile", "email", "address", "qualification", "examRegion", "examCity"]
    .filter((key) => typeof data[key] !== "string" || !String(data[key]).trim());
  const attachedIds = new Set(application.documents.map((document) => document.requirementId));
  const missingRequirements = application.exam.requirements
    .filter((requirement) => requirement.isRequired && !attachedIds.has(requirement.id))
    .map((requirement) => ({ requirementId: requirement.id, name: requirement.name, documentType: requirement.documentType, issuableServiceSlug: requirement.issuableServiceSlug }));
  return { valid: missingFields.length === 0 && missingRequirements.length === 0, missingFields, missingRequirements };
}

function isRetryableTransactionError(error: unknown): boolean {
  const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: unknown }).code : undefined;
  return code === "P2034" || code === "P2002";
}

/**
 * Durable, server-authoritative exam submission receipt handling. This has no
 * browser queue state and deliberately makes no government-system claim.
 */
export class ExamSubmissionService {
  constructor(
    private readonly persistence: ExamSubmissionPersistence = new PrismaExamSubmissionPersistence(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async submit(userId: string, request: ExamSubmissionRequest): Promise<ExamSubmissionResult> {
    const citizenId = await this.persistence.findCitizenId(userId);
    if (!citizenId) throw new AppError("Citizen profile not found", 404);

    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.persistence.transaction((tx) => this.submitInTransaction(tx, citizenId, request));
      } catch (error) {
        if (!isRetryableTransactionError(error) || attempt === 2) throw error;
        lastError = error;
      }
    }
    throw lastError ?? new AppError("Submission could not be processed", 409);
  }

  /** Compatibility bridge for the old body-less /submit endpoint. */
  async submitLegacy(userId: string, applicationId: string): Promise<ExamSubmissionResult> {
    const capturedAt = this.now();
    return this.submit(userId, {
      applicationId,
      idempotencyKey: randomUUID(),
      clientCapturedAt: capturedAt,
      payloadHash: createHash("sha256").update(`legacy-exam-submit:${applicationId}`).digest("hex"),
    });
  }

  private async submitInTransaction(tx: SubmissionTransaction, citizenId: string, request: ExamSubmissionRequest): Promise<ExamSubmissionResult> {
    const application = await tx.examApplication.findFirst({
      where: { id: request.applicationId, citizenId },
      include: applicationInclude,
    });
    if (!application) throw new AppError("Exam application not found", 404);

    const existing = await tx.examSubmissionAttempt.findUnique({ where: { idempotencyKey: request.idempotencyKey } });
    if (existing) {
      if (existing.applicationId !== application.id || existing.payloadHash !== request.payloadHash) {
        throw new AppError("Idempotency key was already used with a different submission payload", 409);
      }
      const delivered = await tx.examSubmissionAttempt.update({
        where: { id: existing.id },
        data: { deliveryAttemptCount: { increment: 1 }, lastDeliveryAt: this.now() },
      });
      return this.result(application, delivered, isFinallySubmitted(application.status), true);
    }

    if (isFinallySubmitted(application.status)) {
      const acceptedReceipt = await tx.examSubmissionAttempt.findFirst({
        where: { applicationId: application.id, status: ExamSubmissionAttemptStatus.ACCEPTED },
        orderBy: { createdAt: "asc" },
      });
      return this.result(application, acceptedReceipt, true, true);
    }

    const serverReceivedAt = this.now();
    const deadlineAssessment = assessDeadline(serverReceivedAt, request.clientCapturedAt, application.exam.applicationDeadlineAt);
    let receipt = await tx.examSubmissionAttempt.create({
      data: {
        applicationId: application.id,
        idempotencyKey: request.idempotencyKey,
        payloadHash: request.payloadHash,
        clientCapturedAt: request.clientCapturedAt,
        serverReceivedAt,
        deadlineAtSnapshot: application.exam.applicationDeadlineAt,
        deadlineAssessment,
        lastDeliveryAt: serverReceivedAt,
      },
    });

    const validation = validationFor(application);
    if (!validation.valid) {
      receipt = await tx.examSubmissionAttempt.update({
        where: { id: receipt.id },
        data: { status: ExamSubmissionAttemptStatus.REJECTED_PERMANENT, failureCode: "FORM_OR_REQUIRED_DOCUMENTS_INCOMPLETE" },
      });
      return this.result(application, receipt, false, false);
    }

    const demoClientClaimAccepted = application.exam.isDemo && deadlineAssessment === ExamDeadlineAssessment.CLIENT_CLAIMED_ON_TIME_UNVERIFIED;
    if (deadlineAssessment === ExamDeadlineAssessment.SERVER_LATE || !application.exam.isDemo && deadlineAssessment === ExamDeadlineAssessment.CLIENT_CLAIMED_ON_TIME_UNVERIFIED) {
      receipt = await tx.examSubmissionAttempt.update({
        where: { id: receipt.id },
        data: {
          status: ExamSubmissionAttemptStatus.REJECTED_PERMANENT,
          failureCode: deadlineAssessment === ExamDeadlineAssessment.SERVER_LATE ? "SERVER_RECEIVED_AFTER_DEADLINE" : "CLIENT_TIME_UNVERIFIED_AFTER_DEADLINE",
        },
      });
      return this.result(application, receipt, false, false);
    }

    const serverAcceptedAt = this.now();
    const transitioned = await tx.examApplication.updateMany({
      where: { id: application.id, citizenId, status: { in: [ExamApplicationStatus.DRAFT, ExamApplicationStatus.READY_FOR_SUBMISSION] } },
      // submittedAt records this authoritative server acceptance—not the
      // client clock—and payment remains untouched at this point.
      data: { status: ExamApplicationStatus.SUBMITTED, submittedAt: serverAcceptedAt },
    });
    if (transitioned.count !== 1) {
      receipt = await tx.examSubmissionAttempt.update({
        where: { id: receipt.id },
        data: { status: ExamSubmissionAttemptStatus.REJECTED_PERMANENT, failureCode: "APPLICATION_ALREADY_FINALLY_SUBMITTED" },
      });
      const finalApplication = await tx.examApplication.findUniqueOrThrow({ where: { id: application.id }, include: applicationInclude });
      return this.result(finalApplication, receipt, true, true);
    }

    // Payment is a controlled demo transition and occurs only after this
    // server-side acceptance update in the same serializable transaction.
    await tx.examTimelineEvent.createMany({
      data: timeline.map(([eventType, title, description, targetDate, status], index) => ({
        examApplicationId: application.id,
        eventType,
        title,
        description,
        targetDate: new Date(`${targetDate}T00:00:00.000Z`),
        status,
        sortOrder: index + 1,
      })),
    });
    receipt = await tx.examSubmissionAttempt.update({
      where: { id: receipt.id },
      data: { status: ExamSubmissionAttemptStatus.ACCEPTED, serverAcceptedAt },
    });
    await tx.examApplication.update({
      where: { id: application.id },
      data: { status: ExamApplicationStatus.PAYMENT_CONFIRMED, paymentStatus: ExamPaymentStatus.SUCCESSFUL },
    });
    const acceptedApplication = await tx.examApplication.findUniqueOrThrow({ where: { id: application.id }, include: applicationInclude });
    return this.result(acceptedApplication, receipt, true, false, demoClientClaimAccepted);
  }

  private result(application: SubmissionApplication, receipt: SubmissionAttempt | null, accepted: boolean, stableFinalResult: boolean, demoClientClaimAccepted = false): ExamSubmissionResult {
    return {
      application,
      receipt,
      accepted,
      stableFinalResult,
      demoPrototypePolicy: demoClientClaimAccepted
        ? "CLIENT_CLAIMED_ON_TIME_UNVERIFIED_ACCEPTED_FOR_DEMO"
        : receipt?.deadlineAssessment === ExamDeadlineAssessment.SERVER_ON_TIME ? "SERVER_ON_TIME" : null,
    };
  }
}

export { applicationInclude, validationFor };
