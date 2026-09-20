import { randomUUID } from "crypto";
import express from "express";
import jwt, { type SignOptions } from "jsonwebtoken";
import request from "supertest";
import { ApplicationStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { env } from "../src/config/env";
import { errorHandler } from "../src/middleware/error-handler";
import { createRequireActiveAccount, requireAuth, requireRole } from "../src/middleware/require-auth";
import {
  ApplicationSubmissionService,
  ApplicationSubmissionTicketState,
  type ApplicationSubmissionPersistence,
} from "../src/services/application-submission.service";
import {
  ApplicationSubmissionWorker,
  type ApplicationSubmissionTicketProcessor,
  type ApplicationSubmissionWorkerPersistence,
} from "../src/services/application-submission-worker.service";
import { presentSubmissionTicket } from "../src/controllers/application.controller";
import { submitApplicationRequestSchema } from "../src/validators/application.validators";

function application(citizenId: string, status = ApplicationStatus.IDENTITY_VERIFIED, isActive = true) {
  const now = new Date("2026-09-18T12:00:00.000Z");
  return {
    id: randomUUID(), citizenId, applicationNumber: `JX-${randomUUID()}`, status, submittedAt: null,
    createdAt: now, updatedAt: now, service: { id: randomUUID(), isActive },
  };
}

class MemorySubmissionPersistence implements ApplicationSubmissionPersistence {
  readonly citizens = new Map([[
    "user-a", "citizen-a",
  ], [
    "user-b", "citizen-b",
  ]]);
  readonly applications = [application("citizen-a"), application("citizen-a"), application("citizen-b")];
  readonly tickets: any[] = [];
  readonly history: any[] = [];
  transactionFailures = 0;

  async findCitizenId(userId: string) { return this.citizens.get(userId) ?? null; }
  async findTicket(applicationId: string, citizenId: string) {
    return this.tickets.find((ticket) => ticket.applicationId === applicationId && ticket.citizenId === citizenId) ?? null;
  }

  async transaction<T>(operation: (transaction: any) => Promise<T>): Promise<T> {
    if (this.transactionFailures > 0) {
      this.transactionFailures -= 1;
      throw { code: "P2034" };
    }
    return operation({
      application: {
        findFirst: async ({ where }: any) => this.applications.find((item) => item.id === where.id && item.citizenId === where.citizenId) ?? null,
        updateMany: async ({ where, data }: any) => {
          const item = this.applications.find((candidate) => candidate.id === where.id && candidate.citizenId === where.citizenId && candidate.status === where.status);
          if (!item) return { count: 0 };
          Object.assign(item, data, { updatedAt: data.submittedAt });
          return { count: 1 };
        },
        findUniqueOrThrow: async ({ where }: any) => this.applications.find((item) => item.id === where.id)!,
      },
      applicationSubmissionTicket: {
        findUnique: async ({ where }: any) => this.tickets.find((ticket) => (
          ticket.idempotencyKey === where.idempotencyKey || ticket.applicationId === where.applicationId
        )) ?? null,
        findFirst: async ({ where }: any) => this.tickets.find((ticket) => ticket.applicationId === where.applicationId && ticket.citizenId === where.citizenId) ?? null,
        updateMany: async ({ where, data }: any) => {
          const ticket = this.tickets.find((candidate) => candidate.id === where.id && candidate.status === where.status);
          if (!ticket) return { count: 0 };
          Object.assign(ticket, data, { updatedAt: new Date() });
          return { count: 1 };
        },
        findUniqueOrThrow: async ({ where }: any) => this.tickets.find((ticket) => ticket.id === where.id)!,
        create: async ({ data }: any) => {
          if (this.tickets.some((ticket) => ticket.idempotencyKey === data.idempotencyKey || ticket.applicationId === data.applicationId)) throw { code: "P2002" };
          const ticket = { id: randomUUID(), status: "PENDING", createdAt: data.createdAt, updatedAt: data.createdAt, ...data };
          this.tickets.push(ticket);
          return ticket;
        },
      },
      applicationStatusHistory: {
        create: async ({ data }: any) => { this.history.push({ id: randomUUID(), createdAt: new Date(), ...data }); },
      },
    });
  }
}

class MemoryWorkerPersistence implements ApplicationSubmissionWorkerPersistence {
  readonly ticket = {
    id: randomUUID(), applicationId: randomUUID(), citizenId: "citizen-a", idempotencyKey: randomUUID(),
    status: ApplicationSubmissionTicketState.PENDING as string, attemptCount: 0,
    processingStartedAt: null as Date | null, completedAt: null as Date | null, failedAt: null as Date | null,
    lastError: null as string | null, createdAt: new Date("2026-09-18T12:00:00.000Z"), updatedAt: new Date("2026-09-18T12:00:00.000Z"),
  };
  applicationSubmitted = true;

  async claimNext(now: Date) {
    if (this.ticket.status !== ApplicationSubmissionTicketState.PENDING) return null;
    this.ticket.status = ApplicationSubmissionTicketState.PROCESSING;
    this.ticket.processingStartedAt = now;
    this.ticket.attemptCount += 1;
    return this.ticket as any;
  }
  async applicationIsSubmitted() { return this.applicationSubmitted; }
  async complete(ticketId: string, completedAt: Date) {
    if (ticketId === this.ticket.id && this.ticket.status === ApplicationSubmissionTicketState.PROCESSING) {
      this.ticket.status = ApplicationSubmissionTicketState.COMPLETED;
      this.ticket.completedAt = completedAt;
      this.ticket.failedAt = null;
      this.ticket.lastError = null;
    }
  }
  async fail(ticketId: string, failedAt: Date, safeError: string) {
    if (ticketId === this.ticket.id && this.ticket.status === ApplicationSubmissionTicketState.PROCESSING) {
      this.ticket.status = ApplicationSubmissionTicketState.FAILED;
      this.ticket.failedAt = failedAt;
      this.ticket.lastError = safeError;
    }
  }
  async requeueStaleProcessing(before: Date) {
    if (this.ticket.status === ApplicationSubmissionTicketState.PROCESSING && this.ticket.processingStartedAt && this.ticket.processingStartedAt <= before) {
      this.ticket.status = ApplicationSubmissionTicketState.PENDING;
      this.ticket.processingStartedAt = null;
    }
  }
}

class RecordingProcessor implements ApplicationSubmissionTicketProcessor {
  calls = 0;
  constructor(private readonly shouldFail = false) {}
  async process() {
    this.calls += 1;
    if (this.shouldFail) throw new Error("processor failure");
  }
}

function subject() {
  const persistence = new MemorySubmissionPersistence();
  return { persistence, service: new ApplicationSubmissionService(persistence, () => new Date("2026-09-18T12:00:00.000Z")) };
}

describe("B9 Phase 1 application submission tickets", () => {
  it("creates one durable pending ticket for the owned identity-verified application", async () => {
    const { service, persistence } = subject();
    const target = persistence.applications[0];
    const result = await service.submit("user-a", { applicationId: target.id, idempotencyKey: randomUUID() });

    expect(result).toMatchObject({ stableResult: false, application: { id: target.id, status: ApplicationStatus.SUBMITTED }, ticket: { applicationId: target.id, citizenId: "citizen-a", status: "PENDING" } });
    expect(result.application.submittedAt).toEqual(new Date("2026-09-18T12:00:00.000Z"));
    expect(persistence.tickets).toHaveLength(1);
    expect(persistence.history).toMatchObject([{ applicationId: target.id, status: ApplicationStatus.SUBMITTED, changedByUserId: "user-a" }]);
  });

  it("returns the same durable ticket for a same-key retry and after a new service instance", async () => {
    const { service, persistence } = subject();
    const target = persistence.applications[0];
    const idempotencyKey = randomUUID();
    const first = await service.submit("user-a", { applicationId: target.id, idempotencyKey });
    const retry = await service.submit("user-a", { applicationId: target.id, idempotencyKey });
    const afterRestart = await new ApplicationSubmissionService(persistence).getTicket("user-a", target.id);

    expect(retry).toMatchObject({ stableResult: true, ticket: { id: first.ticket.id } });
    expect(afterRestart).toMatchObject({ id: first.ticket.id, applicationId: target.id, citizenId: "citizen-a" });
    expect(persistence.tickets).toHaveLength(1);
  });

  it("does not create a second logical submission for a different key or permit a key to move applications", async () => {
    const { service, persistence } = subject();
    const [firstApplication, secondApplication] = persistence.applications;
    const firstKey = randomUUID();
    const first = await service.submit("user-a", { applicationId: firstApplication.id, idempotencyKey: firstKey });
    const differentKey = await service.submit("user-a", { applicationId: firstApplication.id, idempotencyKey: randomUUID() });

    expect(differentKey).toMatchObject({ stableResult: true, ticket: { id: first.ticket.id } });
    await expect(service.submit("user-a", { applicationId: secondApplication.id, idempotencyKey: firstKey })).rejects.toMatchObject({ statusCode: 409 });
    expect(persistence.tickets).toHaveLength(1);
  });

  it("keeps authorization, lifecycle, and inactive-account boundaries intact", async () => {
    const { service, persistence } = subject();
    const target = persistence.applications[0];
    const foreign = persistence.applications[2];
    foreign.status = ApplicationStatus.DRAFT;

    await expect(service.submit("user-b", { applicationId: target.id, idempotencyKey: randomUUID() })).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.submit("user-b", { applicationId: foreign.id, idempotencyKey: randomUUID() })).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.getTicket("user-b", target.id)).rejects.toMatchObject({ statusCode: 404 });

    let handlerReached = false;
    const protectedApp = express();
    protectedApp.post("/submit", requireAuth, createRequireActiveAccount(async () => ({ role: "CITIZEN", isActive: false, officer: null })), requireRole("CITIZEN"), (_request, response) => { handlerReached = true; response.status(200).send(); });
    protectedApp.use(errorHandler);
    const token = jwt.sign({ userId: "user-a", role: "CITIZEN" }, env.JWT_SECRET, { expiresIn: "1h" } as SignOptions);
    await request(protectedApp).post("/submit").set("Authorization", `Bearer ${token}`).expect(401);
    expect(handlerReached).toBe(false);
  });

  it("retries serialization conflicts and keeps one ticket/history transition", async () => {
    const { service, persistence } = subject();
    persistence.transactionFailures = 1;
    const result = await service.submit("user-a", { applicationId: persistence.applications[0].id, idempotencyKey: randomUUID() });

    expect(result.ticket.status).toBe("PENDING");
    expect(persistence.tickets).toHaveLength(1);
    expect(persistence.history).toHaveLength(1);
  });

  it("validates an optional UUID idempotency key without breaking the legacy empty body", () => {
    const applicationId = randomUUID();
    expect(submitApplicationRequestSchema.safeParse({ body: {}, params: { applicationId }, query: {} }).success).toBe(true);
    expect(submitApplicationRequestSchema.safeParse({ body: { idempotencyKey: randomUUID() }, params: { applicationId }, query: {} }).success).toBe(true);
    expect(submitApplicationRequestSchema.safeParse({ body: { idempotencyKey: "not-a-uuid" }, params: { applicationId }, query: {} }).success).toBe(false);
  });
});

