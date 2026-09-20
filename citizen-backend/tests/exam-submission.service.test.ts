import { randomUUID } from "crypto";
import { ExamApplicationStatus, ExamPaymentStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  ExamDeadlineAssessment,
  ExamSubmissionAttemptStatus,
  ExamSubmissionService,
  type ExamSubmissionPersistence,
  type ExamSubmissionRequest,
} from "../src/services/exam-submission.service";
import { AppError } from "../src/utils/app-error";

const deadline = new Date("2026-10-10T18:29:59.999Z");
const fields = { fullName: "Demo Citizen", dateOfBirth: "2000-01-01", gender: "X", mobile: "9000000000", email: "demo@example.test", address: "Demo", qualification: "Degree", examRegion: "North", examCity: "Demo City" };

class MemorySubmissionPersistence implements ExamSubmissionPersistence {
  readonly application: any;
  readonly attempts: any[] = [];
  readonly timeline: any[] = [];
  transactionFailures = 0;

  constructor() {
    this.application = {
      id: randomUUID(), citizenId: "citizen-1", applicationNumber: "JX-EXAM-TEST", status: ExamApplicationStatus.DRAFT,
      paymentStatus: ExamPaymentStatus.NOT_STARTED, submittedAt: null, formData: fields, createdAt: new Date(), updatedAt: new Date(),
      exam: { id: randomUUID(), isDemo: true, applicationDeadlineAt: deadline, applicationTimeZone: "Asia/Kolkata", requirements: [{ id: "required-document", name: "Identity Proof", documentType: "MOCK_AADHAAR_CARD", isRequired: true, issuableServiceSlug: null }] },
      documents: [{ requirementId: "required-document" }], timelineEvents: [], reminder: null,
    };
  }

  async findCitizenId(userId: string) { return userId === "user-1" ? "citizen-1" : null; }

  async transaction<T>(operation: (tx: any) => Promise<T>): Promise<T> {
    if (this.transactionFailures > 0) {
      this.transactionFailures -= 1;
      throw { code: "P2034" };
    }
    return operation(this.tx());
  }

  private tx() {
    return {
      examApplication: {
        findFirst: async ({ where }: any) => where.id === this.application.id && where.citizenId === this.application.citizenId ? this.application : null,
        findUniqueOrThrow: async () => this.application,
        update: async ({ data }: any) => { Object.assign(this.application, data, { updatedAt: new Date() }); return this.application; },
        updateMany: async ({ where, data }: any) => {
          const statuses = where.status?.in as ExamApplicationStatus[] | undefined;
          if (this.application.id !== where.id || (statuses && !statuses.includes(this.application.status))) return { count: 0 };
          Object.assign(this.application, data, { updatedAt: new Date() });
          return { count: 1 };
        },
      },
      examSubmissionAttempt: {
        findUnique: async ({ where }: any) => this.attempts.find((item) => item.idempotencyKey === where.idempotencyKey) ?? null,
        findFirst: async ({ where }: any) => this.attempts.find((item) => item.applicationId === where.applicationId && item.status === where.status) ?? null,
        create: async ({ data }: any) => {
          if (this.attempts.some((item) => item.idempotencyKey === data.idempotencyKey)) throw { code: "P2002" };
          const now = new Date(); const item = { id: randomUUID(), serverAcceptedAt: null, failureCode: null, createdAt: now, updatedAt: now, deliveryAttemptCount: 1, ...data };
          this.attempts.push(item); return item;
        },
        update: async ({ where, data }: any) => {
          const item = this.attempts.find((candidate) => candidate.id === where.id)!;
          const { deliveryAttemptCount, ...rest } = data;
          if (deliveryAttemptCount?.increment) item.deliveryAttemptCount += deliveryAttemptCount.increment;
          Object.assign(item, rest, { updatedAt: new Date() });
          return item;
        },
      },
      examTimelineEvent: { createMany: async ({ data }: any) => { this.timeline.push(...data); return { count: data.length }; } },
    };
  }
}

function request(applicationId: string, idempotencyKey = randomUUID(), clientCapturedAt = new Date("2026-10-10T18:00:00.000Z"), payloadHash = "a".repeat(64)): ExamSubmissionRequest {
  return { applicationId, idempotencyKey, clientCapturedAt, payloadHash };
}

function subject(serverNow = new Date("2026-10-10T18:00:00.000Z")) {
  const persistence = new MemorySubmissionPersistence();
  return { persistence, service: new ExamSubmissionService(persistence, () => new Date(serverNow)) };
}

