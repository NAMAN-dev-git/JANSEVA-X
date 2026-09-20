import { randomUUID } from "crypto";
import { ApplicationStatus, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/app-error";
import { assertCitizenStatusTransition } from "./application-status.service";

const applicationInclude = { service: true } satisfies Prisma.ApplicationInclude;

export type SubmissionApplication = Prisma.ApplicationGetPayload<{ include: typeof applicationInclude }>;
export type SubmissionTicket = Prisma.ApplicationSubmissionTicketGetPayload<Record<string, never>>;
type SubmissionTransaction = Prisma.TransactionClient;

// Kept local so the worker and submission boundary share stable wire values;
// Prisma enforces the matching database enum when the generated client is used.
export const ApplicationSubmissionTicketState = {
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
} as const;

export interface ApplicationSubmissionRequest {
  applicationId: string;
  idempotencyKey?: string;
}

export interface ApplicationSubmissionResult {
  application: SubmissionApplication;
  ticket: SubmissionTicket;
  stableResult: boolean;
}

export interface ApplicationSubmissionPersistence {
  findCitizenId(userId: string): Promise<string | null>;
  findTicket(applicationId: string, citizenId: string): Promise<SubmissionTicket | null>;
  transaction<T>(operation: (transaction: SubmissionTransaction) => Promise<T>): Promise<T>;
}

export class PrismaApplicationSubmissionPersistence implements ApplicationSubmissionPersistence {
  constructor(private readonly client: PrismaClient = prisma) {}

  async findCitizenId(userId: string): Promise<string | null> {
    return (await this.client.citizenProfile.findUnique({ where: { userId }, select: { id: true } }))?.id ?? null;
  }

  findTicket(applicationId: string, citizenId: string): Promise<SubmissionTicket | null> {
    return this.client.applicationSubmissionTicket.findFirst({ where: { applicationId, citizenId } });
  }

  transaction<T>(operation: (transaction: SubmissionTransaction) => Promise<T>): Promise<T> {
    return this.client.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 2_000, timeout: 8_000 });
  }
}

function isRetryableTransactionError(error: unknown): boolean {
  const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: unknown }).code : undefined;
  return code === "P2034" || code === "P2002";
}

/**
 * Records the durable generic-application submission boundary. SUBMITTED
 * remains the existing employee-review queue state; processing is represented
 * only by the associated ticket.
 */
export class ApplicationSubmissionService {
  constructor(
    private readonly persistence: ApplicationSubmissionPersistence = new PrismaApplicationSubmissionPersistence(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async submit(userId: string, request: ApplicationSubmissionRequest): Promise<ApplicationSubmissionResult> {
    const citizenId = await this.persistence.findCitizenId(userId);
    if (!citizenId) throw new AppError("Citizen profile not found", 404);

    const idempotencyKey = request.idempotencyKey ?? randomUUID();
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.persistence.transaction((transaction) => this.submitInTransaction(transaction, citizenId, userId, { ...request, idempotencyKey }));
      } catch (error) {
        if (!isRetryableTransactionError(error) || attempt === 2) throw error;
        lastError = error;
      }
    }
    throw lastError ?? new AppError("Application submission could not be processed", 409);
  }

  async getTicket(userId: string, applicationId: string): Promise<SubmissionTicket> {
    const citizenId = await this.persistence.findCitizenId(userId);
    if (!citizenId) throw new AppError("Citizen profile not found", 404);
    const ticket = await this.persistence.findTicket(applicationId, citizenId);
    if (!ticket) throw new AppError("Submission ticket not found", 404);
    return ticket;
  }

  async retryTicket(userId: string, applicationId: string): Promise<SubmissionTicket> {
    const citizenId = await this.persistence.findCitizenId(userId);
    if (!citizenId) throw new AppError("Citizen profile not found", 404);

    return this.persistence.transaction(async (transaction) => {
      const ticket = await transaction.applicationSubmissionTicket.findFirst({ where: { applicationId, citizenId } });
      if (!ticket) throw new AppError("Submission ticket not found", 404);
      if (ticket.status !== ApplicationSubmissionTicketState.FAILED) {
        throw new AppError("Only failed submission tickets can be retried", 409);
      }
      const reset = await transaction.applicationSubmissionTicket.updateMany({
        where: { id: ticket.id, status: ApplicationSubmissionTicketState.FAILED },
        data: {
          status: ApplicationSubmissionTicketState.PENDING,
          processingStartedAt: null,
          completedAt: null,
          failedAt: null,
          lastError: null,
        },
      });
      if (reset.count !== 1) throw new AppError("Submission ticket changed while retrying", 409);
      return transaction.applicationSubmissionTicket.findUniqueOrThrow({ where: { id: ticket.id } });
    });
  }

  private async submitInTransaction(transaction: SubmissionTransaction, citizenId: string, userId: string, request: Required<ApplicationSubmissionRequest>): Promise<ApplicationSubmissionResult> {
    const application = await transaction.application.findFirst({
      where: { id: request.applicationId, citizenId },
      include: applicationInclude,
    });
    if (!application) throw new AppError("Application not found", 404);

    const ticketForKey = await transaction.applicationSubmissionTicket.findUnique({ where: { idempotencyKey: request.idempotencyKey } });
    if (ticketForKey) {
      if (ticketForKey.applicationId !== application.id || ticketForKey.citizenId !== citizenId) {
        throw new AppError("Idempotency key was already used for another application submission", 409);
      }
      return { application, ticket: ticketForKey, stableResult: true };
    }

    const existingTicket = await transaction.applicationSubmissionTicket.findUnique({ where: { applicationId: application.id } });
    if (existingTicket) return { application, ticket: existingTicket, stableResult: true };

    if (!application.service.isActive) throw new AppError("Government service is not active", 409);
    assertCitizenStatusTransition(application.status, ApplicationStatus.SUBMITTED);

    const submittedAt = this.now();
    const ticket = await transaction.applicationSubmissionTicket.create({
      data: { applicationId: application.id, citizenId, idempotencyKey: request.idempotencyKey, createdAt: submittedAt },
    });
    const updated = await transaction.application.updateMany({
      where: { id: application.id, citizenId, status: ApplicationStatus.IDENTITY_VERIFIED },
      data: { status: ApplicationStatus.SUBMITTED, submittedAt },
    });
    if (updated.count !== 1) throw new AppError("Application could not be submitted", 409);

    await transaction.applicationStatusHistory.create({
      data: {
        applicationId: application.id,
        status: ApplicationStatus.SUBMITTED,
        note: "Application submitted; processing ticket created (pending)",
        changedByUserId: userId,
      },
    });
    const submitted = await transaction.application.findUniqueOrThrow({ where: { id: application.id }, include: applicationInclude });
    return { application: submitted, ticket, stableResult: false };
  }
}
