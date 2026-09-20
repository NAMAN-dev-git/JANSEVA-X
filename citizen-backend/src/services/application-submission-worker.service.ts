import { ApplicationStatus, Prisma, PrismaClient } from "@prisma/client";
import { logError } from "../config/logger";
import { prisma } from "../lib/prisma";
import { ApplicationSubmissionTicketState, type SubmissionTicket } from "./application-submission.service";

type SubmissionTransaction = Prisma.TransactionClient;

export interface ApplicationSubmissionTicketProcessor {
  process(input: { ticketId: string; applicationId: string }): Promise<void>;
}

export interface ApplicationSubmissionWorkerPersistence {
  claimNext(now: Date): Promise<SubmissionTicket | null>;
  applicationIsSubmitted(applicationId: string): Promise<boolean>;
  complete(ticketId: string, completedAt: Date): Promise<void>;
  fail(ticketId: string, failedAt: Date, safeError: string): Promise<void>;
  requeueStaleProcessing(before: Date): Promise<void>;
}

function isSerializationConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "P2034";
}

/**
 * The current processor deliberately performs no new verification or AI work.
 * It is the extension point for future server-side readiness/document work.
 */
export class ExistingApplicationSubmissionProcessor implements ApplicationSubmissionTicketProcessor {
  async process(_input: { ticketId: string; applicationId: string }): Promise<void> {}
}

export class PrismaApplicationSubmissionWorkerPersistence implements ApplicationSubmissionWorkerPersistence {
  constructor(private readonly client: PrismaClient = prisma) {}

  async claimNext(now: Date): Promise<SubmissionTicket | null> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.client.$transaction(async (transaction) => this.claimInTransaction(transaction, now), {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 2_000,
          timeout: 8_000,
        });
      } catch (error) {
        if (!isSerializationConflict(error) || attempt === 2) throw error;
      }
    }
    return null;
  }

  applicationIsSubmitted(applicationId: string): Promise<boolean> {
    return this.client.application.count({ where: { id: applicationId, status: ApplicationStatus.SUBMITTED } }).then((count) => count === 1);
  }

  async complete(ticketId: string, completedAt: Date): Promise<void> {
    await this.client.applicationSubmissionTicket.updateMany({
      where: { id: ticketId, status: ApplicationSubmissionTicketState.PROCESSING },
      data: { status: ApplicationSubmissionTicketState.COMPLETED, completedAt, failedAt: null, lastError: null },
    });
  }

  async fail(ticketId: string, failedAt: Date, safeError: string): Promise<void> {
    await this.client.applicationSubmissionTicket.updateMany({
      where: { id: ticketId, status: ApplicationSubmissionTicketState.PROCESSING },
      data: { status: ApplicationSubmissionTicketState.FAILED, failedAt, lastError: safeError },
    });
  }

  async requeueStaleProcessing(before: Date): Promise<void> {
    await this.client.applicationSubmissionTicket.updateMany({
      where: { status: ApplicationSubmissionTicketState.PROCESSING, processingStartedAt: { lte: before } },
      data: { status: ApplicationSubmissionTicketState.PENDING, processingStartedAt: null },
    });
  }

  private async claimInTransaction(transaction: SubmissionTransaction, now: Date): Promise<SubmissionTicket | null> {
    const candidate = await transaction.applicationSubmissionTicket.findFirst({
      where: { status: ApplicationSubmissionTicketState.PENDING },
      orderBy: { createdAt: "asc" },
    });
    if (!candidate) return null;
    const claimed = await transaction.applicationSubmissionTicket.updateMany({
      where: { id: candidate.id, status: ApplicationSubmissionTicketState.PENDING },
      data: {
        status: ApplicationSubmissionTicketState.PROCESSING,
        processingStartedAt: now,
        failedAt: null,
        lastError: null,
        attemptCount: { increment: 1 },
      },
    });
    if (claimed.count !== 1) return null;
    return transaction.applicationSubmissionTicket.findUniqueOrThrow({ where: { id: candidate.id } });
  }
}

/** A bounded, database-backed worker suitable for the JANSEVA-X prototype. */
export class ApplicationSubmissionWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly persistence: ApplicationSubmissionWorkerPersistence = new PrismaApplicationSubmissionWorkerPersistence(),
    private readonly processor: ApplicationSubmissionTicketProcessor = new ExistingApplicationSubmissionProcessor(),
    private readonly now: () => Date = () => new Date(),
    private readonly batchSize = 5,
    private readonly processingLeaseMs = 60_000,
  ) {}

  start(pollIntervalMs: number): void {
    if (this.timer) return;
    this.timer = setInterval(() => { void this.runOnce().catch(logError); }, pollIntervalMs);
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  async runOnce(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const now = this.now();
      await this.persistence.requeueStaleProcessing(new Date(now.getTime() - this.processingLeaseMs));
      let processed = 0;
      while (processed < this.batchSize) {
        const ticket = await this.persistence.claimNext(this.now());
        if (!ticket) break;
        await this.processClaimedTicket(ticket);
        processed += 1;
      }
      return processed;
    } finally {
      this.running = false;
    }
  }

  private async processClaimedTicket(ticket: SubmissionTicket): Promise<void> {
    try {
      if (!await this.persistence.applicationIsSubmitted(ticket.applicationId)) {
        throw new Error("Application is no longer submitted");
      }
      await this.processor.process({ ticketId: ticket.id, applicationId: ticket.applicationId });
      await this.persistence.complete(ticket.id, this.now());
    } catch {
      await this.persistence.fail(ticket.id, this.now(), "Background processing could not be completed. You can retry this submission.");
    }
  }
}