describe("B9 Phase 2 application submission processing", () => {
  const clock = () => new Date("2026-09-18T12:05:00.000Z");

  it("claims a pending ticket once and completes it without changing the application lifecycle", async () => {
    const persistence = new MemoryWorkerPersistence();
    const processor = new RecordingProcessor();
    const worker = new ApplicationSubmissionWorker(persistence, processor, clock);

    await expect(worker.runOnce()).resolves.toBe(1);
    expect(processor.calls).toBe(1);
    expect(persistence.ticket).toMatchObject({
      status: ApplicationSubmissionTicketState.COMPLETED,
      attemptCount: 1,
      processingStartedAt: clock(),
      completedAt: clock(),
    });
  });

  it("does not allow two worker instances to process the same claimed ticket", async () => {
    const persistence = new MemoryWorkerPersistence();
    const processor = new RecordingProcessor();
    const firstWorker = new ApplicationSubmissionWorker(persistence, processor, clock);
    const secondWorker = new ApplicationSubmissionWorker(persistence, processor, clock);

    await Promise.all([firstWorker.runOnce(), secondWorker.runOnce()]);
    expect(processor.calls).toBe(1);
    expect(persistence.ticket).toMatchObject({ status: ApplicationSubmissionTicketState.COMPLETED, attemptCount: 1 });
  });

  it("records a safe processing failure, then retries the same durable ticket without another submission history entry", async () => {
    const workerPersistence = new MemoryWorkerPersistence();
    const failingWorker = new ApplicationSubmissionWorker(workerPersistence, new RecordingProcessor(true), clock);
    await failingWorker.runOnce();
    expect(workerPersistence.ticket).toMatchObject({ status: ApplicationSubmissionTicketState.FAILED, attemptCount: 1 });
    expect(workerPersistence.ticket.lastError).toBe("Background processing could not be completed. You can retry this submission.");

    const { service, persistence } = subject();
    const target = persistence.applications[0];
    const submitted = await service.submit("user-a", { applicationId: target.id, idempotencyKey: randomUUID() });
    Object.assign(submitted.ticket, { status: ApplicationSubmissionTicketState.FAILED, attemptCount: 1, processingStartedAt: clock(), failedAt: clock(), lastError: "safe" });
    const retried = await service.retryTicket("user-a", target.id);

    expect(retried).toMatchObject({ id: submitted.ticket.id, status: ApplicationSubmissionTicketState.PENDING, attemptCount: 1, processingStartedAt: null, failedAt: null, lastError: null });
    expect(persistence.tickets).toHaveLength(1);
    expect(persistence.history).toHaveLength(1);
  });

  it("presents owner-safe tracking data without internal ticket fields", () => {
    const createdAt = new Date("2026-09-18T12:00:00.000Z");
    const ticket = {
      id: randomUUID(), applicationId: randomUUID(), citizenId: "citizen-a", idempotencyKey: randomUUID(),
      status: ApplicationSubmissionTicketState.FAILED, attemptCount: 2, createdAt, updatedAt: createdAt,
      processingStartedAt: createdAt, completedAt: null, failedAt: createdAt, lastError: "Background processing could not be completed. You can retry this submission.",
    } as any;
    expect(presentSubmissionTicket(ticket)).toEqual({
      ticketId: ticket.id, applicationId: ticket.applicationId, processingState: ApplicationSubmissionTicketState.FAILED,
      attemptCount: 2, createdAt, processingStartedAt: createdAt, completedAt: null, failedAt: createdAt,
      failureReason: ticket.lastError,
    });
  });
});
