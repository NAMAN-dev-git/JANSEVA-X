import { ApplicationStatus, OfficerReviewStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { EmployeeService } from "../src/services/employee.service";
import { presentCompletedItem } from "../src/utils/response-presenters";
import { completedSchema, queueSchema } from "../src/validators/employee.validators";

const officer = { id: "officer-1", userId: "user-1", isActive: true, user: { id: "user-1", role: "OFFICER", isActive: true } };
const query = { page: 1, limit: 10, sortBy: "submittedAt" as const, sortOrder: "asc" as const };

describe("employee dashboard and registry", () => {
  it("validates the registry date range and keeps completed status server-controlled", () => {
    expect(queueSchema.safeParse({ body: {}, params: {}, query: { submittedFrom: "2026-09-14T00:00:00Z", submittedTo: "2026-09-13T00:00:00Z" } }).success).toBe(false);
    expect(completedSchema.safeParse({ body: {}, params: {}, query: { status: "COMPLETED" } }).success).toBe(false);
  });

  it("prevents officers from filtering another officer's assignments", async () => {
    const repository: any = { findOfficerByUserId: async () => officer };
    const service = new EmployeeService(repository);
    await expect(service.queue("user-1", "OFFICER", { ...query, assignedOfficerId: "00000000-0000-4000-8000-000000000002" })).rejects.toMatchObject({ statusCode: 403 });
  });

  it("zero-fills dashboard status counts and retains only scoped repository results", async () => {
    const repository: any = {
      findOfficerByUserId: async () => officer,
      dashboard: async () => ({ total: 2, claimableCount: 1, byStatus: [{ status: ApplicationStatus.SUBMITTED, count: 2 }], byReviewStatus: [{ reviewStatus: OfficerReviewStatus.NOT_ASSIGNED, count: 1 }, { reviewStatus: OfficerReviewStatus.ASSIGNED, count: 1 }], recentApplications: [] }),
    };
    const result = await new EmployeeService(repository).dashboard("user-1", "OFFICER");
    expect(result.total).toBe(2);
    expect(result.claimableCount).toBe(1);
    expect(result.applicationStatusCounts).toMatchObject({ [ApplicationStatus.SUBMITTED]: 2, [ApplicationStatus.COMPLETED]: 0 });
    expect(result.reviewStatusCounts).toMatchObject({ [OfficerReviewStatus.NOT_ASSIGNED]: 1, [OfficerReviewStatus.ASSIGNED]: 1, [OfficerReviewStatus.REVIEWED]: 0 });
  });

  it("returns completed-list pagination from the repository-confirmed total", async () => {
    let received: unknown;
    const repository: any = { findOfficerByUserId: async () => officer, completed: async (input: unknown) => { received = input; return { applications: [], total: 11 }; } };
    const result = await new EmployeeService(repository).completed("user-1", "OFFICER", { page: 1, limit: 10, sortBy: "updatedAt", sortOrder: "desc" });
    expect(result.totalPages).toBe(2);
    expect(received).toMatchObject({ officerId: "officer-1", isAdmin: false });
  });

  it("presents only safe completed-application fields with a derived completion time", () => {
    const completedAt = new Date("2026-09-14T12:00:00.000Z");
    const response = presentCompletedItem({ id: "application-1", applicationNumber: "JSX-1", status: ApplicationStatus.COMPLETED, reviewStatus: OfficerReviewStatus.REVIEWED, service: { id: "service-1", name: "Demo service", slug: "demo-service", isPrototype: true }, citizen: { id: "citizen-1", fullName: "Demo Citizen", city: "Pune", state: "Maharashtra" }, assignedOfficer: null, submittedAt: new Date(), createdAt: new Date(), updatedAt: new Date(), statusHistory: [{ createdAt: completedAt }] });
    expect(response.completedAt).toBe(completedAt);
    expect(response).toMatchObject({ citizen: { fullName: "Demo Citizen" } });
    expect(response).not.toHaveProperty("applicationData");
  });
});