describe("ExamSubmissionService", () => {
  it("A. accepts a first valid submission and only then records controlled demo payment", async () => {
    const { service, persistence } = subject(); const result = await service.submit("user-1", request(persistence.application.id));
    expect(result.accepted).toBe(true); expect(result.receipt?.status).toBe(ExamSubmissionAttemptStatus.ACCEPTED);
    expect(persistence.application.paymentStatus).toBe(ExamPaymentStatus.SUCCESSFUL); expect(persistence.timeline).toHaveLength(9);
  });

  it("B. returns the original logical result for the same key and payload", async () => {
    const { service, persistence } = subject(); const input = request(persistence.application.id);
    const first = await service.submit("user-1", input); const second = await service.submit("user-1", input);
    expect(second.receipt?.id).toBe(first.receipt?.id); expect(persistence.timeline).toHaveLength(9);
  });

  it("C. rejects a reused key with a different payload hash", async () => {
    const { service, persistence } = subject(); const input = request(persistence.application.id);
    await service.submit("user-1", input);
    await expect(service.submit("user-1", { ...input, payloadHash: "b".repeat(64) })).rejects.toMatchObject<AppError>({ statusCode: 409 });
  });

  it("D. handles a lost response as an idempotent same-key retry", async () => {
    const { service, persistence } = subject(); const input = request(persistence.application.id);
    await service.submit("user-1", input); const recovered = await service.submit("user-1", input);
    expect(recovered.accepted).toBe(true); expect(recovered.receipt?.deliveryAttemptCount).toBe(2);
  });

  it("E. keeps 100 sequential same-key retries to one logical acceptance", async () => {
    const { service, persistence } = subject(); const input = request(persistence.application.id);
    for (let index = 0; index < 100; index += 1) await service.submit("user-1", input);
    expect(persistence.attempts).toHaveLength(1); expect(persistence.timeline).toHaveLength(9); expect(persistence.attempts[0].deliveryAttemptCount).toBe(100);
  });

  it("F. permits only one final acceptance for concurrent different keys", async () => {
    const { service, persistence } = subject();
    const [one, two] = await Promise.all([service.submit("user-1", request(persistence.application.id)), service.submit("user-1", request(persistence.application.id))]);
    expect([one, two].filter((result) => result.receipt?.status === ExamSubmissionAttemptStatus.ACCEPTED)).toHaveLength(1);
    expect(persistence.timeline).toHaveLength(9);
  });

  it("G. classifies a server receipt before the deadline as SERVER_ON_TIME", async () => {
    const { service, persistence } = subject(new Date("2026-10-10T18:29:59.999Z")); const result = await service.submit("user-1", request(persistence.application.id));
    expect(result.receipt?.deadlineAssessment).toBe(ExamDeadlineAssessment.SERVER_ON_TIME);
  });

  it("H. labels a late server receipt with an earlier client claim as unverified and demo-explicit", async () => {
    const { service, persistence } = subject(new Date("2026-10-10T18:30:00.000Z")); const result = await service.submit("user-1", request(persistence.application.id));
    expect(result.receipt?.deadlineAssessment).toBe(ExamDeadlineAssessment.CLIENT_CLAIMED_ON_TIME_UNVERIFIED);
    expect(result.demoPrototypePolicy).toBe("CLIENT_CLAIMED_ON_TIME_UNVERIFIED_ACCEPTED_FOR_DEMO");
  });

  it("I. permanently rejects a server receipt and client claim both after deadline", async () => {
    const { service, persistence } = subject(new Date("2026-10-10T18:30:00.000Z")); const result = await service.submit("user-1", request(persistence.application.id, randomUUID(), new Date("2026-10-10T18:31:00.000Z")));
    expect(result.accepted).toBe(false); expect(result.receipt?.deadlineAssessment).toBe(ExamDeadlineAssessment.SERVER_LATE);
  });

  it("J. does not let backward or forward client clocks override the server deadline", async () => {
    const backward = subject(new Date("2026-10-10T18:30:00.000Z")); const backwardResult = await backward.service.submit("user-1", request(backward.persistence.application.id, randomUUID(), new Date("2000-01-01T00:00:00.000Z")));
    const forward = subject(new Date("2026-10-10T18:00:00.000Z")); const forwardResult = await forward.service.submit("user-1", request(forward.persistence.application.id, randomUUID(), new Date("2100-01-01T00:00:00.000Z")));
    expect(backwardResult.receipt?.deadlineAssessment).toBe(ExamDeadlineAssessment.CLIENT_CLAIMED_ON_TIME_UNVERIFIED);
    expect(forwardResult.receipt?.deadlineAssessment).toBe(ExamDeadlineAssessment.SERVER_ON_TIME);
  });

  it("K. permanently rejects missing documents without marking payment successful", async () => {
    const { service, persistence } = subject(); persistence.application.documents = []; const result = await service.submit("user-1", request(persistence.application.id));
    expect(result.receipt?.status).toBe(ExamSubmissionAttemptStatus.REJECTED_PERMANENT); expect(persistence.application.paymentStatus).toBe(ExamPaymentStatus.NOT_STARTED);
  });

  it("L. returns a stable result when an application is already submitted", async () => {
    const { service, persistence } = subject(); const first = await service.submit("user-1", request(persistence.application.id));
    const later = await service.submit("user-1", request(persistence.application.id));
    expect(later.stableFinalResult).toBe(true); expect(later.receipt?.id).toBe(first.receipt?.id);
  });

  it("M. retries a serialization conflict without duplicate payment or timeline transitions", async () => {
    const { service, persistence } = subject(); persistence.transactionFailures = 1; const result = await service.submit("user-1", request(persistence.application.id));
    expect(result.accepted).toBe(true); expect(persistence.timeline).toHaveLength(9); expect(persistence.attempts).toHaveLength(1);
  });

  it("N. keeps the first serverReceivedAt immutable across retries", async () => {
    const { service, persistence } = subject(); const input = request(persistence.application.id); const first = await service.submit("user-1", input); const received = first.receipt?.serverReceivedAt;
    const second = await service.submit("user-1", input); expect(second.receipt?.serverReceivedAt).toEqual(received);
  });

  it("O. writes serverAcceptedAt only after acceptance", async () => {
    const accepted = subject(); const acceptedResult = await accepted.service.submit("user-1", request(accepted.persistence.application.id));
    const rejected = subject(); rejected.persistence.application.documents = []; const rejectedResult = await rejected.service.submit("user-1", request(rejected.persistence.application.id));
    expect(acceptedResult.receipt?.serverAcceptedAt).toBeInstanceOf(Date); expect(rejectedResult.receipt?.serverAcceptedAt).toBeNull();
  });
});
